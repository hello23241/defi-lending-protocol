import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const TOKEN_UNIT = 10n ** 18n;
const COLLATERAL_AMOUNT = 2n * TOKEN_UNIT;
const LOAN_AMOUNT = 1_000n * TOKEN_UNIT;
const INTEREST_RATE = 10n;
const LOAN_DURATION = 30n * 24n * 60n * 60n;
const INTEREST_AMOUNT = (LOAN_AMOUNT * INTEREST_RATE) / 100n;
const TOTAL_REPAYMENT = LOAN_AMOUNT + INTEREST_AMOUNT;

async function deployFixture() {
	const [deployer, borrower, lender, thirdParty] = await ethers.getSigners();
	const collateralToken = await ethers.deployContract("MockERC20", ["Mock WBTC", "WBTC"]);
	const loanToken = await ethers.deployContract("MockERC20", ["Mock USDT", "USDT"]);
	const lending = await ethers.deployContract("PeerToPeerLending");

	await collateralToken.mint(borrower.address, COLLATERAL_AMOUNT);
	await loanToken.mint(lender.address, LOAN_AMOUNT);
	await loanToken.mint(borrower.address, TOTAL_REPAYMENT);

	return { deployer, borrower, lender, thirdParty, collateralToken, loanToken, lending };
}

async function createLoanFixture() {
	const fixture = await deployFixture();
	const collateralAddress = await fixture.collateralToken.getAddress();
	const loanAddress = await fixture.loanToken.getAddress();
	const lendingAddress = await fixture.lending.getAddress();

	await fixture.collateralToken.connect(fixture.borrower).approve(lendingAddress, COLLATERAL_AMOUNT);
	await fixture.lending.connect(fixture.borrower).createLoan(
		collateralAddress,
		COLLATERAL_AMOUNT,
		loanAddress,
		LOAN_AMOUNT,
		INTEREST_RATE,
		LOAN_DURATION,
	);

	return { ...fixture, collateralAddress, loanAddress, lendingAddress };
}

describe("PeerToPeerLending", function () {
	describe("createLoan", function () {
		it("locks collateral, stores the request, and emits LoanCreated", async function () {
			const fixture = await networkHelpers.loadFixture(deployFixture);
			const collateralAddress = await fixture.collateralToken.getAddress();
			const loanAddress = await fixture.loanToken.getAddress();
			const lendingAddress = await fixture.lending.getAddress();

			await fixture.collateralToken
				.connect(fixture.borrower)
				.approve(lendingAddress, COLLATERAL_AMOUNT);

			await expect(
				fixture.lending.connect(fixture.borrower).createLoan(
					collateralAddress,
					COLLATERAL_AMOUNT,
					loanAddress,
					LOAN_AMOUNT,
					INTEREST_RATE,
					LOAN_DURATION,
				),
			)
				.to.emit(fixture.lending, "LoanCreated")
				.withArgs(
					1n,
					fixture.borrower.address,
					collateralAddress,
					COLLATERAL_AMOUNT,
					loanAddress,
					LOAN_AMOUNT,
					INTEREST_RATE,
					LOAN_DURATION,
				);

			const loan = await fixture.lending.loans(1n);
			expect(loan.borrower).to.equal(fixture.borrower.address);
			expect(loan.status).to.equal(0n);
			expect(await fixture.collateralToken.balanceOf(lendingAddress)).to.equal(COLLATERAL_AMOUNT);
			expect(await fixture.collateralToken.balanceOf(fixture.borrower.address)).to.equal(0n);
		});
	});

	describe("fundLoan and repayLoan", function () {
		it("funds an active loan and repays principal plus interest", async function () {
			const { borrower, lender, collateralToken, loanToken, lending, lendingAddress } =
				await networkHelpers.loadFixture(createLoanFixture);

			await loanToken.connect(lender).approve(lendingAddress, LOAN_AMOUNT);
			const fundingTx = lending.connect(lender).fundLoan(1n);
			await expect(fundingTx)
				.to.emit(lending, "LoanFunded")
				.withArgs(1n, lender.address, BigInt(await networkHelpers.time.latest()) + 1n);

			expect(await loanToken.balanceOf(borrower.address)).to.equal(LOAN_AMOUNT + TOTAL_REPAYMENT);
			expect((await lending.loans(1n)).status).to.equal(1n);

			await loanToken.connect(borrower).approve(lendingAddress, TOTAL_REPAYMENT);
			await expect(lending.connect(borrower).repayLoan(1n))
				.to.emit(lending, "LoanRepaid")
				.withArgs(1n, borrower.address, LOAN_AMOUNT, INTEREST_AMOUNT, TOTAL_REPAYMENT);

			expect((await lending.loans(1n)).status).to.equal(2n);
			expect(await loanToken.balanceOf(lender.address)).to.equal(TOTAL_REPAYMENT);
			expect(await collateralToken.balanceOf(borrower.address)).to.equal(COLLATERAL_AMOUNT);
		});

		it("rejects funding by the borrower", async function () {
			const { borrower, lending } = await networkHelpers.loadFixture(createLoanFixture);
			await expect(lending.connect(borrower).fundLoan(1n)).to.be.revertedWith(
				"Borrower cannot fund loan",
			);
		});
	});

	describe("liquidateLoan", function () {
		it("transfers collateral to the lender after maturity", async function () {
			const { lender, collateralToken, loanToken, lending, lendingAddress } =
				await networkHelpers.loadFixture(createLoanFixture);

			await loanToken.connect(lender).approve(lendingAddress, LOAN_AMOUNT);
			await lending.connect(lender).fundLoan(1n);
			await networkHelpers.time.increase(LOAN_DURATION + 1n);

			await expect(lending.connect(lender).liquidateLoan(1n))
				.to.emit(lending, "LoanLiquidated")
				.withArgs(1n, lender.address, COLLATERAL_AMOUNT);

			expect((await lending.loans(1n)).status).to.equal(3n);
			expect(await collateralToken.balanceOf(lender.address)).to.equal(COLLATERAL_AMOUNT);
		});
	});

	describe("cancelLoan", function () {
		it("returns pending collateral to the borrower", async function () {
			const { borrower, collateralToken, lending } = await networkHelpers.loadFixture(createLoanFixture);

			await expect(lending.connect(borrower).cancelLoan(1n))
				.to.emit(lending, "LoanCancelled")
				.withArgs(1n, borrower.address, COLLATERAL_AMOUNT);

			expect((await lending.loans(1n)).status).to.equal(4n);
			expect(await collateralToken.balanceOf(borrower.address)).to.equal(COLLATERAL_AMOUNT);
		});
	});
});
