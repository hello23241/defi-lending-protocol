import { network } from "hardhat";
import { type Contract, type Signer, ethers } from "ethers";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// ============================================================================
// 1. CẤU HÌNH & HẰNG SỐ
// ============================================================================
const POLL_INTERVAL_MS = 10_000;
const MULTICALL_BATCH_SIZE = 100; // Số borrower gom trong 1 RPC call qua Multicall3
const HEALTH_FACTOR_ONE = 10n ** 18n;
const HIGH_RISK_HEALTH_FACTOR = 95n * 10n ** 16n;
const MIN_BOT_BALANCE = ethers.parseEther("0.05");
const MIN_COLLATERAL_THRESHOLD = ethers.parseUnits("0.01", 18);
const LIQUIDATION_BONUS_BPS = 10_500n;
const BPS = 10_000n;

// Canonical Multicall3 Contract Address trên Sepolia / EVM
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

const poolAddress = process.env.VITE_LENDING_POOL_ADDRESS;
const tokenAddress = process.env.VITE_MOCK_USDT_ADDRESS;
const MANUAL_BORROWERS: string[] = [];

const missingAddresses = [
  !poolAddress ? "VITE_LENDING_POOL_ADDRESS" : "",
  !tokenAddress ? "VITE_MOCK_USDT_ADDRESS" : "",
].filter(Boolean);

if (missingAddresses.length > 0) {
  throw new Error(`Missing ${missingAddresses.join(" and ")}. Set it in your .env file.`);
}

const configuredTokenAddress = tokenAddress!;
const configuredPoolAddress = poolAddress!;
let developerAddress = "";

