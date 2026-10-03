import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

async function deployLendingPoolFixture() {
  const [deployer, lender, borrower] = await ethers.getSigners();
  const token = await ethers.deployContract("MockUSDT");
  const pool = await ethers.deployContract("LendingPool", [await token.getAddress()]);

  return { deployer, lender, borrower, token, pool };
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
    const liquidity = ethers.parseEther("1");
    const collateral = ethers.parseUnits("1000", 18);
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
});