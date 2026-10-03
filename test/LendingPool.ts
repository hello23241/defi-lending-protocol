import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

async function deployLendingPoolFixture() {
  const [deployer, lender, borrower] = await ethers.getSigners();
  const token = await ethers.deployContract("MockUSDT");
  const oracle = await ethers.deployContract("MockChainlinkOracle", [2655_00000000n]);
  const pool = await ethers.deployContract("LendingPool", [
    await token.getAddress(),
    await oracle.getAddress(),
  ]);

  return { deployer, lender, borrower, token, oracle, pool };
}

describe("LendingPool", function () {
  it("wires the collateral token and mints the initial test supply", async function () {
    const { deployer, token, pool } = await networkHelpers.loadFixture(
      deployLendingPoolFixture,
    );
    const initialSupply = 1_000_000n * 10n ** 18n;

    expect(await pool.collateralToken()).to.equal(await token.getAddress());
    expect(await token.balanceOf(deployer.address)).to.equal(initialSupply);
    expect(await token.totalSupply()).to.equal(initialSupply);
    expect(await pool.lastGlobalUpdateTimestamp()).to.be.greaterThan(0n);
  });

  it("accepts lender ETH deposits and reports the lender balance", async function () {
    const { lender, pool } = await networkHelpers.loadFixture(deployLendingPoolFixture);
    const liquidity = ethers.parseEther("1");

    await expect(pool.connect(lender).depositETH({ value: liquidity }))
      .to.emit(pool, "Deposit")
      .withArgs(lender.address, liquidity);

    expect(await pool.totalEthDeposited()).to.equal(liquidity);
    expect(await pool.getLenderBalance(lender.address)).to.equal(liquidity);
  });

  it("accepts collateral, allows a safe borrow, accrues interest, and repays", async function () {
    const { lender, borrower, token, pool } = await networkHelpers.loadFixture(
      deployLendingPoolFixture,
    );
    const liquidity = ethers.parseEther("2");
    const collateral = ethers.parseUnits("10000", 18);
    const borrowAmount = ethers.parseEther("0.1");

    await pool.connect(lender).depositETH({ value: liquidity });
    await token.connect(borrower).mint(borrower.address, collateral);
    await token.connect(borrower).approve(await pool.getAddress(), collateral);

    await expect(pool.connect(borrower).depositCollateral(collateral))
      .to.emit(pool, "CollateralDeposited")
      .withArgs(borrower.address, collateral);

    const accountData = await pool.getUserAccountData(borrower.address);
    const collateralValue = await pool.getCollateralETHValue(collateral);
    expect(accountData.maxBorrowETH).to.equal((collateralValue * 70n) / 100n);

    await expect(pool.connect(borrower).borrowETH(borrowAmount))
      .to.emit(pool, "Borrow")
      .withArgs(borrower.address, borrowAmount);

    expect(await pool.principalBorrowed(borrower.address)).to.equal(borrowAmount);

    await networkHelpers.time.increase(60);
    expect(await pool.getTotalDebt(borrower.address)).to.be.greaterThan(borrowAmount);

    await pool.connect(borrower).repayETH({ value: borrowAmount + ethers.parseEther("0.0001") });
    expect(await pool.principalBorrowed(borrower.address)).to.equal(0n);
    expect(await pool.getTotalDebt(borrower.address)).to.equal(0n);
  });

  it("normalizes the Chainlink price and exposes a kinked borrow rate", async function () {
    const { lender, token, borrower, pool } = await networkHelpers.loadFixture(
      deployLendingPoolFixture,
    );
    const liquidity = ethers.parseEther("2");
    const collateral = ethers.parseUnits("10000", 18);

    await pool.connect(lender).depositETH({ value: liquidity });
    expect(await pool.getCollateralETHValue(ethers.parseUnits("2655", 18))).to.equal(
      ethers.parseEther("1"),
    );

    await token.connect(borrower).mint(borrower.address, collateral);
    await token.connect(borrower).approve(await pool.getAddress(), collateral);
    await pool.connect(borrower).depositCollateral(collateral);
    await pool.connect(borrower).borrowETH(ethers.parseEther("0.7"));

    const belowKinkRate = await pool.getBorrowRatePerSec();
    await pool.connect(borrower).borrowETH(ethers.parseEther("1"));
    const aboveKinkRate = await pool.getBorrowRatePerSec();
    expect(aboveKinkRate).to.be.greaterThan(belowKinkRate);
  });

  it("updates global state before balance-changing operations", async function () {
    const { lender, pool } = await networkHelpers.loadFixture(deployLendingPoolFixture);
    await pool.connect(lender).depositETH({ value: ethers.parseEther("1") });
    const before = await pool.lastGlobalUpdateTimestamp();

    await networkHelpers.time.increase(60);
    await pool.connect(lender).depositETH({ value: ethers.parseEther("1") });

    expect(await pool.lastGlobalUpdateTimestamp()).to.be.greaterThan(before);
  });

  it("restricts protocol fee withdrawals and checks pool liquidity", async function () {
    const { lender, borrower, token, pool } = await networkHelpers.loadFixture(
      deployLendingPoolFixture,
    );
    const collateral = ethers.parseUnits("1000", 18);
    await pool.connect(lender).depositETH({ value: ethers.parseEther("1") });
    await token.connect(borrower).mint(borrower.address, collateral);
    await token.connect(borrower).approve(await pool.getAddress(), collateral);
    await pool.connect(borrower).depositCollateral(collateral);
    await pool.connect(borrower).borrowETH(ethers.parseEther("0.1"));
    await networkHelpers.time.increase(365 * 24 * 60 * 60);
    await pool.connect(lender).depositETH({ value: 1n });

    const fees = await pool.protocolFees();
    expect(fees).to.be.greaterThan(0n);
    await expect(pool.connect(lender).withdrawProtocolFees(fees)).to.be.revertedWithCustomError(
      pool,
      "OwnableUnauthorizedAccount",
    );
    await expect(pool.withdrawProtocolFees(fees + 1n)).to.be.revertedWith(
      "Exceeds protocol fees",
    );
  });
});