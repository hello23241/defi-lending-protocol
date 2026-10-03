import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import LendingPoolABI from "./abis/LendingPool.json";
import MockUSDTABI from "./abis/MockUSDT.json";

const LENDING_POOL_ADDRESS = import.meta.env.VITE_LENDING_POOL_ADDRESS;
const MOCK_USDT_ADDRESS = import.meta.env.VITE_MOCK_USDT_ADDRESS;

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

  // Real-time ticking variables
  const [liveDebt, setLiveDebt] = useState("0");
  const [onChainTimestamp, setOnChainTimestamp] = useState(0);
  const [rawPrincipal, setRawPrincipal] = useState(BigInt(0));

  // Inputs
  const [depositEthAmount, setDepositEthAmount] = useState("");
  const [withdrawEthAmount, setWithdrawEthAmount] = useState("");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [withdrawCollateralAmount, setWithdrawCollateralAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");

  const [loading, setLoading] = useState(false);

  const connectWallet = async () => {
    if (!window.ethereum) return alert("Please install MetaMask!");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    setAccount(accounts[0]);
    fetchData(accounts[0], provider);
  };

  const fetchData = async (userAddress, provider) => {
    try {
      const signerProvider = provider || new ethers.BrowserProvider(window.ethereum);

      // 1. Wallet ETH Balance
      const balance = await signerProvider.getBalance(userAddress);
      setEthBalance(ethers.formatEther(balance));

      const poolContract = new ethers.Contract(LENDING_POOL_ADDRESS, LendingPoolABI.abi, signerProvider);
      const usdtContract = new ethers.Contract(MOCK_USDT_ADDRESS, MockUSDTABI.abi, signerProvider);

      // 2. Wallet USDT Balance
      const usdtBal = await usdtContract.balanceOf(userAddress);
      setUsdtBalance(ethers.formatUnits(usdtBal, 18));

      // 3. Pool ETH Balance
      const poolEthBalance = await signerProvider.getBalance(LENDING_POOL_ADDRESS);
      setPoolLiquidity(ethers.formatEther(poolEthBalance));

      // 4. User Collateral
      const collateral = await poolContract.userCollateral(userAddress);
      setUserCollateral(ethers.formatUnits(collateral, 18));

      // 5. Account Data (Struct)
      const userData = await poolContract.getUserAccountData(userAddress);
      const debtETH = userData.totalDebtETH ?? userData[1];
      const maxBorrow = userData.maxBorrowETH ?? userData[2];
      const hFactor = userData.healthFactor ?? userData[3];

      setUserBorrowed(ethers.formatEther(debtETH));
      setMaxBorrowETH(ethers.formatEther(maxBorrow));

      if (hFactor > 1e30) {
        setHealthFactor("∞");
      } else {
        setHealthFactor(parseFloat(ethers.formatEther(hFactor)).toFixed(2));
      }

      // 6. Lender Supplied ETH
      const supplied = await poolContract.getLenderBalance(userAddress);
      setLenderSupplied(ethers.formatEther(supplied));

      // 7. Withdrawable Collateral
      const withdrawable = await poolContract.getWithdrawableCollateral(userAddress);
      setWithdrawableCollateral(ethers.formatUnits(withdrawable, 18));

      // 8. Raw Principal & On-Chain Timestamp
      const principal = await poolContract.principalBorrowed(userAddress);
      const lastTimestamp = await poolContract.lastBorrowerUpdateTimestamp
        ? await poolContract.lastBorrowerUpdateTimestamp(userAddress)
        : await poolContract.lastInterestTimestamp(userAddress);

      setRawPrincipal(principal);
      setOnChainTimestamp(Number(lastTimestamp));

    } catch (err) {
      console.error("Fetch error detail:", err);
    }
  };

  // Real-time Interest Ticking Engine synced to wall-clock time
  useEffect(() => {
    if (!account || rawPrincipal === BigInt(0) || onChainTimestamp === 0) {
      setLiveDebt(userBorrowed);
      return;
    }

    const updateLiveDebt = () => {
      const currentUnixTime = Math.floor(Date.now() / 1000);
      const elapsedSeconds = currentUnixTime > onChainTimestamp ? currentUnixTime - onChainTimestamp : 0;

      const ratePerSec = BigInt(1585489599); // ~5% APY in 1e18 scale
      const accruedInterest = (rawPrincipal * ratePerSec * BigInt(elapsedSeconds)) / BigInt(1e18);
      const totalWei = rawPrincipal + accruedInterest;

      setLiveDebt(ethers.formatEther(totalWei));
    };

    updateLiveDebt();
    const interval = setInterval(updateLiveDebt, 1000);

    return () => clearInterval(interval);
  }, [account, rawPrincipal, onChainTimestamp, userBorrowed]);

  const handleDepositETH = async () => {
    if (!depositEthAmount) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const poolContract = new ethers.Contract(LENDING_POOL_ADDRESS, LendingPoolABI.abi, signer);

      const tx = await poolContract.depositETH({ value: ethers.parseEther(depositEthAmount) });
      await tx.wait();
      setDepositEthAmount("");
      fetchData(account, provider);
    } catch (err) {
      alert("Deposit failed: " + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleWithdrawETH = async () => {
    if (!withdrawEthAmount) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const poolContract = new ethers.Contract(LENDING_POOL_ADDRESS, LendingPoolABI.abi, signer);

      const tx = await poolContract.withdrawETH(ethers.parseEther(withdrawEthAmount));
      await tx.wait();
      setWithdrawEthAmount("");
      fetchData(account, provider);
    } catch (err) {
      alert("Withdraw failed: " + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleMintUSDT = async () => {
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const usdtContract = new ethers.Contract(MOCK_USDT_ADDRESS, MockUSDTABI.abi, signer);

      const tx = await usdtContract.mint(account, ethers.parseUnits("1000", 18));
      await tx.wait();
      fetchData(account, provider);
    } catch (err) {
      alert("Mint failed: " + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleDepositCollateral = async () => {
    if (!collateralAmount) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const usdtContract = new ethers.Contract(MOCK_USDT_ADDRESS, MockUSDTABI.abi, signer);
      const poolContract = new ethers.Contract(LENDING_POOL_ADDRESS, LendingPoolABI.abi, signer);

      const amountParsed = ethers.parseUnits(collateralAmount, 18);
      const approveTx = await usdtContract.approve(LENDING_POOL_ADDRESS, amountParsed);
      await approveTx.wait();

      const tx = await poolContract.depositCollateral(amountParsed);
      await tx.wait();
      setCollateralAmount("");
      fetchData(account, provider);
    } catch (err) {
      alert("Deposit collateral failed: " + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleWithdrawCollateral = async () => {
    if (!withdrawCollateralAmount) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const poolContract = new ethers.Contract(LENDING_POOL_ADDRESS, LendingPoolABI.abi, signer);

      const tx = await poolContract.withdrawCollateral(ethers.parseUnits(withdrawCollateralAmount, 18));
      await tx.wait();
      setWithdrawCollateralAmount("");
      fetchData(account, provider);
    } catch (err) {
      alert("Withdraw collateral failed: " + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleBorrow = async () => {
    if (!borrowAmount) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const poolContract = new ethers.Contract(LENDING_POOL_ADDRESS, LendingPoolABI.abi, signer);

      const tx = await poolContract.borrowETH(ethers.parseEther(borrowAmount));
      await tx.wait();
      setBorrowAmount("");
      fetchData(account, provider);
    } catch (err) {
      alert("Borrow failed: " + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleRepay = async () => {
    if (!repayAmount) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const poolContract = new ethers.Contract(LENDING_POOL_ADDRESS, LendingPoolABI.abi, signer);

      const userData = await poolContract.getUserAccountData(account);
      const totalDebtWei = userData.totalDebtETH ?? userData[1];
      const inputWei = ethers.parseEther(repayAmount);

      // Add a 0.0001 ETH safety buffer when repaying MAX to cover on-chain timestamp drift
      let payAmountWei = inputWei > totalDebtWei ? totalDebtWei : inputWei;
      if (payAmountWei === totalDebtWei) {
        payAmountWei = totalDebtWei + ethers.parseEther("0.0001");
      }

      const tx = await poolContract.repayETH({ value: payAmountWei });
      await tx.wait();

      setRepayAmount("");
      fetchData(account, provider);
    } catch (err) {
      alert("Repay failed: " + (err.reason || err.message));
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "30px", fontFamily: "sans-serif", maxWidth: "950px", margin: "0 auto" }}>
      <h1>PeerPool Lending Dashboard</h1>

      {!account ? (
        <button onClick={connectWallet} style={{ padding: "10px 20px", fontSize: "16px" }}>
          Connect Wallet
        </button>
      ) : (
        <p><strong>Connected Wallet:</strong> {account}</p>
      )}

      {loading && <p style={{ color: "#0070f3", fontWeight: "bold" }}>Processing Transaction...</p>}

      <hr />

      {/* Overview Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "30px" }}>
        <div style={{ padding: "15px", border: "1px solid #ccc", borderRadius: "8px" }}>
          <h3>Wallet Balances</h3>
          <p>ETH Balance: {parseFloat(ethBalance).toFixed(4)} ETH</p>
          <p>mUSDT Balance: {parseFloat(usdtBalance).toFixed(2)} mUSDT</p>
          <button onClick={handleMintUSDT} disabled={loading}>Get 1000 Free mUSDT</button>
        </div>

        <div style={{ padding: "15px", border: "1px solid #ccc", borderRadius: "8px" }}>
          <h3>Position & Risk Overview</h3>
          <p>Total Pool Liquidity: {parseFloat(poolLiquidity).toFixed(4)} ETH</p>
          <p>Your Supplied Liquidity: {parseFloat(lenderSupplied).toFixed(4)} ETH</p>
          <p>Your Locked Collateral: {parseFloat(userCollateral).toFixed(2)} mUSDT</p>
          <p>Max Borrow Power: {parseFloat(maxBorrowETH).toFixed(4)} ETH</p>
          <p>Your Live Debt: <strong>{parseFloat(liveDebt || userBorrowed).toFixed(8)} ETH</strong></p>
          <p>Health Factor: <strong style={{ color: healthFactor < 1 ? "red" : "green" }}>{healthFactor}</strong></p>
        </div>
      </div>

      {/* Action Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* LENDER ACTIONS */}
        <div style={{ padding: "15px", border: "1px solid #ccc", borderRadius: "8px" }}>
          <h3>Supply Liquidity (Lender)</h3>
          <div style={{ marginBottom: "15px" }}>
            <input
              type="number"
              placeholder="ETH Amount"
              value={depositEthAmount}
              onChange={(e) => setDepositEthAmount(e.target.value)}
              style={{ width: "60%", padding: "8px", marginRight: "5px" }}
            />
            <button onClick={handleDepositETH} disabled={loading}>Deposit ETH</button>
          </div>

          <div>
            <div style={{ display: "flex", gap: "5px", marginBottom: "5px" }}>
              <input
                type="number"
                placeholder="ETH Amount"
                value={withdrawEthAmount}
                onChange={(e) => setWithdrawEthAmount(e.target.value)}
                style={{ width: "60%", padding: "8px" }}
              />
              <button onClick={() => setWithdrawEthAmount(lenderSupplied)}>MAX</button>
            </div>
            <button onClick={handleWithdrawETH} disabled={loading || parseFloat(lenderSupplied) === 0}>
              Withdraw Deposited ETH
            </button>
          </div>
        </div>

        {/* BORROWER COLLATERAL ACTIONS */}
        <div style={{ padding: "15px", border: "1px solid #ccc", borderRadius: "8px" }}>
          <h3>Manage Collateral (USDT)</h3>
          <div style={{ marginBottom: "15px" }}>
            <input
              type="number"
              placeholder="mUSDT Amount"
              value={collateralAmount}
              onChange={(e) => setCollateralAmount(e.target.value)}
              style={{ width: "60%", padding: "8px", marginRight: "5px" }}
            />
            <button onClick={handleDepositCollateral} disabled={loading}>Deposit mUSDT</button>
          </div>

          <div>
            <div style={{ display: "flex", gap: "5px", marginBottom: "5px" }}>
              <input
                type="number"
                placeholder="mUSDT Amount"
                value={withdrawCollateralAmount}
                onChange={(e) => setWithdrawCollateralAmount(e.target.value)}
                style={{ width: "60%", padding: "8px" }}
              />
              <button onClick={() => setWithdrawCollateralAmount(withdrawableCollateral)}>MAX</button>
            </div>
            <p style={{ fontSize: "11px", color: "#666" }}>
              Safe Max Withdrawable: {parseFloat(withdrawableCollateral).toFixed(2)} mUSDT
            </p>
            <button onClick={handleWithdrawCollateral} disabled={loading || parseFloat(withdrawableCollateral) === 0}>
              Withdraw Collateral
            </button>
          </div>
        </div>

        {/* BORROW ETH */}
        <div style={{ padding: "15px", border: "1px solid #ccc", borderRadius: "8px" }}>
          <h3>Borrow ETH</h3>
          <input
            type="number"
            placeholder="ETH Amount"
            value={borrowAmount}
            onChange={(e) => setBorrowAmount(e.target.value)}
            style={{ width: "60%", padding: "8px", marginRight: "5px", marginBottom: "10px" }}
          />
          <button onClick={handleBorrow} disabled={loading}>Borrow ETH</button>
        </div>

        {/* REPAY ETH */}
        <div style={{ padding: "15px", border: "1px solid #ccc", borderRadius: "8px" }}>
          <h3>Repay Debt</h3>
          <div style={{ display: "flex", gap: "5px", marginBottom: "10px" }}>
            <input
              type="number"
              placeholder="ETH Amount"
              value={repayAmount}
              onChange={(e) => setRepayAmount(e.target.value)}
              style={{ width: "60%", padding: "8px" }}
            />
            <button onClick={() => setRepayAmount(liveDebt || userBorrowed)}>MAX</button>
          </div>
          <button onClick={handleRepay} disabled={loading || parseFloat(userBorrowed) === 0}>
            Repay ETH
          </button>
        </div>
      </div>
    </div>
  );
}