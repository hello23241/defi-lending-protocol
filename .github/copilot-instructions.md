# GitHub Copilot Custom Instructions for P2P Crypto Lending & Collateral Smart Contract Project

## 1. Project Overview
This project is a Decentralized Peer-to-Peer (P2P) Crypto Lending and Collateral Platform using Smart Contracts.
- **Language/Stack**: Solidity (^0.8.20), Node.js, Hardhat, Ethers.js (v6), React.js / Next.js, OpenZeppelin v5.
- **Goal**: Allow Borrowers to lock ERC-20 tokens as collateral to borrow other ERC-20 tokens (or Stablecoins) from Lenders in a peer-to-peer, non-custodial manner.

---

## 2. Core Domain Parameters & Constants

### A. Loan Parameters
When generating functions, forms, or tests, use the following standardized parameter definitions:
- `loanId` (`uint256`): Auto-incrementing unique identifier for each loan request.
- `borrower` (`address payable`): Address of the user requesting the loan and depositing collateral.
- `lender` (`address payable`): Address of the user providing the loan principal.
- `collateralToken` (`address`): ERC-20 contract address used as collateral (e.g., Mock WBTC/WETH).
- `collateralAmount` (`uint256`): Amount of collateral deposited (in wei / base unit 10^18).
- `loanToken` (`address`): ERC-20 contract address of the requested loan principal (e.g., Mock USDT/USDC).
- `loanAmount` (`uint256`): Amount of principal requested (in wei / base unit 10^18).
- `interestRate` (`uint256`): Fixed simple interest rate percentage for the loan duration (e.g., `10` = 10%).
- `duration` (`uint256`): Loan period expressed strictly in seconds (e.g., 30 days = `2592000` seconds).
- `startTime` (`uint256`): Unix timestamp recorded when the loan is funded by the lender (`block.timestamp`).
- `status` (`enum`): Loan life cycle state:
  - `0: Pending` - Created by Borrower, waiting for Lender.
  - `1: Active` - Funded by Lender, currently accruing term time.
  - `2: Paid` - Principal + Interest fully repaid, collateral returned to Borrower.
  - `3: Liquidated` - Defaulted past maturity date, collateral seized by Lender.
  - `4: Cancelled` - Cancelled by Borrower before funding, collateral returned.

### B. Business Logic Calculations
- **Total Interest Amount**: $\text{Interest} = \frac{\text{loanAmount} \times \text{interestRate}}{100}$
- **Total Repayment Amount**: $\text{TotalRepay} = \text{loanAmount} + \text{Interest}$
- **Liquidation Condition**: `block.timestamp > startTime + duration` while status is `Active`.

---

## 3. Code Generation Rules & Guidelines

### Solidity Rules (Backend - Smart Contracts)
1. **Solidity Version**: `^0.8.20`. Always use OpenZeppelin 5.x contracts (`IERC20`, `SafeERC20`, `ReentrancyGuard`, `Ownable`).
2. **Security**:
   - Apply `nonReentrant` modifier to functions that transfer tokens (`fundLoan`, `repayLoan`, `liquidateLoan`, `cancelLoan`).
   - Use `SafeERC20` wrapper (`safeTransfer`, `safeTransferFrom`) for all ERC-20 token operations.
   - Always validate state inputs using `require` statements with clear error messages or custom errors.
3. **Events**: Emit events for every state change (`LoanCreated`, `LoanFunded`, `LoanRepaid`, `LoanLiquidated`, `LoanCancelled`).

### JavaScript / Hardhat Testing Rules
1. **Framework**: Hardhat with `@nomicfoundation/hardhat-toolbox` and `ethers.js v6`.
2. **Testing Structure**: Use Mocha/Chai (`describe`, `it`, `expect`).
3. **Time Manipulation**: Use `time.increase()` or `time.increaseTo()` from `@nomicfoundation/hardhat-network-helpers` when testing loan duration expiration and liquidation.
4. **Mock Tokens**: Use a generic `MockERC20` contract (mintable ERC-20) to simulate collateral and principal assets during test runs.

### Frontend Integration Rules (React/Next.js)
1. **Web3 Connection**: Use Ethers.js v6 syntax (`BrowserProvider`, `Contract`, `parseEther`, `formatEther`).
2. **Allowance Handling**: Before calling `createLoan` or `repayLoan`/`fundLoan`, always generate the two-step transaction pattern: Check/Approve ERC-20 allowance (`token.approve(lendingContractAddress, amount)`) before calling contract methods.
3. **BigInt Compatibility**: Always treat token amounts and timestamps as `BigInt` or `ethers.BigNumber` in JavaScript/TypeScript code.

---

## 4. File Structure & Path Mapping
When generating code snippets or files, respect this project layout:
- Contracts: `/contracts/PeerToPeerLending.sol`, `/contracts/mocks/MockERC20.sol`
- Deployment Scripts: `/scripts/deploy.js`
- Test Suites: `/test/PeerToPeerLending.test.js`
- Frontend Components: `/frontend/src/components/`