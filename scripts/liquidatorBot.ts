import { network } from "hardhat";
import type { Contract, Signer } from "ethers";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "frontend", ".env") });

const { ethers } = await network.create();
const provider = ethers.provider;

const POLL_INTERVAL_MS = 10_000;
const LOG_BATCH_SIZE = 2_000;
const DEFAULT_LOG_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const HEALTH_FACTOR_ONE = 10n ** 18n;
const HIGH_RISK_HEALTH_FACTOR = 95n * 10n ** 16n;
const MIN_BOT_BALANCE = ethers.parseEther("0.05");
const LIQUIDATION_BONUS_BPS = 10_500n;
const BPS = 10_000n;

const poolAddress = process.env.VITE_LENDING_POOL_ADDRESS;
const tokenAddress = process.env.VITE_MOCK_USDT_ADDRESS;

const missingAddresses = [
  !poolAddress ? "VITE_LENDING_POOL_ADDRESS" : "",
  !tokenAddress ? "VITE_MOCK_USDT_ADDRESS" : "",
].filter(Boolean);
if (missingAddresses.length > 0) {
  throw new Error(
    `Missing ${missingAddresses.join(" and ")}. Set it in the project root .env or frontend/.env before starting the bot.`,
  );
}
const configuredTokenAddress = tokenAddress ?? "";
const configuredPoolAddress = poolAddress ?? "";
let developerAddress = "";

const pool = new ethers.Contract(configuredPoolAddress, [
  "event Borrow(address indexed borrower, uint256 amount)",
  "event Liquidated(address indexed borrower, address indexed liquidator, uint256 debtRepaid, uint256 collateralSeized)",
  "function getUserAccountData(address) view returns (tuple(uint256 totalCollateralETH,uint256 totalDebtETH,uint256 maxBorrowETH,uint256 healthFactor,uint256 lastUpdateTimestamp))",
  "function getTotalDebt(address) view returns (uint256)",
  "function getCollateralETHValue(uint256) view returns (uint256)",
  "function userCollateral(address) view returns (uint256)",
  "function collateralTokenDecimals() view returns (uint8)",
  "function priceOracle() view returns (address)",
  "function liquidate(address,uint256) payable",
], provider);
const token = new ethers.Contract(configuredTokenAddress, [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address,uint256) returns (bool)",
], provider);

const borrowers = new Set<string>();
const pendingLiquidations = new Set<string>();
let pollRunning = false;

function formatEth(value: bigint): string {
  return ethers.formatEther(value);
}

function formatToken(value: bigint, decimals: number): string {
  return ethers.formatUnits(value, decimals);
}

async function checkAndFundBot(signer: Signer) {
  const botAddress = await signer.getAddress();
  const [ethBalance, tokenBalance, tokenDecimals] = await Promise.all([
    provider.getBalance(botAddress),
    token.balanceOf(botAddress),
    token.decimals(),
  ]);
  console.log(`[BOT BALANCE] ETH: ${formatEth(ethBalance)} | mUSDT: ${formatToken(tokenBalance, Number(tokenDecimals))}`);
  if (ethBalance < MIN_BOT_BALANCE) {
    console.warn(`[BOT WARNING] Top up gas/liquidity. ETH balance is below ${formatEth(MIN_BOT_BALANCE)} ETH.`);
  }
}

async function discoverBorrowers() {
  const latestBlock = await provider.getBlockNumber();
  const configuredStartBlock = Number(process.env.BOT_START_BLOCK ?? 0);
  if (!Number.isInteger(configuredStartBlock) || configuredStartBlock < 0) {
    throw new Error("BOT_START_BLOCK must be a non-negative integer when provided.");
  }

  const startBlock = Math.min(configuredStartBlock, latestBlock);
  const logRpcUrl = process.env.VITE_LOG_RPC_URL ?? DEFAULT_LOG_RPC_URL;
  const logProvider = new ethers.JsonRpcProvider(logRpcUrl);
  const logPool = pool.connect(logProvider);

  try {
    for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += LOG_BATCH_SIZE) {
      const toBlock = Math.min(fromBlock + LOG_BATCH_SIZE - 1, latestBlock);
      const events = await logPool.queryFilter(logPool.filters.Borrow(), fromBlock, toBlock);
      for (const event of events) {
        const borrower = "args" in event ? event.args?.[0] : undefined;
        if (typeof borrower === "string") borrowers.add(ethers.getAddress(borrower));
      }
    }
  } catch (error) {
    console.warn(
      `[BOT WARNING] Historical Borrow discovery unavailable through ${logRpcUrl}. ` +
      "The bot will continue with live Borrow events. Set BOT_START_BLOCK to the deployment block " +
      "or configure VITE_LOG_RPC_URL with an RPC that supports eth_getLogs.",
      error,
    );
  }
  console.log(`[BOT] Tracking ${borrowers.size} borrower(s).`);
}

async function gasOverrides(healthFactor: bigint) {
  const feeData = await provider.getFeeData();
  const standardPriority = feeData.maxPriorityFeePerGas ?? feeData.gasPrice;
  const standardMaxFee = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (standardPriority === null || standardMaxFee === null) {
    throw new Error("Provider did not return usable gas fee data.");
  }

  if (healthFactor < HIGH_RISK_HEALTH_FACTOR) {
    const boostedPriority = standardPriority * 2n;
    console.log("[GAS BOOST] Applying 2x priority fee adjustment.");
    return {
      maxPriorityFeePerGas: boostedPriority,
      maxFeePerGas: standardMaxFee + (boostedPriority - standardPriority),
    };
  }
  return {
    maxPriorityFeePerGas: standardPriority,
    maxFeePerGas: standardMaxFee,
  };
}

