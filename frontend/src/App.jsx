import { useEffect, useState } from "react";
import { ethers } from "ethers";
import LendingPoolABI from "./abis/LendingPool.json";
import "./App.css";

const translations = {
  en: {
    asset: "ASSET",
    rates: "RATES (SUPPLY / BORROW)",
    supplyApy: "Supply APY",
    borrowApy: "Borrow APY",
    poolUtilization: "POOL UTILIZATION",
    yourLending: "YOUR LENDING",
    depositedShare: "Deposited Share",
    projectedYearlyEarnings: "Projected Yearly Earnings",
    yourCollateral: "YOUR COLLATERAL",
    stakedCollateral: "Staked Collateral",
    borrowCapacity: "Borrow Capacity / Power",
    yourActiveDebt: "YOUR ACTIVE DEBT",
    borrowedDebt: "Borrowed Debt",
    viewInWei: "View in Wei",
    viewInEth: "View in ETH",
    projectedYearlyInterest: "Projected Yearly Interest",
    healthFactor: "Health Factor",
    lendSupply: "Lend / Supply",
    borrowCollateral: "Borrow / Collateral",
    availableToSupply: "Available to supply",
    suppliedBalance: "Your supplied balance",
    supply: "Supply",
    withdraw: "Withdraw",
    supplyEth: "Supply ETH",
    withdrawEth: "Withdraw ETH",
    amountToSupply: "Amount to supply",
    amountToWithdraw: "Amount to withdraw",
    musdtCollateral: "mUSDT Collateral",
    ethBorrowing: "ETH Borrowing",
    depositCollateral: "Deposit Collateral",
    withdrawCollateral: "Withdraw Collateral",
    borrowEth: "Borrow ETH",
    repayEth: "Repay ETH",
    amountToDeposit: "Amount to deposit",
    amountToBorrow: "Amount to borrow",
    amountToRepay: "Amount to repay",
    safeMaxWithdrawable: "Safe Max Withdrawable",
    maxBorrowAllowed: "Max Borrow Allowed",
    currentDebt: "Current Debt",
    available: "Available",
    staked: "Staked",
    confirm: "Confirm",
    refreshError: "Unable to refresh on-chain position.",
    transactionPending: "Transaction pending...",
    trade: "Trade ETH for mUSDT",
    adminMint: "Admin mint 100k mUSDT",
    oracle: "Set oracle price",
    oraclePrice: "ETH price (USD)",
    setPrice: "Set price",
    close: "Close",
    amountToTrade: "Amount to receive",
    tradeHint: "The required ETH will be calculated from the oracle price.",
    minting: "Minting...",
    mintSuccess: "Successfully traded ETH for mUSDT!",
    adminMintSuccess: "Successfully minted 100,000 mUSDT for free!",
    oracleSuccess: "Oracle price updated for 2 minutes.",
    mintFailed: "Mint failed",
    adminMintFailed: "Admin mint failed",
    oracleFailed: "Oracle update failed",
    installWallet: "Please install MetaMask to connect your wallet.",
    walletRejected: "Wallet request was rejected.",
    transactionFailed: "Transaction failed",
    depositFailed: "Deposit failed",
    withdrawFailed: "Withdraw failed",
    depositCollateralFailed: "Deposit collateral failed",
    withdrawCollateralFailed: "Withdraw collateral failed",
    borrowFailed: "Borrow failed",
    repayFailed: "Repay failed",
  },
  vi: {
    asset: "TÀI SẢN",
    rates: "LÃI SUẤT (GỬI / VAY)",
    supplyApy: "Lãi suất Gửi (APY)",
    borrowApy: "Lãi suất Vay (APY)",
    poolUtilization: "TỶ LỆ SỬ DỤNG HỒ",
    yourLending: "KHOẢN GỬI CỦA BẠN",
    depositedShare: "Số dư đã gửi",
    projectedYearlyEarnings: "Lợi nhuận Dự kiến / Năm",
    yourCollateral: "TÀI SẢN THẾ CHẤP",
    stakedCollateral: "Tài sản đã thế chấp",
    borrowCapacity: "Hạn mức Vay tối đa",
    yourActiveDebt: "KHOẢN VAY HIỆN TẠI",
    borrowedDebt: "Dư nợ Vay",
    viewInWei: "Xem bằng Wei",
    viewInEth: "Xem bằng ETH",
    projectedYearlyInterest: "Lãi vay Dự kiến / Năm",
    healthFactor: "Chỉ số An toàn (HF)",
    lendSupply: "Gửi Tiền / Cung Cấp",
    borrowCollateral: "Vay / Thế Chấp",
    availableToSupply: "Số dư ETH khả dụng",
    suppliedBalance: "Số dư đã gửi",
    supply: "Gửi Tiền",
    withdraw: "Rút Tiền",
    supplyEth: "Cung cấp ETH vào Hồ thanh khoản",
    withdrawEth: "Rút ETH khỏi Hồ",
    amountToSupply: "Số lượng muốn gửi",
    amountToWithdraw: "Số lượng muốn rút",
    musdtCollateral: "Tài sản thế chấp (mUSDT)",
    ethBorrowing: "Vay ETH",
    depositCollateral: "Nạp thế chấp",
    withdrawCollateral: "Rút thế chấp",
    borrowEth: "Vay ETH",
    repayEth: "Trả Nợ ETH",
    amountToDeposit: "Số lượng muốn nạp",
    amountToBorrow: "Số lượng muốn vay",
    amountToRepay: "Số lượng muốn trả",
    safeMaxWithdrawable: "Mức rút an toàn tối đa",
    maxBorrowAllowed: "Hạn mức vay tối đa",
    currentDebt: "Dư nợ hiện tại",
    available: "Khả dụng",
    staked: "Đã thế chấp",
    confirm: "Xác nhận",
    refreshError: "Không thể cập nhật trạng thái on-chain.",
    transactionPending: "Giao dịch đang chờ...",
    trade: "Đổi ETH lấy mUSDT",
    adminMint: "Đúc miễn phí 100k mUSDT",
    oracle: "Đặt giá oracle",
    oraclePrice: "Giá ETH (USD)",
    setPrice: "Đặt giá",
    close: "Đóng",
    amountToTrade: "Số lượng nhận",
    tradeHint: "Lượng ETH cần trả sẽ được tính theo giá oracle.",
    minting: "Đang xử lý...",
    mintSuccess: "Đã đổi ETH lấy mUSDT thành công!",
    adminMintSuccess: "Đã đúc miễn phí thành công 100.000 mUSDT!",
    oracleSuccess: "Đã cập nhật giá oracle trong 2 phút.",
    mintFailed: "Đúc token thất bại",
    adminMintFailed: "Đúc miễn phí thất bại",
    oracleFailed: "Cập nhật oracle thất bại",
    installWallet: "Vui lòng cài đặt MetaMask để kết nối ví.",
    walletRejected: "Yêu cầu từ ví đã bị từ chối.",
    transactionFailed: "Giao dịch thất bại",
    depositFailed: "Gửi tiền thất bại",
    withdrawFailed: "Rút tiền thất bại",
    depositCollateralFailed: "Nạp tài sản thế chấp thất bại",
    withdrawCollateralFailed: "Rút tài sản thế chấp thất bại",
    borrowFailed: "Vay thất bại",
    repayFailed: "Trả nợ thất bại",
  },
};

