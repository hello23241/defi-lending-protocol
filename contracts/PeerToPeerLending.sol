// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PeerToPeerLending is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum LoanStatus {
        Pending,
        Active,
        Paid,
        Liquidated,
        Cancelled
    }

    struct Loan {
        uint256 loanId;
        address payable borrower;
        address payable lender;
        address collateralToken;
        uint256 collateralAmount;
        address loanToken;
        uint256 loanAmount;
        uint256 interestRate;
        uint256 duration;
        uint256 startTime;
        LoanStatus status;
    }

    uint256 public nextLoanId = 1;
    mapping(uint256 => Loan) public loans;

    event LoanCreated(
        uint256 indexed loanId,
        address indexed borrower,
        address collateralToken,
        uint256 collateralAmount,
        address loanToken,
        uint256 loanAmount,
        uint256 interestRate,
        uint256 duration
    );
    event LoanFunded(uint256 indexed loanId, address indexed lender, uint256 startTime);
    event LoanRepaid(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 principal,
        uint256 interest,
        uint256 totalRepayment
    );
    event LoanLiquidated(uint256 indexed loanId, address indexed lender, uint256 collateralAmount);
    event LoanCancelled(uint256 indexed loanId, address indexed borrower, uint256 collateralAmount);

    constructor() Ownable(msg.sender) {}

    function createLoan(
        address collateralToken,
        uint256 collateralAmount,
        address loanToken,
        uint256 loanAmount,
        uint256 interestRate,
        uint256 duration
    ) external nonReentrant returns (uint256 loanId) {
        require(collateralToken != address(0), "Invalid collateral token");
        require(loanToken != address(0), "Invalid loan token");
        require(collateralAmount > 0, "Collateral amount is zero");
        require(loanAmount > 0, "Loan amount is zero");
        require(duration > 0, "Duration is zero");

        loanId = nextLoanId++;
        loans[loanId] = Loan({
            loanId: loanId,
            borrower: payable(msg.sender),
            lender: payable(address(0)),
            collateralToken: collateralToken,
            collateralAmount: collateralAmount,
            loanToken: loanToken,
            loanAmount: loanAmount,
            interestRate: interestRate,
            duration: duration,
            startTime: 0,
            status: LoanStatus.Pending
        });

        IERC20(collateralToken).safeTransferFrom(msg.sender, address(this), collateralAmount);

        emit LoanCreated(
            loanId,
            msg.sender,
            collateralToken,
            collateralAmount,
            loanToken,
            loanAmount,
            interestRate,
            duration
        );
    }

    function fundLoan(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.loanId != 0, "Loan does not exist");
        require(loan.status == LoanStatus.Pending, "Loan is not pending");
        require(msg.sender != loan.borrower, "Borrower cannot fund loan");

        loan.lender = payable(msg.sender);
        loan.startTime = block.timestamp;
        loan.status = LoanStatus.Active;

        IERC20(loan.loanToken).safeTransferFrom(msg.sender, address(this), loan.loanAmount);
        IERC20(loan.loanToken).safeTransfer(loan.borrower, loan.loanAmount);

        emit LoanFunded(loanId, msg.sender, loan.startTime);
    }

    function repayLoan(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.loanId != 0, "Loan does not exist");
        require(loan.status == LoanStatus.Active, "Loan is not active");
        require(msg.sender == loan.borrower, "Only borrower can repay");
        require(block.timestamp <= loan.startTime + loan.duration, "Loan is overdue");

        uint256 interest = (loan.loanAmount * loan.interestRate) / 100;
        uint256 totalRepayment = loan.loanAmount + interest;

        loan.status = LoanStatus.Paid;
        IERC20(loan.loanToken).safeTransferFrom(msg.sender, address(this), totalRepayment);
        IERC20(loan.loanToken).safeTransfer(loan.lender, totalRepayment);
        IERC20(loan.collateralToken).safeTransfer(loan.borrower, loan.collateralAmount);

        emit LoanRepaid(loanId, msg.sender, loan.loanAmount, interest, totalRepayment);
    }

    function liquidateLoan(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.loanId != 0, "Loan does not exist");
        require(loan.status == LoanStatus.Active, "Loan is not active");
        require(block.timestamp > loan.startTime + loan.duration, "Loan is not overdue");
        require(msg.sender == loan.lender, "Only lender can liquidate");

        loan.status = LoanStatus.Liquidated;
        IERC20(loan.collateralToken).safeTransfer(loan.lender, loan.collateralAmount);

        emit LoanLiquidated(loanId, msg.sender, loan.collateralAmount);
    }

    function cancelLoan(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.loanId != 0, "Loan does not exist");
        require(loan.status == LoanStatus.Pending, "Loan is not pending");
        require(msg.sender == loan.borrower, "Only borrower can cancel");

        loan.status = LoanStatus.Cancelled;
        IERC20(loan.collateralToken).safeTransfer(loan.borrower, loan.collateralAmount);

        emit LoanCancelled(loanId, msg.sender, loan.collateralAmount);
    }

    function calculateInterest(uint256 loanId) public view returns (uint256) {
        Loan storage loan = loans[loanId];
        require(loan.loanId != 0, "Loan does not exist");
        return (loan.loanAmount * loan.interestRate) / 100;
    }

    function calculateTotalRepayment(uint256 loanId) public view returns (uint256) {
        Loan storage loan = loans[loanId];
        require(loan.loanId != 0, "Loan does not exist");
        return loan.loanAmount + calculateInterest(loanId);
    }
}