// ============================================================================
// 2. DATABASE PERSISTENCE (SQLite WAL MODE)
// ============================================================================
const db = new Database("bot_state.db");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS checkpoints (
    key TEXT PRIMARY KEY,
    block_number INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS borrowers (
    address TEXT PRIMARY KEY,
    updated_at INTEGER NOT NULL
  );
`);

function getSavedCheckpointBlock(defaultBlock: number): number {
  const row = db.prepare("SELECT block_number FROM checkpoints WHERE key = 'last_scanned_block'").get() as
    | { block_number: number }
    | undefined;
  return row ? row.block_number : defaultBlock;
}

function saveBorrowersAndCheckpoint(newBorrowers: string[], blockNumber: number) {
  const insertBorrower = db.prepare("INSERT OR IGNORE INTO borrowers (address, updated_at) VALUES (?, ?)");
  const updateCheckpoint = db.prepare("INSERT OR REPLACE INTO checkpoints (key, block_number) VALUES ('last_scanned_block', ?)");

  const atomicTransaction = db.transaction(() => {
    const now = Date.now();
    for (const borrower of newBorrowers) {
      if (ethers.isAddress(borrower)) {
        insertBorrower.run(ethers.getAddress(borrower), now);
      }
    }
    updateCheckpoint.run(blockNumber);
  });

  atomicTransaction();
}

function removeBorrowerFromDb(address: string) {
  db.prepare("DELETE FROM borrowers WHERE address = ?").run(ethers.getAddress(address));
}

function getAllTrackedBorrowers(): string[] {
  const rows = db.prepare("SELECT address FROM borrowers").all() as { address: string }[];
  return rows.map((r) => r.address);
}

// ============================================================================
// 3. CONTRACTS & PROVIDER INITIALIZATION
// ============================================================================
const { ethers: hardhatEthers } = await network.create();
const provider = hardhatEthers.provider;

const POOL_ABI = [
  "event Borrow(address indexed borrower, uint256 amount)",
  "event Liquidated(address indexed borrower, address indexed liquidator, uint256 debtRepaid, uint256 collateralSeized)",
  "function getUserAccountData(address) view returns (tuple(uint256 totalCollateralETH,uint256 totalDebtETH,uint256 maxBorrowETH,uint256 healthFactor,uint256 lastUpdateTimestamp))",
  "function getTotalDebt(address) view returns (uint256)",
  "function getCollateralETHValue(uint256) view returns (uint256)",
  "function userCollateral(address) view returns (uint256)",
  "function collateralTokenDecimals() view returns (uint8)",
  "function priceOracle() view returns (address)",
  "function liquidate(address,uint256) payable",
];

const pool = new ethers.Contract(configuredPoolAddress, POOL_ABI, provider);

const token = new ethers.Contract(
  configuredTokenAddress,
  [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function transfer(address,uint256) returns (bool)",
  ],
  provider
);

const multicall = new ethers.Contract(
  MULTICALL3_ADDRESS,
  [
    "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])",
  ],
  provider
);

const pendingLiquidations = new Set<string>();
let pollRunning = false;
let lastBorrowScanWarning = 0;

// ============================================================================
// 4. TIỆN ÍCH HELPER & EXPONENTIAL BACKOFF
// ============================================================================
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    console.warn(`[BOT WARNING] Nạp thêm gas! Số dư ETH hiện dưới ngưỡng ${formatEth(MIN_BOT_BALANCE)} ETH.`);
  }
}

async function queryLogsWithRetry(
  contract: Contract,
  filter: any,
  fromBlock: number,
  toBlock: number,
  maxRetries = 2
): Promise<any[]> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await contract.queryFilter(filter, fromBlock, toBlock);
    } catch (error: any) {
      attempt++;
      if (attempt >= maxRetries) {
        throw new Error(`RPC thất bại sau ${maxRetries} lần thử: ${error?.message || error}`);
      }
      const delay = 1500 * attempt;
      console.warn(`[RPC RETRY] Dải ${fromBlock}-${toBlock} thử lại (${attempt}/${maxRetries}) sau ${delay}ms...`);
      await sleep(delay);
    }
  }
  return [];
}

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const BORROW_EVENT_TOPIC = ethers.id("Borrow(address,uint256)");

async function fetchBorrowersFromEtherscan(fromBlock: number, toBlock: number | string = "latest"): Promise<string[]> {
  console.log(`[ETHERSCAN FALLBACK] Chuyển hướng cào logs từ block ${fromBlock} đến ${toBlock} qua Etherscan V2...`);

  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("chainid", "11155111"); // Sepolia Chain ID
  url.searchParams.set("module", "logs");
  url.searchParams.set("action", "getLogs");
  url.searchParams.set("address", configuredPoolAddress);
  url.searchParams.set("fromBlock", fromBlock.toString());
  url.searchParams.set("toBlock", toBlock.toString());
  url.searchParams.set("topic0", BORROW_EVENT_TOPIC);
  if (ETHERSCAN_API_KEY) {
    url.searchParams.set("apikey", ETHERSCAN_API_KEY);
  }

  const response = await fetch(url.toString());
  const data = (await response.json()) as {
    status?: string;
    message?: string;
    result?: any;
  };

  if (data.status === "0" && data.message !== "No records found") {
    throw new Error(`Etherscan API từ chối: ${data.result || data.message}`);
  }

  const logs: any[] = Array.isArray(data.result) ? data.result : [];
  const discovered: string[] = [];

  for (const log of logs) {
    if (log.topics && log.topics[1]) {
      try {
        discovered.push(ethers.getAddress("0x" + log.topics[1].slice(26)));
      } catch {
        // Bỏ qua nếu địa chỉ không hợp lệ
      }
    }
  }

  console.log(`[ETHERSCAN FALLBACK] Cào thành công ${discovered.length} Borrow event(s) qua Etherscan V2.`);
  return discovered;
}

// ============================================================================
// 5. QUÉT LOG LỊCH SỬ KÈM TỰ ĐỘNG CHUYỂN HƯỚNG FALLBACK
// ============================================================================
async function discoverBorrowers() {
  const latestBlock = await provider.getBlockNumber();
  const configuredStartBlock = process.env.BOT_START_BLOCK ? Number(process.env.BOT_START_BLOCK) : latestBlock;
  const initialTargetBlock = Number.isInteger(configuredStartBlock) && configuredStartBlock >= 0 ? configuredStartBlock : latestBlock;

  const savedLastBlock = getSavedCheckpointBlock(initialTargetBlock);
  const startBlock = Math.min(Math.max(savedLastBlock - 32, initialTargetBlock), latestBlock);

  console.log(`[BOT] Quét historical Borrow events từ block ${startBlock} đến ${latestBlock} (${latestBlock - startBlock} blocks)...`);

  let currentFrom = startBlock;
  const CHUNK_SIZE = 500;

  while (currentFrom <= latestBlock) {
    const currentTo = Math.min(currentFrom + CHUNK_SIZE - 1, latestBlock);

    try {
      const events = await queryLogsWithRetry(pool, pool.filters.Borrow(), currentFrom, currentTo, 2);

      const discovered: string[] = [];
      for (const event of events) {
        const borrower = "args" in event ? event.args?.[0] : undefined;
        if (typeof borrower === "string") discovered.push(borrower);
      }

      saveBorrowersAndCheckpoint(discovered, currentTo);
      console.log(`[RPC SYNC] Blocks ${currentFrom} -> ${currentTo}. Tổng ví theo dõi: ${getAllTrackedBorrowers().length}`);

      currentFrom = currentTo + 1;
      await sleep(150);
    } catch (rpcError: any) {
      console.warn(`[RPC FAILED] Chunk ${currentFrom}-${currentTo} bị RPC từ chối: ${rpcError?.message || rpcError}`);
      console.log(`[TRIGGER FALLBACK] Kích hoạt Etherscan API để quét từ block ${currentFrom} đến ${latestBlock}...`);

      try {
        const etherscanBorrowers = await fetchBorrowersFromEtherscan(currentFrom, latestBlock);
        saveBorrowersAndCheckpoint(etherscanBorrowers, latestBlock);
        console.log(`[FALLBACK SUCCESS] Đã lưu ${etherscanBorrowers.length} ví từ Etherscan. DB hiện có: ${getAllTrackedBorrowers().length} ví.`);
        break;
      } catch (fallbackError) {
        console.error(`[CRITICAL] Cả RPC và Etherscan Fallback đều thất bại:`, fallbackError);
        saveBorrowersAndCheckpoint([], currentFrom);
        break;
      }
    }
  }

  console.log(`[BOT READY] Đồng bộ lịch sử hoàn tất. Đang giám sát ${getAllTrackedBorrowers().length} borrower(s).`);
}

async function refreshBorrowers() {
  const latestBlock = await provider.getBlockNumber();
  const lastScanned = getSavedCheckpointBlock(latestBlock);
  const fromBlock = lastScanned + 1;
  if (fromBlock > latestBlock) return;

  try {
    const events = await queryLogsWithRetry(pool, pool.filters.Borrow(), fromBlock, latestBlock, 2);
    const discovered: string[] = [];
    for (const event of events) {
      const borrower = "args" in event ? event.args?.[0] : undefined;
      if (typeof borrower === "string") discovered.push(borrower);
    }
    saveBorrowersAndCheckpoint(discovered, latestBlock);
  } catch (error) {
    if (Date.now() - lastBorrowScanWarning > 60_000) {
      console.warn("[BOT WARNING] Quét log gia tăng thất bại; bot vẫn kiểm tra các ví hiện có.", error);
      lastBorrowScanWarning = Date.now();
    }
  }
}

// ============================================================================
// 6. GAS OVERRIDES & EXECUTION LOGIC
// ============================================================================
async function gasOverrides(healthFactor: bigint) {
  const feeData = await provider.getFeeData();
  const standardPriority = feeData.maxPriorityFeePerGas ?? feeData.gasPrice ?? 1_000_000_000n;
  const standardMaxFee = feeData.maxFeePerGas ?? feeData.gasPrice ?? 2_000_000_000n;

  if (healthFactor < HIGH_RISK_HEALTH_FACTOR) {
    const boostedPriority = standardPriority * 2n;
    console.log("[GAS BOOST] Áp dụng x2 priority fee cho vị thế nguy cấp.");
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

async function executeLiquidation(
  borrower: string,
  healthFactor: bigint,
  debtToCover: bigint,
  signer: Signer,
  tokenDecimals: number,
  oracleDecimals: number,
  oracle: Contract
) {
  if (pendingLiquidations.has(borrower)) return;

  console.log(`[LIQUIDATION TRIGGERED] Phát hiện ví nợ xấu ${borrower} | HF: ${ethers.formatUnits(healthFactor, 18)}`);

  let collateral: bigint;
  try {
    collateral = (await pool.userCollateral(borrower)) as bigint;
  } catch (error) {
    console.error(`[BOT ERROR] Không thể đọc collateral của ${borrower}:`, error);
    return;
  }
  if (debtToCover === 0n || collateral === 0n) return;

  const [, answer] = await oracle.latestRoundData();
  if (answer <= 0n) throw new Error("Oracle trả về giá không hợp lệ.");

  const ethPriceUsd18 = (answer * 10n ** 18n) / 10n ** BigInt(oracleDecimals);
  const debtValueUsd18 = (debtToCover * ethPriceUsd18) / 10n ** 18n;
  const bonusCollateral = (debtValueUsd18 * LIQUIDATION_BONUS_BPS) / BPS;
  const expectedSeized = (bonusCollateral * 10n ** BigInt(tokenDecimals)) / 10n ** 18n;
  const seized = expectedSeized > collateral ? collateral : expectedSeized;
  const seizedValueEth = (await pool.getCollateralETHValue(seized)) as bigint;

  const overrides = await gasOverrides(healthFactor);
  const liquidateFn = pool.connect(signer).getFunction("liquidate");
  const liquidationLimit = debtToCover + ethers.parseEther("0.001");

  let gasCost = 0n;
  try {
    const gasEstimate = await liquidateFn.estimateGas(borrower, liquidationLimit, {
      value: liquidationLimit,
      ...overrides,
    });
    gasCost = gasEstimate * (overrides.maxFeePerGas ?? 0n);
  } catch (error) {
    console.warn(`[BOT WARNING] Estimate gas thất bại cho ${borrower}, có thể vừa được trả nợ.`);
    return;
  }

  const netProfitEth = seizedValueEth - debtToCover - gasCost;
  if (netProfitEth <= 0n) {
    console.warn(`[UNPROFITABLE] Bỏ qua ${borrower}. Lợi nhuận âm sau phí gas (${formatEth(netProfitEth)} ETH).`);
    return;
  }

  pendingLiquidations.add(borrower);
  try {
    const botAddress = await signer.getAddress();
    const before = BigInt(await token.balanceOf(botAddress));

    const transaction = await liquidateFn(borrower, liquidationLimit, {
      value: liquidationLimit,
      ...overrides,
    });
    console.log(`[SENT] Tx Hash: ${transaction.hash}. Chờ xác nhận block...`);
    const receipt = await transaction.wait();
    if (!receipt) throw new Error("Không nhận được receipt giao dịch.");

    const after = BigInt(await token.balanceOf(botAddress));
    const received = after - before;
    console.log(`[SUCCESS] Đã thanh lý ${borrower}! Seized mUSDT: ${formatToken(received, tokenDecimals)} | Lãi ròng ước tính: ${formatEth(netProfitEth)} ETH`);

    const netProfitUsd18 = (netProfitEth * ethPriceUsd18) / 10n ** 18n;
    const profitTokens = (netProfitUsd18 * 10n ** BigInt(tokenDecimals)) / 10n ** 18n;
    const routed = profitTokens > received ? received : profitTokens;
    if (routed > 0n && developerAddress) {
      const routedToken = new ethers.Contract(configuredTokenAddress, ["function transfer(address,uint256) returns (bool)"], signer);
      const transferTx = await routedToken.getFunction("transfer")(developerAddress, routed);
      await transferTx.wait();
      console.log(`[PROFIT ROUTED] Đã chuyển ${formatToken(routed, tokenDecimals)} mUSDT lợi nhuận về ví Developer: ${developerAddress}`);
    }
  } catch (error) {
    console.error(`[BOT ERROR] Thanh lý thất bại cho ${borrower}:`, error);
  } finally {
    pendingLiquidations.delete(borrower);
  }
}

// ============================================================================
// 7. MASS HEALTH CHECKING BẰNG MULTICALL3
// ============================================================================
async function evaluateAllBorrowers(
  signer: Signer,
  tokenDecimals: number,
  oracleDecimals: number,
  oracle: Contract
) {
  const trackedBorrowers = getAllTrackedBorrowers();
  if (trackedBorrowers.length === 0) return;

  for (let i = 0; i < trackedBorrowers.length; i += MULTICALL_BATCH_SIZE) {
    const chunk = trackedBorrowers.slice(i, i + MULTICALL_BATCH_SIZE);
    const calls = chunk.map((borrower) => ({
      target: configuredPoolAddress,
      allowFailure: true,
      callData: pool.interface.encodeFunctionData("getUserAccountData", [borrower]),
    }));

    let results: any[];
    try {
      results = await multicall.aggregate3(calls);
    } catch (error) {
      console.error("[MULTICALL ERROR] Lỗi khi aggregate3 trạng thái người vay:", error);
      continue;
    }

    for (let j = 0; j < results.length; j++) {
      const { success, returnData } = results[j];
      const borrower = chunk[j];
      if (!success || returnData === "0x") continue;

      try {
        const decoded = pool.interface.decodeFunctionResult("getUserAccountData", returnData);
        const data = decoded[0];
        const healthFactor = data.healthFactor as bigint;
        const totalDebtETH = data.totalDebtETH as bigint;
        const totalCollateralBase = (data.totalCollateralBase ?? data.totalCollateralETH) as bigint;

        if (totalCollateralBase < MIN_COLLATERAL_THRESHOLD && totalDebtETH === 0n) {
          removeBorrowerFromDb(borrower);
          console.log(`[CLEANUP] Xóa borrower rác ${borrower} khỏi DB theo dõi.`);
          continue;
        }

        if (healthFactor < HEALTH_FACTOR_ONE && totalDebtETH > 0n) {
          await executeLiquidation(borrower, healthFactor, totalDebtETH, signer, tokenDecimals, oracleDecimals, oracle);
        }
      } catch (err) {
        console.error(`[DECODE ERROR] Không thể giải mã dữ liệu của ví ${borrower}:`, err);
      }
    }
  }
}

// ============================================================================
// 8. VÒNG LẶP POLLING & MAIN ENTRY POINT
// ============================================================================
async function poll(signer: Signer) {
  if (pollRunning) return;
  pollRunning = true;
  try {
    await refreshBorrowers();
    const totalTracked = getAllTrackedBorrowers().length;
    console.log(`[POLL] Đang giám sát sức khỏe của ${totalTracked} borrower(s)...`);

    const [rawTokenDecimals, rawOracleAddress] = await Promise.all([
      token.decimals(),
      pool.priceOracle(),
    ]);
    const tokenDecimals = Number(rawTokenDecimals);
    const oracle = new ethers.Contract(
      String(rawOracleAddress),
      [
        "function decimals() view returns (uint8)",
        "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
      ],
      provider
    );
    const oracleDecimals = Number(await oracle.decimals());

    await evaluateAllBorrowers(signer, tokenDecimals, oracleDecimals, oracle);
  } catch (error) {
    console.error("[BOT ERROR] Chu kỳ poll gặp sự cố:", error);
  } finally {
    pollRunning = false;
  }
}

async function main() {
  const signer = await hardhatEthers.getSigners().then(([first]) => first);
  const configuredDeveloperWallet = process.env.DEVELOPER_WALLET;

  if (configuredDeveloperWallet) {
    if (!ethers.isAddress(configuredDeveloperWallet)) {
      throw new Error(`Invalid DEVELOPER_WALLET address: ${configuredDeveloperWallet}`);
    }
    developerAddress = ethers.getAddress(configuredDeveloperWallet);
    console.log(`[BOT CONFIG] Ví thụ hưởng lợi nhuận: ${developerAddress}`);
  } else {
    developerAddress = await signer.getAddress();
    console.log(`[BOT CONFIG] Ví thụ hưởng mặc định (Signer): ${developerAddress}`);
  }

  await checkAndFundBot(signer);

  const seedBorrowers = [...MANUAL_BORROWERS, ...(process.env.TARGET_BORROWER ?? "").split(",").filter(Boolean)];
  if (seedBorrowers.length > 0) {
    saveBorrowersAndCheckpoint(seedBorrowers, getSavedCheckpointBlock(0));
  }

  await discoverBorrowers();

  try {
    pool.on(pool.filters.Borrow(), (borrower: string) => {
      saveBorrowersAndCheckpoint([borrower], getSavedCheckpointBlock(0));
    });
  } catch (error) {
    console.warn("[BOT WARNING] Đăng ký WebSocket/Event thất bại; bot sẽ dựa vào Polling định kỳ.");
  }

  await poll(signer);
  setInterval(() => void poll(signer), POLL_INTERVAL_MS);
  console.log(`[BOT] Liquidator Bot đang chạy. Chu kỳ kiểm tra: ${POLL_INTERVAL_MS / 1000}s.`);
}

process.on("SIGINT", () => {
  console.log("\n[BOT SHUTDOWN] Đang đóng kết nối Database và dừng bot...");
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  db.close();
  process.exit(0);
});

main().catch((err) => {
  console.error("[FATAL ERROR]", err);
  db.close();
  process.exit(1);
});