const LENDING_POOL_ADDRESS = import.meta.env.VITE_LENDING_POOL_ADDRESS;
const MOCK_USDT_ADDRESS = import.meta.env.VITE_MOCK_USDT_ADDRESS;
const ORACLE_ADDRESS = import.meta.env.VITE_ORACLE_ADDRESS;
const USDT_DECIMALS = 18;
const SEPOLIA_RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL
  || "https://ethereum-sepolia-rpc.publicnode.com";
const POOL_ABI = [
  ...LendingPoolABI.abi,
  "function priceOracle() view returns (address)",
  "function getBorrowRatePerSec() view returns (uint256)",
  "function totalDebt() view returns (uint256)",
];
const MOCK_USDT_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(uint256 amount) payable",
  "function mintFree(address recipient, uint256 amount)",
  "function quoteMint(uint256 amount) view returns (uint256)",
  "function owner() view returns (address)",
];
const ORACLE_ABI = [
  "function owner() view returns (address)",
  "function decimals() view returns (uint8)",
  "function setTemporaryPrice(int256 newPrice)",
];

function formatAmount(value, decimals = 4, language = "en") {
  if (value === null || value === undefined || Number(value) === 0) return "0.00";
  const number = Number(value);
  if (!Number.isFinite(number)) return "0.00";
  const fractionDigits = Math.min(decimals, Math.max(2, number >= 1 ? 2 : decimals));
  return number.toLocaleString(language === "vi" ? "vi-VN" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: fractionDigits,
  });
}

function getErrorMessage(error) {
  return error?.reason
    || error?.shortMessage
    || error?.info?.error?.message
    || error?.error?.message
    || error?.message
    || "Transaction failed";
}

async function assertContractDeployment(provider, address, label) {
  if (!address) throw new Error(`${label} address is not configured.`);
  const code = await provider.getCode(address);
  if (code === "0x") {
    const network = await provider.getNetwork();
    throw new Error(`${label} was not found on network ${network.chainId.toString()}. Switch MetaMask to the deployment network.`);
  }
}

