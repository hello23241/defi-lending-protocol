import { useEffect, useState } from "react";
import { ethers } from "ethers";
import LendingPoolABI from "./abis/LendingPool.json";
import MockUSDTABI from "./abis/MockUSDT.json";
import "./App.css";

const LENDING_POOL_ADDRESS = import.meta.env.VITE_LENDING_POOL_ADDRESS;
const MOCK_USDT_ADDRESS = import.meta.env.VITE_MOCK_USDT_ADDRESS;
const POOL_ABI = [
  ...LendingPoolABI.abi,
  "function getBorrowRatePerSec() view returns (uint256)",
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

function MetricCard({ eyebrow, title, children, className = "" }) {
  return (
    <article className={`metric-card ${className}`}>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {children}
    </article>
  );
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
  const [account, setAccount] = useState("");
  const [ethBalance, setEthBalance] = useState("0");
  const [usdtBalance, setUsdtBalance] = useState("0");
  const [poolLiquidity, setPoolLiquidity] = useState("0");
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

  const [depositEthAmount, setDepositEthAmount] = useState("");
  const [withdrawEthAmount, setWithdrawEthAmount] = useState("");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [withdrawCollateralAmount, setWithdrawCollateralAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getProvider = () => new ethers.BrowserProvider(window.ethereum);

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

  const fetchData = async (userAddress, provider = getProvider()) => {
    try {
      const poolContract = new ethers.Contract(LENDING_POOL_ADDRESS, POOL_ABI, provider);
      const usdtContract = new ethers.Contract(MOCK_USDT_ADDRESS, MockUSDTABI.abi, provider);
      const [
        balance,
        usdtBal,
        poolEthBalance,
        collateral,
        userData,
        supplied,
        withdrawable,
        principal,
        lastTimestamp,
      ] = await Promise.all([
        provider.getBalance(userAddress),
        usdtContract.balanceOf(userAddress),
        provider.getBalance(LENDING_POOL_ADDRESS),
        poolContract.userCollateral(userAddress),
        poolContract.getUserAccountData(userAddress),
        poolContract.getLenderBalance(userAddress),
        poolContract.getWithdrawableCollateral(userAddress),
        poolContract.principalBorrowed(userAddress),
        poolContract.lastBorrowerUpdateTimestamp(userAddress),
      ]);

      setEthBalance(ethers.formatEther(balance));
      setUsdtBalance(ethers.formatUnits(usdtBal, 18));
      setPoolLiquidity(ethers.formatEther(poolEthBalance));
      setUserCollateral(ethers.formatUnits(collateral, 18));
      setUserBorrowed(ethers.formatEther(userData.totalDebtETH ?? userData[1]));
      setMaxBorrowETH(ethers.formatEther(userData.maxBorrowETH ?? userData[2]));
      const factor = userData.healthFactor ?? userData[3];
      setHealthFactor(factor > 10n ** 30n ? "∞" : ethers.formatEther(factor));
      setLenderSupplied(ethers.formatEther(supplied));
      setWithdrawableCollateral(ethers.formatUnits(withdrawable, 18));
      setRawPrincipal(principal);
      setOnChainTimestamp(Number(lastTimestamp));
      setBorrowRatePerSec(await poolContract.getBorrowRatePerSec());
    } catch (err) {
      console.error("Fetch error detail:", err);
      setError("Unable to refresh on-chain position.");
    }
  };

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

  const handleMintUSDT = () => runTransaction(
    (signer) => new ethers.Contract(MOCK_USDT_ADDRESS, MockUSDTABI.abi, signer)
      .mint(account, ethers.parseUnits("1000", 18)),
    "Faucet failed",
    () => {},
  );

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

  const healthClass = healthFactor === "∞" || Number(healthFactor) >= 1.5
    ? "healthy"
    : Number(healthFactor) >= 1 ? "warning" : "danger";
  const busy = loading || !account;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">P</span><span>PeerPool Lending</span></div>
        {account ? (
          <button className="wallet-badge" onClick={() => fetchData(account)}>
            {account.slice(0, 6)}...{account.slice(-4)}
          </button>
        ) : (
          <button className="primary-button" onClick={connectWallet}>Connect Wallet</button>
        )}
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">Sepolia money market</span>
          <h1>Borrow, supply, and grow together.</h1>
          <p>Manage your ETH liquidity and collateral from one simple dashboard.</p>
        </div>
        {loading && <span className="status-pill">Transaction pending...</span>}
      </section>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <section className="metrics-grid">
        <MetricCard eyebrow="Your wallet" title="Wallet balances">
          <div className="metric-value">{formatAmount(ethBalance)} <small>ETH</small></div>
          <div className="sub-value">{formatAmount(usdtBalance)} mUSDT</div>
          <button className="secondary-button compact" onClick={handleMintUSDT} disabled={busy}>Faucet (1000 mUSDT)</button>
        </MetricCard>
        <MetricCard eyebrow="Protocol overview" title="Pool liquidity">
          <div className="metric-value">{formatAmount(poolLiquidity)} <small>ETH</small></div>
          <div className="sub-value">Your supplied share: {formatAmount(lenderSupplied)} ETH</div>
          <div className="sub-value">Locked collateral: {formatAmount(userCollateral)} mUSDT</div>
        </MetricCard>
        <MetricCard eyebrow="Borrowing power" title="Borrow capacity">
          <div className="metric-value">{formatAmount(maxBorrowETH)} <small>ETH</small></div>
          <div className="sub-value">Max borrow power</div>
          <div className="sub-value">Live debt: {formatAmount(liveDebt)} ETH</div>
        </MetricCard>
        <MetricCard eyebrow="Position health" title="Health factor">
          <div className={`health-value ${healthClass}`}>{healthFactor === "∞" ? "∞" : formatAmount(healthFactor)}</div>
          <span className={`health-badge ${healthClass}`}>{healthClass === "danger" ? "Liquidation Alert!" : healthClass === "warning" ? "Monitor position" : "Healthy position"}</span>
        </MetricCard>
      </section>

      <section className="debt-panel">
        <div><span className="eyebrow">Real-time accrual</span><h2>Your Live Debt</h2></div>
        <strong>{showDebtInWei ? ethers.formatUnits(liveDebtWei, 0) : formatAmount(liveDebt)} <small>{showDebtInWei ? "Wei" : "ETH"}</small></strong>
        <button className="text-button" onClick={() => setShowDebtInWei((visible) => !visible)}>
          {showDebtInWei ? "View in ETH" : "View in Wei"}
        </button>
      </section>

      <section className="actions-grid">
        <div className="action-column">
          <div className="section-heading"><span className="step">01</span><div><span className="eyebrow">Lender actions</span><h2>Supply liquidity</h2></div></div>
          <div className="action-card">
            <AmountField label="Supply ETH" value={depositEthAmount} onChange={setDepositEthAmount} unit="ETH" />
            <button className="primary-button full" onClick={handleDepositETH} disabled={busy}>Deposit ETH</button>
          </div>
          <div className="action-card">
            <AmountField label="Withdraw ETH" value={withdrawEthAmount} onChange={setWithdrawEthAmount} onMax={() => setWithdrawEthAmount(lenderSupplied)} unit="ETH" />
            <button className="secondary-button full" onClick={handleWithdrawETH} disabled={busy || Number(lenderSupplied) === 0}>Withdraw ETH</button>
          </div>
        </div>
        <div className="action-column">
          <div className="section-heading"><span className="step">02</span><div><span className="eyebrow">Borrower actions</span><h2>Manage your position</h2></div></div>
          <div className="action-card">
            <AmountField label="Deposit collateral" value={collateralAmount} onChange={setCollateralAmount} unit="mUSDT" />
            <button className="primary-button full" onClick={handleDepositCollateral} disabled={busy}>Deposit mUSDT</button>
          </div>
          <div className="action-card">
            <AmountField label="Withdraw collateral" value={withdrawCollateralAmount} onChange={setWithdrawCollateralAmount} onMax={() => setWithdrawCollateralAmount(withdrawableCollateral)} unit="mUSDT" />
            <div className="helper-text">Safe max: {formatAmount(withdrawableCollateral)} mUSDT</div>
            <button className="secondary-button full" onClick={handleWithdrawCollateral} disabled={busy || Number(withdrawableCollateral) === 0}>Withdraw mUSDT</button>
          </div>
          <div className="action-card split-card">
            <div>
              <AmountField label="Borrow ETH" value={borrowAmount} onChange={setBorrowAmount} onMax={() => setBorrowAmount(maxBorrowETH)} unit="ETH" />
              <button className="primary-button full" onClick={handleBorrow} disabled={busy}>Borrow ETH</button>
            </div>
            <div>
              <AmountField label="Repay debt" value={repayAmount} onChange={setRepayAmount} onMax={() => setRepayAmount(liveDebt)} unit="ETH" />
              <button className="secondary-button full" onClick={handleRepay} disabled={busy || liveDebt === "0"}>Repay debt</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
