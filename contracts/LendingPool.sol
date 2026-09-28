// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LendingPool is ReentrancyGuard {
    IERC20 public immutable collateralToken;

    // Protocol Constants
    uint256 public constant LTV = 70;                   // Max borrow power: 70%
    uint256 public constant LIQUIDATION_THRESHOLD = 80; // Liquidation triggers at 80% LTV
    uint256 public constant LIQUIDATION_BONUS = 5;      // Liquidator receives 5% bonus collateral
    uint256 public constant RESERVE_FACTOR = 10;        // 10% interest to protocol reserves
    
    // ~5% APY per second (scaled 1e18)
    uint256 public constant BORROW_RATE_PER_SEC = 1585489599; 

    // Price Oracle: 1 ETH = 2,655 USDT (1 USDT = 0.000376647834274953 ETH)
    uint256 public usdtPriceInEth = 376647834274953;

    // Global Liquidity Index for Lender Yield
    uint256 public liquidityIndex = 1e18;
    uint256 public lastGlobalUpdateTimestamp;
    uint256 public totalEthDeposited;
    uint256 public reserveBalance;

    // Borrower State
    mapping(address => uint256) public principalBorrowed;
    mapping(address => uint256) public userCollateral;
    mapping(address => uint256) public lastBorrowerUpdateTimestamp;

    // Lender State
    mapping(address => uint256) public lenderDepositShares;
    mapping(address => uint256) public userLiquidityIndex;

    struct UserAccountData {
        uint256 totalCollateralETH;
        uint256 totalDebtETH;
        uint256 maxBorrowETH;
        uint256 healthFactor;
        uint256 lastUpdateTimestamp;
    }

    event Deposit(address indexed lender, uint256 amount);
    event Withdraw(address indexed lender, uint256 amount);
    event CollateralDeposited(address indexed borrower, uint256 amount);
    event CollateralWithdrawn(address indexed borrower, uint256 amount);
    event Borrow(address indexed borrower, uint256 amount);
    event Repay(address indexed borrower, uint256 amount);
    event Liquidated(address indexed borrower, address indexed liquidator, uint256 debtRepaid, uint256 collateralSeized);

    constructor(address _collateralToken) {
        collateralToken = IERC20(_collateralToken);
        lastGlobalUpdateTimestamp = block.timestamp;
    }

    // ------------------------------------------------------------------------
    // HELPERS
    // ------------------------------------------------------------------------

    function getAccruedInterest(address borrower) public view returns (uint256) {
        if (principalBorrowed[borrower] == 0) return 0;
        uint256 timeElapsed = block.timestamp - lastBorrowerUpdateTimestamp[borrower];
        return (principalBorrowed[borrower] * BORROW_RATE_PER_SEC * timeElapsed) / 1e18;
    }

    function getTotalDebt(address borrower) public view returns (uint256) {
        return principalBorrowed[borrower] + getAccruedInterest(borrower);
    }

    function getCollateralETHValue(uint256 usdtAmount) public view returns (uint256) {
        return (usdtAmount * usdtPriceInEth) / 1e18;
    }

    function getLenderBalance(address lender) public view returns (uint256) {
        uint256 shares = lenderDepositShares[lender];
        if (shares == 0) return 0;
        uint256 userIdx = userLiquidityIndex[lender];
        if (userIdx == 0) userIdx = 1e18;

        return (shares * liquidityIndex) / userIdx;
    }

    function getWithdrawableCollateral(address user) public view returns (uint256) {
        uint256 totalCollateralUSDT = userCollateral[user];
        if (totalCollateralUSDT == 0) return 0;

        uint256 totalDebtETH = getTotalDebt(user);
        if (totalDebtETH == 0) return totalCollateralUSDT;

        uint256 totalCollateralETH = getCollateralETHValue(totalCollateralUSDT);
        uint256 minRequiredCollateralETH = (totalDebtETH * 100) / 78; // 80% Liquidation Threshold with 2% buffer

        if (totalCollateralETH <= minRequiredCollateralETH) return 0;

        uint256 excessETH = totalCollateralETH - minRequiredCollateralETH;
        return (excessETH * 1e18) / usdtPriceInEth;
    }

    function getUserAccountData(address user) public view returns (UserAccountData memory data) {
    data.totalCollateralETH = getCollateralETHValue(userCollateral[user]);
    data.totalDebtETH = getTotalDebt(user);
    
    uint256 maxBorrowAllowed = (data.totalCollateralETH * LTV) / 100;
        if (data.totalDebtETH >= maxBorrowAllowed) {
            data.maxBorrowETH = 0;
        } else {
            data.maxBorrowETH = maxBorrowAllowed - data.totalDebtETH;
        }

    data.lastUpdateTimestamp = lastBorrowerUpdateTimestamp[user]; // <--- Capture timestamp

        if (data.totalDebtETH == 0) {
            data.healthFactor = type(uint256).max;
        } else {
            uint256 liquidationThresholdETH = (data.totalCollateralETH * LIQUIDATION_THRESHOLD) / 100;
            data.healthFactor = (liquidationThresholdETH * 1e18) / data.totalDebtETH;
        }
    }

    // ------------------------------------------------------------------------
    // LENDER FUNCTIONS
    // ------------------------------------------------------------------------

    function depositETH() external payable nonReentrant {
        require(msg.value > 0, "Zero deposit");

        if (lenderDepositShares[msg.sender] > 0) {
            lenderDepositShares[msg.sender] = getLenderBalance(msg.sender);
        } else {
            userLiquidityIndex[msg.sender] = liquidityIndex;
        }

        lenderDepositShares[msg.sender] += msg.value;
        totalEthDeposited += msg.value;

        emit Deposit(msg.sender, msg.value);
    }

    function withdrawETH(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero withdrawal");

        uint256 totalBalance = getLenderBalance(msg.sender);
        require(totalBalance >= amount, "Exceeds lender balance");
        require(address(this).balance >= amount, "Insufficient pool liquidity");

        lenderDepositShares[msg.sender] = totalBalance - amount;
        userLiquidityIndex[msg.sender] = liquidityIndex;

        if (amount <= totalEthDeposited) {
            totalEthDeposited -= amount;
        } else {
            totalEthDeposited = 0;
        }

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");

        emit Withdraw(msg.sender, amount);
    }

    // ------------------------------------------------------------------------
    // BORROWER FUNCTIONS
    // ------------------------------------------------------------------------

    function depositCollateral(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero collateral");
        require(collateralToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        userCollateral[msg.sender] += amount;
        emit CollateralDeposited(msg.sender, amount);
    }

    function withdrawCollateral(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero withdrawal");
        require(userCollateral[msg.sender] >= amount, "Exceeds deposited collateral");

        if (principalBorrowed[msg.sender] > 0) {
            uint256 accrued = getAccruedInterest(msg.sender);
            principalBorrowed[msg.sender] += accrued;
            _distributeInterest(accrued);
        }
        lastBorrowerUpdateTimestamp[msg.sender] = block.timestamp;

        userCollateral[msg.sender] -= amount;

        if (principalBorrowed[msg.sender] > 0) {
            UserAccountData memory data = getUserAccountData(msg.sender);
            require(data.healthFactor >= 1e18, "Withdrawal drops Health Factor below 1.0");
        }

        require(collateralToken.transfer(msg.sender, amount), "Transfer failed");
        emit CollateralWithdrawn(msg.sender, amount);
    }

    function borrowETH(uint256 amount) external nonReentrant {
        require(amount <= address(this).balance, "Insufficient pool liquidity");

        if (principalBorrowed[msg.sender] > 0) {
            uint256 accrued = getAccruedInterest(msg.sender);
            principalBorrowed[msg.sender] += accrued;
            _distributeInterest(accrued);
        }
        lastBorrowerUpdateTimestamp[msg.sender] = block.timestamp;

        UserAccountData memory data = getUserAccountData(msg.sender);
        require(amount <= data.maxBorrowETH, "Exceeds max borrow power (LTV)");

        principalBorrowed[msg.sender] += amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");

        emit Borrow(msg.sender, amount);
    }

    function repayETH() external payable nonReentrant {
        uint256 accruedInterest = getAccruedInterest(msg.sender);
        uint256 totalDebt = principalBorrowed[msg.sender] + accruedInterest;

        require(totalDebt > 0, "No active debt");
        require(msg.value > 0, "Zero repayment amount");

        _distributeInterest(accruedInterest);

        uint256 payAmount = msg.value;

        // If payment covers debt (or within 0.0001 ETH of total debt), wipe debt completely
        if (payAmount >= totalDebt || (totalDebt - payAmount) < 100000000000000) {
            uint256 refundAmount = payAmount > totalDebt ? payAmount - totalDebt : 0;
            principalBorrowed[msg.sender] = 0;
            lastBorrowerUpdateTimestamp[msg.sender] = 0;

            if (refundAmount > 0) {
                (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
                require(success, "Refund failed");
            }
            emit Repay(msg.sender, totalDebt);
        } else {
            principalBorrowed[msg.sender] = totalDebt - payAmount;
            lastBorrowerUpdateTimestamp[msg.sender] = block.timestamp;
            emit Repay(msg.sender, payAmount);
        }
    }

    function _distributeInterest(uint256 interestAmount) internal {
        if (interestAmount == 0) return;

        uint256 reserveShare = (interestAmount * RESERVE_FACTOR) / 100;
        uint256 suppliersShare = interestAmount - reserveShare;

        reserveBalance += reserveShare;

        if (totalEthDeposited > 0) {
            liquidityIndex += (suppliersShare * 1e18) / totalEthDeposited;
        }
    }

    function liquidate(address borrower) external payable nonReentrant {
        UserAccountData memory data = getUserAccountData(borrower);
        require(data.healthFactor < 1e18, "Position is healthy");

        uint256 debtToCover = data.totalDebtETH;
        require(msg.value >= debtToCover, "Insufficient ETH to cover debt");

        uint256 collateralToSeizeInETH = (debtToCover * (100 + LIQUIDATION_BONUS)) / 100;
        uint256 collateralToSeizeUSDT = (collateralToSeizeInETH * 1e18) / usdtPriceInEth;

        if (collateralToSeizeUSDT > userCollateral[borrower]) {
            collateralToSeizeUSDT = userCollateral[borrower];
        }

        principalBorrowed[borrower] = 0;
        userCollateral[borrower] -= collateralToSeizeUSDT;

        require(collateralToken.transfer(msg.sender, collateralToSeizeUSDT), "Collateral transfer failed");

        emit Liquidated(borrower, msg.sender, debtToCover, collateralToSeizeUSDT);
    }
}