function AmountField({ label, value, onChange, onMax, unit }) {
  return (
    <label className="amount-field">
      <span>{label}</span>
      <div className="input-wrap">
        <input
          type="number"
          min="0"
          step="any"
          placeholder="0.00"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="unit">{unit}</span>
        {onMax && (
          <button type="button" className="max-button" onClick={onMax}>
            MAX
          </button>
        )}
      </div>
    </label>
  );
}

export default function App() {
  const [language, setLanguage] = useState("en");
  const [account, setAccount] = useState("");
  const [ethBalance, setEthBalance] = useState("0");
  const [usdtBalance, setUsdtBalance] = useState("0");
  const [poolLiquidity, setPoolLiquidity] = useState("0");
  const [totalDebtEth, setTotalDebtEth] = useState("0");
  const [lenderSupplied, setLenderSupplied] = useState("0");
  const [userCollateral, setUserCollateral] = useState("0");
  const [userBorrowed, setUserBorrowed] = useState("0");
  const [maxBorrowETH, setMaxBorrowETH] = useState("0");
  const [healthFactor, setHealthFactor] = useState("∞");
  const [withdrawableCollateral, setWithdrawableCollateral] = useState("0");
  const [liveDebt, setLiveDebt] = useState("0");
  const [liveDebtWei, setLiveDebtWei] = useState(0n);
  const [onChainTimestamp, setOnChainTimestamp] = useState(0);
  const [rawPrincipal, setRawPrincipal] = useState(0n);
  const [borrowRatePerSec, setBorrowRatePerSec] = useState(0n);
  const [showDebtInWei, setShowDebtInWei] = useState(false);
  const [mainTab, setMainTab] = useState("lend");
  const [lendAction, setLendAction] = useState("");
  const [borrowAction, setBorrowAction] = useState("");

  const [depositEthAmount, setDepositEthAmount] = useState("");
  const [withdrawEthAmount, setWithdrawEthAmount] = useState("");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [withdrawCollateralAmount, setWithdrawCollateralAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [tradeAmount, setTradeAmount] = useState("");
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showOracleModal, setShowOracleModal] = useState(false);
  const [oraclePrice, setOraclePrice] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const t = (key) => translations[language][key] || translations.en[key] || key;
  const format = (value, decimals = 4) => formatAmount(value, decimals, language);
  const localizedError = (message) => {
    if (!message) return "";
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes("user rejected") || lowerMessage.includes("action rejected")) {
      return t("walletRejected");
    }
    if (message === "Please install MetaMask to connect your wallet.") return t("installWallet");
    if (message === "Unable to refresh on-chain position.") return t("refreshError");

    const operationKeys = [
      ["Deposit collateral failed", "depositCollateralFailed"],
      ["Withdraw collateral failed", "withdrawCollateralFailed"],
      ["Deposit failed", "depositFailed"],
      ["Withdraw failed", "withdrawFailed"],
      ["Borrow failed", "borrowFailed"],
      ["Repay failed", "repayFailed"],
      ["Mint failed", "mintFailed"],
      ["Admin mint failed", "adminMintFailed"],
      ["Oracle update failed", "oracleFailed"],
    ];
    const operation = operationKeys.find(([prefix]) => message.startsWith(`${prefix}:`) || message === prefix);
    if (operation) {
      const detail = message.slice(operation[0].length).replace(/^:\s*/, "");
      return detail ? `${t(operation[1])}: ${detail}` : t(operation[1]);
    }
    if (message === "Transaction failed") return t("transactionFailed");
    return message;
  };

  const getProvider = () => new ethers.BrowserProvider(window.ethereum);
  const getReadProvider = () => {
    if (window.ethereum) return getProvider();
    return new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError("Please install MetaMask to connect your wallet.");
      return;
    }
    try {
      const provider = getProvider();
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      await fetchData(accounts[0], provider);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const fetchData = async (userAddress = account, provider = getReadProvider()) => {
    if (!provider) return;
    try {
      const poolContract = new ethers.Contract(LENDING_POOL_ADDRESS, POOL_ABI, provider);
      const [poolEthBalance, totalDebt, borrowRate] = await Promise.all([
        provider.getBalance(LENDING_POOL_ADDRESS),
        poolContract.totalDebt(),
        poolContract.getBorrowRatePerSec(),
      ]);

      setPoolLiquidity(ethers.formatEther(poolEthBalance));
      setTotalDebtEth(ethers.formatEther(totalDebt));
      setBorrowRatePerSec(borrowRate);

      if (!userAddress) return;

      const usdtContract = new ethers.Contract(MOCK_USDT_ADDRESS, MOCK_USDT_ABI, provider);
      const tokenOwner = await usdtContract.owner();
      setIsAdmin(tokenOwner.toLowerCase() === userAddress.toLowerCase());
      const [
        walletEthBalance,
        walletUsdtBalance,
        collateral,
        userData,
        supplied,
        withdrawable,
        principal,
        lastTimestamp,
      ] = await Promise.all([
        provider.getBalance(userAddress),
        usdtContract.balanceOf(userAddress),
        poolContract.userCollateral(userAddress),
        poolContract.getUserAccountData(userAddress),
        poolContract.getLenderBalance(userAddress),
        poolContract.getWithdrawableCollateral(userAddress),
        poolContract.principalBorrowed(userAddress),
        poolContract.lastBorrowerUpdateTimestamp(userAddress),
      ]);

      setEthBalance(ethers.formatEther(walletEthBalance));
      setUsdtBalance(ethers.formatUnits(walletUsdtBalance, 18));
      setUserCollateral(ethers.formatUnits(collateral, 18));
      setUserBorrowed(ethers.formatEther(userData.totalDebtETH ?? userData[1]));
      setMaxBorrowETH(ethers.formatEther(userData.maxBorrowETH ?? userData[2]));
      const factor = userData.healthFactor ?? userData[3];
      setHealthFactor(factor > 10n ** 30n ? "∞" : ethers.formatEther(factor));
      setLenderSupplied(ethers.formatEther(supplied));
      setWithdrawableCollateral(ethers.formatUnits(withdrawable, 18));
      setRawPrincipal(principal);
      setOnChainTimestamp(Number(lastTimestamp));
    } catch (err) {
      console.error("Fetch error detail:", err);
      setError("Unable to refresh on-chain position.");
    }
  };

  useEffect(() => {
    const refresh = () => fetchData(account, getReadProvider());
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [account]);

  useEffect(() => {
    if (!account || rawPrincipal === 0n || onChainTimestamp === 0) {
      setLiveDebt(userBorrowed);
      setLiveDebtWei(ethers.parseEther(userBorrowed || "0"));
      return undefined;
    }
    const updateLiveDebt = () => {
      const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - onChainTimestamp);
      const accrued = (rawPrincipal * borrowRatePerSec * BigInt(elapsed)) / 10n ** 18n;
      const totalWei = rawPrincipal + accrued;
      setLiveDebtWei(totalWei);
      setLiveDebt(ethers.formatEther(totalWei));
    };
    updateLiveDebt();
    const interval = setInterval(updateLiveDebt, 1000);
    return () => clearInterval(interval);
  }, [account, rawPrincipal, onChainTimestamp, borrowRatePerSec, userBorrowed]);

  useEffect(() => {
    if (!error) return undefined;
    const timeout = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(timeout);
  }, [error]);

  useEffect(() => {
    if (!success) return undefined;
    const timeout = setTimeout(() => setSuccess(""), 5000);
    return () => clearTimeout(timeout);
  }, [success]);

  const handleTrade = async () => {
    if (!account || minting || !tradeAmount || Number(tradeAmount) <= 0) return;
    setMinting(true);
    setError("");
    try {
      const provider = getProvider();
      const signer = await provider.getSigner();
      await assertContractDeployment(provider, MOCK_USDT_ADDRESS, "mUSDT contract");
      const token = new ethers.Contract(MOCK_USDT_ADDRESS, MOCK_USDT_ABI, signer);
      const amount = ethers.parseUnits(tradeAmount, USDT_DECIMALS);
      const requiredEth = await token.quoteMint(amount);
      await token.mint.staticCall(amount, { value: requiredEth });
      await (await token.mint(amount, { value: requiredEth })).wait();
      await fetchData(account, provider);
      setTradeAmount("");
      setShowTradeModal(false);
      setSuccess(t("mintSuccess"));
    } catch (err) {
      setError(`${t("mintFailed")}: ${getErrorMessage(err)}`);
    } finally {
      setMinting(false);
    }
  };

  const handleAdminMint = async () => {
    if (!account || minting) return;
    setMinting(true);
    setError("");
    try {
      const provider = getProvider();
      const signer = await provider.getSigner();
      const token = new ethers.Contract(MOCK_USDT_ADDRESS, MOCK_USDT_ABI, signer);
      const amount = ethers.parseUnits("100000", USDT_DECIMALS);
      await (await token.mintFree(account, amount)).wait();
      await fetchData(account, provider);
      setSuccess(t("adminMintSuccess"));
    } catch (err) {
      setError(`${t("adminMintFailed")}: ${getErrorMessage(err)}`);
    } finally {
      setMinting(false);
    }
  };

  const handleSetOraclePrice = async () => {
    if (!account || !oraclePrice || Number(oraclePrice) <= 0) return;
    setLoading(true);
    setError("");
    try {
      const provider = getProvider();
      const signer = await provider.getSigner();
      const pool = new ethers.Contract(LENDING_POOL_ADDRESS, POOL_ABI, signer);
      const oracleAddress = ORACLE_ADDRESS || await pool.priceOracle();
      const oracle = new ethers.Contract(oracleAddress, ORACLE_ABI, signer);
      const decimals = await oracle.decimals();
      const price = ethers.parseUnits(oraclePrice, Number(decimals));
      await (await oracle.setTemporaryPrice(price)).wait();
      setOraclePrice("");
      setShowOracleModal(false);
      await fetchData(account, provider);
      setSuccess(t("oracleSuccess"));
    } catch (err) {
      setError(`${t("oracleFailed")}: ${getErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const runTransaction = async (action, message, clear) => {
    setLoading(true);
    setError("");
    try {
      const provider = getProvider();
      const signer = await provider.getSigner();
      await (await action(signer)).wait();
      clear();
      await fetchData(account, provider);
    } catch (err) {
      setError(`${message}: ${getErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDepositETH = () => {
    if (!depositEthAmount) return;
    return runTransaction(
      (signer) => new ethers.Contract(LENDING_POOL_ADDRESS, POOL_ABI, signer)
        .depositETH({ value: ethers.parseEther(depositEthAmount) }),
      "Deposit failed",
      () => setDepositEthAmount(""),
    );
  };

  const handleWithdrawETH = () => {
    if (!withdrawEthAmount) return;
    return runTransaction(
      (signer) => new ethers.Contract(LENDING_POOL_ADDRESS, POOL_ABI, signer)
        .withdrawETH(ethers.parseEther(withdrawEthAmount)),
      "Withdraw failed",
      () => setWithdrawEthAmount(""),
    );
  };

  const handleDepositCollateral = () => {
    if (!collateralAmount) return;
    return runTransaction(async (signer) => {
      const token = new ethers.Contract(MOCK_USDT_ADDRESS, MOCK_USDT_ABI, signer);
      await (await token.approve(LENDING_POOL_ADDRESS, ethers.parseUnits(collateralAmount, 18))).wait();
      return new ethers.Contract(LENDING_POOL_ADDRESS, POOL_ABI, signer)
        .depositCollateral(ethers.parseUnits(collateralAmount, 18));
    }, "Deposit collateral failed", () => setCollateralAmount(""));
  };

  const handleWithdrawCollateral = () => {
    if (!withdrawCollateralAmount) return;
    return runTransaction(
      (signer) => new ethers.Contract(LENDING_POOL_ADDRESS, POOL_ABI, signer)
        .withdrawCollateral(ethers.parseUnits(withdrawCollateralAmount, 18)),
      "Withdraw collateral failed",
      () => setWithdrawCollateralAmount(""),
    );
  };

  const handleBorrow = () => {
    if (!borrowAmount) return;
    return runTransaction(
      (signer) => new ethers.Contract(LENDING_POOL_ADDRESS, POOL_ABI, signer)
        .borrowETH(ethers.parseEther(borrowAmount)),
      "Borrow failed",
      () => setBorrowAmount(""),
    );
  };

  const handleRepay = async () => {
    if (!repayAmount) return;
    return runTransaction(async (signer) => {
      const pool = new ethers.Contract(LENDING_POOL_ADDRESS, POOL_ABI, signer);
      const data = await pool.getUserAccountData(account);
      const debt = data.totalDebtETH ?? data[1];
      let payment = ethers.parseEther(repayAmount);
      if (payment >= debt) payment = debt + ethers.parseEther("0.0001");
      return pool.repayETH({ value: payment });
    }, "Repay failed", () => setRepayAmount(""));
  };

  const busy = loading || !account;
  const totalDebtEthValue = Number(totalDebtEth);
  const poolBalanceEth = Number(poolLiquidity);
  const liquiditySafetyLimit = Math.max(0, poolBalanceEth * 0.999);
  const liquiditySafeBorrowETH = Math.min(Number(maxBorrowETH), liquiditySafetyLimit);
  const liquiditySafeWithdrawETH = Math.min(Number(lenderSupplied), liquiditySafetyLimit);
  const totalAssets = totalDebtEthValue + poolBalanceEth;
  const utilization = totalAssets > 0
    ? (totalDebtEthValue / totalAssets) * 100
    : 0;
  const borrowApy = Number(ethers.formatUnits(borrowRatePerSec * 31536000n, 16));
  const supplyApy = borrowApy * (utilization / 100) * 0.8;
  const utilizationClass = utilization >= 90 ? "danger" : utilization >= 80 ? "warning" : "healthy";
  const estimatedYield = Number(lenderSupplied) * (supplyApy / 100);
  const hasLenderPosition = Number(lenderSupplied) > 0;
  const hasCollateralPosition = Number(userCollateral) > 0;
  const hasBorrowPosition = Number(userBorrowed) > 0;
  const hasAnyPosition = hasLenderPosition || hasCollateralPosition || hasBorrowPosition;
  const healthClass = healthFactor === "∞" || Number(healthFactor) >= 1.5
    ? "healthy"
    : Number(healthFactor) >= 1 ? "warning" : "danger";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          {isAdmin && <button className="oracle-button" onClick={() => setShowOracleModal(true)} title={t("oracle")} aria-label={t("oracle")}>⚙</button>}
          <span className="brand-mark">P</span><span>PeerPool Lending</span>
        </div>
        {account && (
          <div className="header-faucet">
            <button className="faucet-button" onClick={() => setShowTradeModal(true)} disabled={minting || loading}>
              {minting ? <span className="spinner" aria-hidden="true" /> : <span className="faucet-icon" aria-hidden="true">✦</span>}
              {minting ? t("minting") : t("trade")}
            </button>
          </div>
        )}
        {account ? (
          <div className="wallet-widget">
            <div className="balance-pill">
              {format(ethBalance)} ETH <span>|</span> {format(usdtBalance)} mUSDT
            </div>
            <button className="wallet-badge" onClick={() => fetchData(account)} title="Refresh wallet data">
              <span className="active-dot" />
              {account.slice(0, 6)}...{account.slice(-4)}
            </button>
            <button className="language-toggle" onClick={() => setLanguage(language === "en" ? "vi" : "en")} aria-label="Toggle language">
              {language.toUpperCase()}
            </button>
          </div>
        ) : (
          <div className="wallet-widget">
            <button className="primary-button" onClick={connectWallet}>Connect Wallet</button>
            <button className="language-toggle" onClick={() => setLanguage(language === "en" ? "vi" : "en")} aria-label="Toggle language">
              {language.toUpperCase()}
            </button>
          </div>
        )}
      </header>

      {loading && (
        <section className="hero">
          <span className="status-pill">{t("transactionPending")}</span>
        </section>
      )}

      {(error || success) && (
        <div className="toast-container">
          <div className={success ? "success-toast" : "error-toast"} role="alert">
            <span className={success ? "toast-icon success-icon" : "toast-icon"} aria-hidden="true">{success ? "✓" : "!"}</span>
            <span>{success || localizedError(error)}</span>
            <button className="toast-close" onClick={() => { setError(""); setSuccess(""); }} aria-label="Close notification">×</button>
          </div>
        </div>
      )}

      <section className="protocol-summary">
        <article className="protocol-card">
          <span className="eyebrow">{t("asset")}</span>
          <div className="asset-content">
            <svg className="eth-icon" viewBox="0 0 40 64" aria-label="Ethereum token" role="img">
              <path d="M20 0 2 31.5 20 42l18-10.5L20 0Z" fill="#94a3b8" />
              <path d="m20 0-18 31.5L20 42V0Z" fill="#cbd5e1" />
              <path d="m20 46.5-18-10.7L20 64l18-28.2-18 10.7Z" fill="#64748b" />
              <path d="M20 46.5V64L38 35.8 20 46.5Z" fill="#94a3b8" />
            </svg>
            <div><strong>ETH</strong><span>/ Ethereum</span></div>
          </div>
        </article>
        <article className="protocol-card">
          <span className="eyebrow">{t("rates")}</span>
          <div className="rates-content">
            <div><strong className="supply-rate">{supplyApy.toFixed(2)}%</strong><span>{t("supplyApy")}</span></div>
            <b>/</b>
            <div><strong className="borrow-rate">{borrowApy.toFixed(2)}%</strong><span>{t("borrowApy")}</span></div>
          </div>
        </article>
        <article className="protocol-card">
          <span className="eyebrow">{t("poolUtilization")}</span>
          <div className={`utilization-value ${utilizationClass}`}>
            {utilization.toFixed(2)}% <span>/ {format(totalAssets)} ETH</span>
          </div>
          <div className="utilization-track" aria-label={`${utilization.toFixed(2)}% pool utilization`}>
            <div className={`utilization-fill ${utilizationClass}`} style={{ width: `${utilization}%` }} />
          </div>
        </article>
      </section>

      {hasAnyPosition && (
        <section className="positions-grid">
          {hasLenderPosition && (
            <article className="position-card">
              <span className="eyebrow">{t("yourLending")}</span>
              <div className="position-metric"><span>{t("depositedShare")}</span><strong>{format(lenderSupplied)} ETH</strong></div>
              <div className="position-metric"><span>{t("projectedYearlyEarnings")}</span><strong>{estimatedYield.toFixed(4)} ETH / {language === "vi" ? "năm" : "year"}</strong></div>
            </article>
          )}
          {hasCollateralPosition && (
            <article className="position-card">
              <span className="eyebrow">{t("yourCollateral")}</span>
              <div className="position-metric"><span>{t("stakedCollateral")}</span><strong>{format(userCollateral)} mUSDT</strong></div>
              <div className="position-metric"><span>{t("borrowCapacity")}</span><strong>{format(maxBorrowETH)} ETH</strong></div>
            </article>
          )}
          {hasBorrowPosition && (
            <article className="position-card">
              <span className="eyebrow">{t("yourActiveDebt")}</span>
              <div className="position-metric">
                <span>{t("borrowedDebt")}</span>
                <strong>{showDebtInWei ? ethers.formatUnits(liveDebtWei, 0) : format(liveDebt)} {showDebtInWei ? "Wei" : "ETH"}</strong>
                <button className="text-button" onClick={() => setShowDebtInWei((visible) => !visible)}>
                  {showDebtInWei ? t("viewInEth") : t("viewInWei")}
                </button>
              </div>
              <div className="position-metric"><span>{t("projectedYearlyInterest")}</span><strong>{(Number(liveDebt) * (borrowApy / 100)).toFixed(4)} ETH / {language === "vi" ? "năm" : "year"}</strong></div>
              <div className="position-metric position-health"><span>{t("healthFactor")}</span><span className={`health-badge ${healthClass}`}>{healthFactor === "∞" ? "∞" : format(healthFactor)}</span></div>
            </article>
          )}
        </section>
      )}

      <section className="action-container">
        <div className="role-tabs" role="tablist" aria-label="Protocol action mode">
          <button className={mainTab === "lend" ? "tab active" : "tab"} onClick={() => setMainTab("lend")}>{t("lendSupply")}</button>
          <button className={mainTab === "borrow" ? "tab active" : "tab"} onClick={() => setMainTab("borrow")}>{t("borrowCollateral")}</button>
        </div>

        {mainTab === "lend" ? (
          <div className="action-view">
            <div className="supply-list">
              <div className="supply-row">
                <div><span>{t("availableToSupply")}</span><strong>{format(ethBalance)} ETH</strong></div>
                <button className="secondary-button action-row-button" onClick={() => setLendAction(lendAction === "supply" ? "" : "supply")} disabled={busy || Number(ethBalance) <= 0}>{t("supply")}</button>
              </div>
              <div className="supply-row">
                <div><span>{t("suppliedBalance")}</span><strong>{format(lenderSupplied)} ETH</strong></div>
                {hasLenderPosition && <button className="secondary-button action-row-button" onClick={() => setLendAction(lendAction === "withdraw" ? "" : "withdraw")} disabled={busy}>{t("withdraw")}</button>}
              </div>
            </div>
            {lendAction && (
              <div className="inline-drawer">
                <AmountField
                  label={lendAction === "supply" ? t("amountToSupply") : t("amountToWithdraw")}
                  value={lendAction === "supply" ? depositEthAmount : withdrawEthAmount}
                  onChange={lendAction === "supply" ? setDepositEthAmount : setWithdrawEthAmount}
                  onMax={() => lendAction === "supply" ? setDepositEthAmount(ethBalance) : setWithdrawEthAmount(String(liquiditySafeWithdrawETH))}
                  unit="ETH"
                />
                <button
                  className="primary-button full"
                  onClick={lendAction === "supply" ? handleDepositETH : handleWithdrawETH}
                  disabled={busy || Number(lendAction === "supply" ? depositEthAmount : withdrawEthAmount) <= 0 || Number(lendAction === "supply" ? depositEthAmount : withdrawEthAmount) > Number(lendAction === "supply" ? ethBalance : liquiditySafeWithdrawETH)}
                >
                  {lendAction === "supply" ? t("supplyEth") : t("withdrawEth")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="action-view">
            <div className="borrow-action-list">
              <div className="borrow-action-row">
                <div className="borrow-metrics">
                  <strong>{t("musdtCollateral")}</strong>
                  <span>{t("available")}: {format(usdtBalance)} mUSDT</span>
                  <span>{t("staked")}: {format(userCollateral)} mUSDT</span>
                </div>
                <div className="borrow-row-buttons">
                  <button className="secondary-button" onClick={() => setBorrowAction(borrowAction === "depositCollateral" ? "" : "depositCollateral")} disabled={busy}>{t("depositCollateral")}</button>
                  <button className="secondary-button" onClick={() => setBorrowAction(borrowAction === "withdrawCollateral" ? "" : "withdrawCollateral")} disabled={busy || !hasCollateralPosition}>{t("withdrawCollateral")}</button>
                </div>
              </div>
              <div className="borrow-action-row">
                <div className="borrow-metrics">
                  <strong>{t("ethBorrowing")}</strong>
                  <span>{t("maxBorrowAllowed")}: {format(liquiditySafeBorrowETH)} ETH</span>
                  <span>{t("currentDebt")}: {format(liveDebt)} ETH</span>
                </div>
                <div className="borrow-row-buttons">
                  <button className="secondary-button" onClick={() => setBorrowAction(borrowAction === "borrow" ? "" : "borrow")} disabled={busy || liquiditySafeBorrowETH <= 0}>{t("borrowEth")}</button>
                  <button className="secondary-button" onClick={() => setBorrowAction(borrowAction === "repay" ? "" : "repay")} disabled={busy || !hasBorrowPosition}>{t("repayEth")}</button>
                </div>
              </div>
            </div>
            {borrowAction && (
              <div className="inline-drawer">
                <AmountField
                  label={{
                    depositCollateral: t("amountToDeposit"),
                    withdrawCollateral: t("amountToWithdraw"),
                    borrow: t("amountToBorrow"),
                    repay: t("amountToRepay"),
                  }[borrowAction]}
                  value={{
                    depositCollateral: collateralAmount,
                    withdrawCollateral: withdrawCollateralAmount,
                    borrow: borrowAmount,
                    repay: repayAmount,
                  }[borrowAction]}
                  onChange={{
                    depositCollateral: setCollateralAmount,
                    withdrawCollateral: setWithdrawCollateralAmount,
                    borrow: setBorrowAmount,
                    repay: setRepayAmount,
                  }[borrowAction]}
                  onMax={() => {
                    if (borrowAction === "depositCollateral") setCollateralAmount(usdtBalance);
                    if (borrowAction === "withdrawCollateral") setWithdrawCollateralAmount(withdrawableCollateral);
                    if (borrowAction === "borrow") setBorrowAmount(String(liquiditySafeBorrowETH));
                    if (borrowAction === "repay") setRepayAmount(liveDebt);
                  }}
                  unit={borrowAction.includes("Collateral") ? "mUSDT" : "ETH"}
                />
                <div className="helper-text">
                  {borrowAction === "withdrawCollateral" && `${t("safeMaxWithdrawable")}: ${format(withdrawableCollateral)} mUSDT`}
                  {borrowAction === "borrow" && `${t("maxBorrowAllowed")}: ${format(liquiditySafeBorrowETH)} ETH`}
                  {borrowAction === "repay" && `${t("currentDebt")}: ${format(liveDebt)} ETH`}
                  {borrowAction === "depositCollateral" && `${t("available")}: ${format(usdtBalance)} mUSDT`}
                </div>
                <button
                  className="primary-button full"
                  onClick={{
                    depositCollateral: handleDepositCollateral,
                    withdrawCollateral: handleWithdrawCollateral,
                    borrow: handleBorrow,
                    repay: handleRepay,
                  }[borrowAction]}
                  disabled={
                    busy
                    || Number({
                      depositCollateral: collateralAmount,
                      withdrawCollateral: withdrawCollateralAmount,
                      borrow: borrowAmount,
                      repay: repayAmount,
                    }[borrowAction]) <= 0
                    || Number({
                      depositCollateral: collateralAmount,
                      withdrawCollateral: withdrawCollateralAmount,
                      borrow: borrowAmount,
                      repay: repayAmount,
                    }[borrowAction]) > Number({
                      depositCollateral: usdtBalance,
                      withdrawCollateral: withdrawableCollateral,
                      borrow: liquiditySafeBorrowETH,
                      repay: liveDebt,
                    }[borrowAction])
                  }
                >
                  {`${t("confirm")} ${{
                    depositCollateral: t("depositCollateral"),
                    withdrawCollateral: t("withdrawCollateral"),
                    borrow: t("borrowEth"),
                    repay: t("repayEth"),
                  }[borrowAction]}`}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {isAdmin && (
        <button className="admin-mint-button" onClick={handleAdminMint} disabled={minting || loading}>
          {minting ? t("minting") : t("adminMint")}
        </button>
      )}

      {showTradeModal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowTradeModal(false)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="trade-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div><span className="eyebrow">{t("trade")}</span><h2 id="trade-title">ETH → mUSDT</h2></div>
              <button className="modal-close" onClick={() => setShowTradeModal(false)} aria-label={t("close")}>×</button>
            </div>
            <AmountField label={t("amountToTrade")} value={tradeAmount} onChange={setTradeAmount} unit="mUSDT" />
            <p className="helper-text">{t("tradeHint")}</p>
            <button className="primary-button full" onClick={handleTrade} disabled={minting || loading || Number(tradeAmount) <= 0}>
              {minting ? t("minting") : t("trade")}
            </button>
          </section>
        </div>
      )}

      {isAdmin && showOracleModal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowOracleModal(false)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="oracle-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div><span className="eyebrow">{t("oracle")}</span><h2 id="oracle-title">{t("oraclePrice")}</h2></div>
              <button className="modal-close" onClick={() => setShowOracleModal(false)} aria-label={t("close")}>×</button>
            </div>
            <AmountField label={t("oraclePrice")} value={oraclePrice} onChange={setOraclePrice} unit="USD" />
            <p className="helper-text">The temporary price is active for 2 minutes.</p>
            <button className="primary-button full" onClick={handleSetOraclePrice} disabled={loading || Number(oraclePrice) <= 0}>
              {loading ? t("transactionPending") : t("setPrice")}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
