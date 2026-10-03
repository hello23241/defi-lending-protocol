import { useEffect, useState } from "react";
import { ethers } from "ethers";
import LendingPoolABI from "./abis/LendingPool.json";
import MockUSDTABI from "./abis/MockUSDT.json";
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
    mint: "Mint 100k mUSDT",
    minting: "Minting...",
    mintSuccess: "Successfully minted 100,000 mUSDT!",
    mintFailed: "Mint failed",
  },
  vi: {
    asset: "TÀI SẢN",
    rates: "LÃI SUẤT (GỬI / VAY)",
    supplyApy: "Lãi suất Gửi (APY)",
    borrowApy: "Lãi suất Vay (APY)",
    poolUtilization: "TỶ LỆ SỬ DỤNG HỒ",
    yourLending: "KHOẢN GỬI CỦA BẠN",
    depositedShare: "Tỷ lệ Đã gửi",
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
    availableToSupply: "Khả dụng để gửi",
    suppliedBalance: "Số dư đã gửi",
    supply: "Gửi Tiền",
    withdraw: "Rút Tiền",
    supplyEth: "Nạp ETH vào Hồ",
    withdrawEth: "Rút ETH khỏi Hồ",
    amountToSupply: "Số lượng muốn gửi",
    amountToWithdraw: "Số lượng muốn rút",
    musdtCollateral: "Thế chấp mUSDT",
    ethBorrowing: "Vay ETH",
    depositCollateral: "Nạp Thế Chấp",
    withdrawCollateral: "Rút Thế Chấp",
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
    mint: "Nhận 100k mUSDT",
    minting: "Đang xử lý...",
    mintSuccess: "Đã nhận thành công 100.000 mUSDT!",
    mintFailed: "Đúc token thất bại",
  },
};

const LENDING_POOL_ADDRESS = import.meta.env.VITE_LENDING_POOL_ADDRESS;
const MOCK_USDT_ADDRESS = import.meta.env.VITE_MOCK_USDT_ADDRESS;
const USDT_DECIMALS = 18;
const SEPOLIA_RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL
  || "https://ethereum-sepolia-rpc.publicnode.com";
const POOL_ABI = [
  ...LendingPoolABI.abi,
  "function getBorrowRatePerSec() view returns (uint256)",
  "function totalDebt() view returns (uint256)",
];

function formatAmount(value, decimals = 4) {
  if (value === null || value === undefined || Number(value) === 0) return "0.00";
  const number = Number(value);
  if (!Number.isFinite(number)) return "0.00";
  const fractionDigits = Math.min(decimals, Math.max(2, number >= 1 ? 2 : decimals));
  return number.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: fractionDigits,
  });
}