async function evaluateBorrower(
  borrower: string,
  signer: Signer,
  tokenDecimals: number,
  oracleDecimals: number,
  oracle: Contract,
) {
  if (pendingLiquidations.has(borrower)) return;

  const data = await pool.getUserAccountData(borrower);
  const healthFactor = data.healthFactor as bigint;
  if (healthFactor >= HEALTH_FACTOR_ONE) return;

  const debtToCover = (await pool.getTotalDebt(borrower)) as bigint;
  const collateral = (await pool.userCollateral(borrower)) as bigint;
  if (debtToCover === 0n || collateral === 0n) return;

  console.log(`[LIQUIDATION DETECTED] Borrower: ${borrower} | HF: ${ethers.formatUnits(healthFactor, 18)} | Debt: ${formatEth(debtToCover)} ETH`);

  const [, answer] = await oracle.latestRoundData();
  if (answer <= 0n) throw new Error("Oracle returned a non-positive price.");
  const ethPriceUsd18 = (answer * 10n ** 18n) / 10n ** BigInt(oracleDecimals);
  const debtValueUsd18 = (debtToCover * ethPriceUsd18) / 10n ** 18n;
  const bonusCollateral = (debtValueUsd18 * LIQUIDATION_BONUS_BPS) / BPS;
  const expectedSeized = (bonusCollateral * 10n ** BigInt(tokenDecimals)) / 10n ** 18n;
  const seized = expectedSeized > collateral ? collateral : expectedSeized;
  const seizedValueEth = await pool.getCollateralETHValue(seized) as bigint;
  const overrides = await gasOverrides(healthFactor);
  const liquidate = pool.connect(signer).getFunction("liquidate");
  const liquidationLimit = debtToCover + ethers.parseEther("0.001");
  const gasEstimate = await liquidate.estimateGas(borrower, liquidationLimit, {
    value: liquidationLimit,
    ...overrides,
  });
  const gasCost = gasEstimate * (overrides.maxFeePerGas ?? 0n);
  const netProfitEth = seizedValueEth - debtToCover - gasCost;
  if (netProfitEth <= 0n) {
    console.log(`[BOT SKIP] ${borrower} is not profitable after gas.`);
    return;
  }

  pendingLiquidations.add(borrower);
  try {
    const botAddress = await signer.getAddress();
    const before = BigInt(await token.balanceOf(botAddress));
    const transaction = await liquidate(borrower, liquidationLimit, {
      value: liquidationLimit,
      ...overrides,
    });
    const receipt = await transaction.wait();
    if (!receipt) throw new Error("Liquidation receipt was not returned.");

    const after = BigInt(await token.balanceOf(botAddress));
    const received = after - before;
    console.log(`[SUCCESS] Tx Hash: ${transaction.hash} | Seized mUSDT: ${formatToken(received, tokenDecimals)} | Net Profit: ${formatEth(netProfitEth)} ETH`);

    const profitTokens = (netProfitEth * ethPriceUsd18 / 10n ** 18n) * 10n ** BigInt(tokenDecimals) / ethPriceUsd18;
    const routed = profitTokens > received ? received : profitTokens;
    if (routed > 0n) {
      const routedToken = new ethers.Contract(configuredTokenAddress, ["function transfer(address,uint256) returns (bool)"], signer);
      const transfer = await routedToken.getFunction("transfer")(developerAddress, routed);
      await transfer.wait();
      console.log(`[PROFIT ROUTED] Sent ${formatToken(routed, tokenDecimals)} mUSDT / ETH profit to Developer Wallet: ${developerAddress}`);
    }
  } catch (error) {
    console.error(`[BOT ERROR] Liquidation failed for ${borrower}:`, error);
  } finally {
    pendingLiquidations.delete(borrower);
  }
}

async function poll(signer: Signer) {
  if (pollRunning) return;
  pollRunning = true;
  try {
    const [rawTokenDecimals, rawOracleAddress] = await Promise.all([
      token.decimals(),
      pool.priceOracle(),
    ]);
    const tokenDecimals = Number(rawTokenDecimals);
    const oracleAddress = String(rawOracleAddress);
    const oracle = new ethers.Contract(oracleAddress, [
      "function decimals() view returns(uint8)",
      "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)",
    ], provider);
    const oracleDecimals = Number(await oracle.decimals());
    await Promise.all([...borrowers].map((borrower) =>
      evaluateBorrower(borrower, signer, tokenDecimals, oracleDecimals, oracle),
    ));
  } catch (error) {
    console.error("[BOT ERROR] Poll failed:", error);
  } finally {
    pollRunning = false;
  }
}

const signer = await ethers.getSigners().then(([first]) => first);
const configuredDeveloperWallet = process.env.DEVELOPER_WALLET;
if (configuredDeveloperWallet) {
  if (!ethers.isAddress(configuredDeveloperWallet)) {
    throw new Error(`Invalid DEVELOPER_WALLET address: ${configuredDeveloperWallet}`);
  }
  developerAddress = ethers.getAddress(configuredDeveloperWallet);
  console.log(`[BOT CONFIG] Beneficiary Wallet set to: ${developerAddress}`);
} else {
  developerAddress = await signer.getAddress();
  console.log(`[BOT CONFIG] Beneficiary Wallet set to: ${developerAddress} (Fallback to deployer/signer)`);
}
await checkAndFundBot(signer);
await discoverBorrowers();
pool.on(pool.filters.Borrow(), (borrower: string) => borrowers.add(ethers.getAddress(borrower)));
await poll(signer);
setInterval(() => void poll(signer), POLL_INTERVAL_MS);
console.log(`[BOT] Liquidator bot running. Poll interval: ${POLL_INTERVAL_MS / 1000}s.`);
