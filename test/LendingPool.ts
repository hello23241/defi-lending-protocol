import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

async function deployLendingPoolFixture() {
  const [deployer, lender, borrower] = await ethers.getSigners();
  const feed = await ethers.deployContract("TestChainlinkFeed", [2655_00000000n]);
  const oracle = await ethers.deployContract("ChainlinkOracle", [await feed.getAddress()]);
  const token = await ethers.deployContract("MockUSDT", [await oracle.getAddress()]);
  const pool = await ethers.deployContract("LendingPool", [
    await token.getAddress(),
    await oracle.getAddress(),
  ]);
  await token.setLendingPool(await pool.getAddress());

  return { deployer, lender, borrower, token, oracle, pool };
}

describe("LendingPool", function () {
  it("wires the collateral token and starts with no unbacked supply", async function () {
    const { deployer, token, pool } = await networkHelpers.loadFixture(
      deployLendingPoolFixture,
    );
    expect(await pool.collateralToken()).to.equal(await token.getAddress());
    expect(await token.balanceOf(deployer.address)).to.equal(0n);
    expect(await token.totalSupply()).to.equal(0n);
    expect(await pool.lastGlobalUpdateTimestamp()).to.be.greaterThan(0n);
  });

  it("supports paid and owner-only free minting plus oracle overrides", async function () {
    const { deployer, borrower, token, oracle } = await networkHelpers.loadFixture(
      deployLendingPoolFixture,
    );

    const amount = ethers.parseUnits("2500", 18);
    await token.connect(borrower).mint(amount, { value: await token.quoteMint(amount) });
    expect(await token.balanceOf(borrower.address)).to.equal(amount);
    const freeAmount = ethers.parseUnits("100000", 18);
    await token.mintFree(deployer.address, freeAmount);
    expect(await token.balanceOf(deployer.address)).to.equal(freeAmount);
    await expect(token.connect(borrower).mintFree(borrower.address, freeAmount))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
      .withArgs(borrower.address);
    await expect(oracle.connect(borrower).setTemporaryPrice(2_000_00000000n))
      .to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount")
      .withArgs(borrower.address);
    expect(await oracle.TEMPORARY_OVERRIDE_DURATION()).to.equal(120n);
  });

  it("allows only the owner to withdraw ETH held by mUSDT", async function () {
    const { deployer, borrower, token } = await networkHelpers.loadFixture(
      deployLendingPoolFixture,
    );
    const mintAmount = ethers.parseUnits("2500", 18);
    const ethPaid = await token.quoteMint(mintAmount);
    await token.connect(borrower).mint(mintAmount, { value: ethPaid });

    await expect(token.connect(borrower).withdrawETH(ethPaid))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
      .withArgs(borrower.address);
    await expect(token.withdrawETH(ethPaid))
      .to.emit(token, "ETHWithdrawn")
      .withArgs(deployer.address, ethPaid);
    expect(await ethers.provider.getBalance(await token.getAddress())).to.equal(0n);
  });

  it("configures the reserve factor within the owner cap", async function () {
    const { borrower, pool } = await networkHelpers.loadFixture(
      deployLendingPoolFixture,
    );

    expect(await pool.reserveFactor()).to.equal(2000n);
    await expect(pool.setReserveFactor(2500n))
      .to.emit(pool, "ReserveFactorUpdated")
      .withArgs(2500n);
    expect(await pool.reserveFactor()).to.equal(2500n);
    await expect(pool.setReserveFactor(3501n)).to.be.revertedWith(
      "Exceeds max reserve factor",
    );
    await expect(pool.connect(borrower).setReserveFactor(2000n))
      .to.be.revertedWithCustomError(pool, "OwnableUnauthorizedAccount")
      .withArgs(borrower.address);
  });

  it("reports no sweepable ETH when the pool has no untracked surplus", async function () {
    const { deployer, borrower, pool } = await networkHelpers.loadFixture(
      deployLendingPoolFixture,
    );
    const [trackedBalance, excess] = await pool.getSweepableExcessETH();
    expect(trackedBalance).to.equal(0n);
    expect(excess).to.equal(0n);
    await expect(pool.connect(borrower).sweepExcessETH())
      .to.be.revertedWithCustomError(pool, "OwnableUnauthorizedAccount")
      .withArgs(borrower.address);
    await expect(pool.connect(deployer).sweepExcessETH()).to.not.revert(ethers);
  });

  it("guards reserve buffer withdrawals", async function () {
    const { borrower, pool } = await networkHelpers.loadFixture(
      deployLendingPoolFixture,
    );

    await expect(pool.withdrawReserveBuffer(1n)).to.be.revertedWith(
      "Exceeds reserve buffer",
    );
    await expect(pool.connect(borrower).withdrawReserveBuffer(0n))
      .to.be.revertedWithCustomError(pool, "OwnableUnauthorizedAccount")
      .withArgs(borrower.address);
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
    await token.connect(borrower).mint(collateral, { value: await token.quoteMint(collateral) });
    await token.connect(borrower).approve(await pool.getAddress(), collateral);

    await expect(pool.connect(borrower).depositCollateral(collateral))
      .to.emit(pool, "CollateralDeposited")
      .withArgs(borrower.address, collateral);

    const accountData = await pool.getUserAccountData(borrower.address);
    const collateralValue = await pool.getCollateralETHValue(collateral);
    expect(accountData.maxBorrowETH).to.equal((collateralValue * 80n) / 100n);

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

  it("transfers liquidation collateral and bonus to the liquidator", async function () {
    const { deployer, lender, borrower, token, oracle, pool } =
      await networkHelpers.loadFixture(deployLendingPoolFixture);
    const collateral = ethers.parseUnits("2000", 18);
    const debt = ethers.parseEther("0.35");

    await pool.connect(lender).depositETH({ value: ethers.parseEther("1") });
    await token.connect(borrower).mint(collateral, { value: await token.quoteMint(collateral) });
    await token.connect(borrower).approve(await pool.getAddress(), collateral);
    await pool.connect(borrower).depositCollateral(collateral);
    await pool.connect(borrower).borrowETH(debt);
    await oracle.setTemporaryPrice(5_000_00000000n);

    const accountData = await pool.getUserAccountData(borrower.address);
    expect(accountData.healthFactor).to.be.lessThan(ethers.parseEther("1"));

    const debtToCover = await pool.getTotalDebt(borrower.address);
    const liquidatorBefore = await token.balanceOf(deployer.address);

    const liquidationLimit = debtToCover + ethers.parseEther("0.001");
    await expect(pool.connect(deployer).liquidate(borrower.address, liquidationLimit, { value: liquidationLimit }))
      .to.emit(pool, "Liquidated");

    const liquidatorAfter = await token.balanceOf(deployer.address);
    const seized = liquidatorAfter - liquidatorBefore;
    expect(seized).to.be.greaterThan(0n);
    expect(seized).to.be.lessThanOrEqual(collateral);
    expect(await pool.userCollateral(borrower.address)).to.equal(collateral - seized);
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

    await token.connect(borrower).mint(collateral, { value: await token.quoteMint(collateral) });
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
    await token.connect(borrower).mint(collateral, { value: await token.quoteMint(collateral) });
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
    await expect(pool.withdrawProtocolFees(fees + ethers.parseEther("1000"))).to.be.revertedWith(
      "Exceeds protocol fees",
    );
  });
});