function getErrorMessage(error) {
  return error?.reason || error?.shortMessage || error?.message || "Transaction failed";
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
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const t = (key) => translations[language][key] || translations.en[key] || key;

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

      const usdtContract = new ethers.Contract(MOCK_USDT_ADDRESS, MockUSDTABI.abi, provider);
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

  const handleMint = async () => {
    if (!account || minting) return;
    setMinting(true);
    setError("");
    try {
      const provider = getProvider();
      const signer = await provider.getSigner();
      const token = new ethers.Contract(MOCK_USDT_ADDRESS, MockUSDTABI.abi, signer);
      await (await token.mint(account, ethers.parseUnits("100000", USDT_DECIMALS))).wait();
      await fetchData(account, provider);
      setSuccess(t("mintSuccess"));
    } catch (err) {
      setError(`${t("mintFailed")}: ${getErrorMessage(err)}`);
    } finally {
      setMinting(false);
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
      const token = new ethers.Contract(MOCK_USDT_ADDRESS, MockUSDTABI.abi, signer);
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
        <div className="brand"><span className="brand-mark">P</span><span>PeerPool Lending</span></div>
        {account && (
          <div className="header-faucet">
            <button className="faucet-button" onClick={handleMint} disabled={minting || loading}>
              {minting ? <span className="spinner" aria-hidden="true" /> : <span className="faucet-icon" aria-hidden="true">✦</span>}
              {minting ? t("minting") : t("mint")}
            </button>
          </div>
        )}
        {account ? (
          <div className="wallet-widget">
            <div className="balance-pill">
              {formatAmount(ethBalance)} ETH <span>|</span> {formatAmount(usdtBalance)} mUSDT
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
            <span>{success || (error === "Unable to refresh on-chain position." ? t("refreshError") : error)}</span>
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
            {utilization.toFixed(2)}% <span>/ {formatAmount(totalAssets)} ETH</span>
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
              <div className="position-metric"><span>{t("depositedShare")}</span><strong>{formatAmount(lenderSupplied)} ETH</strong></div>
              <div className="position-metric"><span>{t("projectedYearlyEarnings")}</span><strong>{estimatedYield.toFixed(4)} ETH / year</strong></div>
            </article>
          )}
          {hasCollateralPosition && (
            <article className="position-card">
              <span className="eyebrow">{t("yourCollateral")}</span>
              <div className="position-metric"><span>{t("stakedCollateral")}</span><strong>{formatAmount(userCollateral)} mUSDT</strong></div>
              <div className="position-metric"><span>{t("borrowCapacity")}</span><strong>{formatAmount(maxBorrowETH)} ETH</strong></div>
            </article>
          )}
          {hasBorrowPosition && (
            <article className="position-card">
              <span className="eyebrow">{t("yourActiveDebt")}</span>
              <div className="position-metric">
                <span>{t("borrowedDebt")}</span>
                <strong>{showDebtInWei ? ethers.formatUnits(liveDebtWei, 0) : formatAmount(liveDebt)} {showDebtInWei ? "Wei" : "ETH"}</strong>
                <button className="text-button" onClick={() => setShowDebtInWei((visible) => !visible)}>
                  {showDebtInWei ? t("viewInEth") : t("viewInWei")}
                </button>
              </div>
              <div className="position-metric"><span>{t("projectedYearlyInterest")}</span><strong>{(Number(liveDebt) * (borrowApy / 100)).toFixed(4)} ETH / year</strong></div>
              <div className="position-metric position-health"><span>{t("healthFactor")}</span><span className={`health-badge ${healthClass}`}>{healthFactor === "∞" ? "∞" : formatAmount(healthFactor)}</span></div>
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
                <div><span>{t("availableToSupply")}</span><strong>{formatAmount(ethBalance)} ETH</strong></div>
                <button className="secondary-button action-row-button" onClick={() => setLendAction(lendAction === "supply" ? "" : "supply")} disabled={busy || Number(ethBalance) <= 0}>{t("supply")}</button>
              </div>
              <div className="supply-row">
                <div><span>{t("suppliedBalance")}</span><strong>{formatAmount(lenderSupplied)} ETH</strong></div>
                {hasLenderPosition && <button className="secondary-button action-row-button" onClick={() => setLendAction(lendAction === "withdraw" ? "" : "withdraw")} disabled={busy}>{t("withdraw")}</button>}
              </div>
            </div>
            {lendAction && (
              <div className="inline-drawer">
                <AmountField
                  label={lendAction === "supply" ? t("amountToSupply") : t("amountToWithdraw")}
                  value={lendAction === "supply" ? depositEthAmount : withdrawEthAmount}
                  onChange={lendAction === "supply" ? setDepositEthAmount : setWithdrawEthAmount}
                  onMax={() => lendAction === "supply" ? setDepositEthAmount(ethBalance) : setWithdrawEthAmount(lenderSupplied)}
                  unit="ETH"
                />
                <button
                  className="primary-button full"
                  onClick={lendAction === "supply" ? handleDepositETH : handleWithdrawETH}
                  disabled={busy || Number(lendAction === "supply" ? depositEthAmount : withdrawEthAmount) <= 0 || Number(lendAction === "supply" ? depositEthAmount : withdrawEthAmount) > Number(lendAction === "supply" ? ethBalance : lenderSupplied)}
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
                  <span>{t("available")}: {formatAmount(usdtBalance)} mUSDT</span>
                  <span>{t("staked")}: {formatAmount(userCollateral)} mUSDT</span>
                </div>
                <div className="borrow-row-buttons">
                  <button className="secondary-button" onClick={() => setBorrowAction(borrowAction === "depositCollateral" ? "" : "depositCollateral")} disabled={busy}>{t("depositCollateral")}</button>
                  <button className="secondary-button" onClick={() => setBorrowAction(borrowAction === "withdrawCollateral" ? "" : "withdrawCollateral")} disabled={busy || !hasCollateralPosition}>{t("withdrawCollateral")}</button>
                </div>
              </div>
              <div className="borrow-action-row">
                <div className="borrow-metrics">
                  <strong>{t("ethBorrowing")}</strong>
                  <span>{t("maxBorrowAllowed")}: {formatAmount(maxBorrowETH)} ETH</span>
                  <span>{t("currentDebt")}: {formatAmount(liveDebt)} ETH</span>
                </div>
                <div className="borrow-row-buttons">
                  <button className="secondary-button" onClick={() => setBorrowAction(borrowAction === "borrow" ? "" : "borrow")} disabled={busy || Number(maxBorrowETH) <= 0}>{t("borrowEth")}</button>
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
                    if (borrowAction === "borrow") setBorrowAmount(maxBorrowETH);
                    if (borrowAction === "repay") setRepayAmount(liveDebt);
                  }}
                  unit={borrowAction.includes("Collateral") ? "mUSDT" : "ETH"}
                />
                <div className="helper-text">
                  {borrowAction === "withdrawCollateral" && `${t("safeMaxWithdrawable")}: ${formatAmount(withdrawableCollateral)} mUSDT`}
                  {borrowAction === "borrow" && `${t("maxBorrowAllowed")}: ${formatAmount(maxBorrowETH)} ETH`}
                  {borrowAction === "repay" && `${t("currentDebt")}: ${formatAmount(liveDebt)} ETH`}
                  {borrowAction === "depositCollateral" && `${t("available")}: ${formatAmount(usdtBalance)} mUSDT`}
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
                      borrow: maxBorrowETH,
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
    </main>
  );
}
