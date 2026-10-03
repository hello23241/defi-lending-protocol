// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "./InterestRateModel.sol";
import "./LendingPoolStorage.sol";
import "./interfaces/IChainlinkOracle.sol";
import "./libraries/DataTypes.sol";

contract LendingPool is LendingPoolStorage, InterestRateModel {
    // Protocol Constants
    uint256 public constant LTV = 70;                   // Max borrow power: 70%
    uint256 public constant LIQUIDATION_THRESHOLD = 80; // Liquidation triggers at 80% LTV
    uint256 public constant LIQUIDATION_BONUS = 5;      // Liquidator receives 5% bonus collateral
    uint256 public constant RESERVE_FACTOR = 20;
    uint256 public constant MIN_BUFFER = 10 ether;
    uint256 public constant BUFFER_TARGET_PERCENT = 20;
    uint256 public constant ORACLE_HEARTBEAT = 3600;

    event Deposit(address indexed lender, uint256 amount);
    event Withdraw(address indexed lender, uint256 amount);
    event CollateralDeposited(address indexed borrower, uint256 amount);
    event CollateralWithdrawn(address indexed borrower, uint256 amount);
    event Borrow(address indexed borrower, uint256 amount);
    event Repay(address indexed borrower, uint256 amount);
    event Liquidated(address indexed borrower, address indexed liquidator, uint256 debtRepaid, uint256 collateralSeized);
    event ProtocolFeesWithdrawn(address indexed owner, uint256 amount);

    constructor(address _collateralToken, address _priceOracle)
        LendingPoolStorage(_collateralToken, _priceOracle)
    {}

    // ------------------------------------------------------------------------
    // HELPERS
    // ------------------------------------------------------------------------

    function getAccruedInterest(address borrower) public view returns (uint256) {
        if (principalBorrowed[borrower] == 0) return 0;
        uint256 timeElapsed = block.timestamp - lastBorrowerUpdateTimestamp[borrower];
        return calculateAccruedInterest(
            principalBorrowed[borrower],
            calculateBorrowRatePerSec(totalDebt, totalEthDeposited),
            timeElapsed
        );
    }

    function getTotalDebt(address borrower) public view returns (uint256) {
        return principalBorrowed[borrower] + getAccruedInterest(borrower);
    }

    function getBorrowRatePerSec() public view returns (uint256) {
        return calculateBorrowRatePerSec(totalDebt, totalEthDeposited);
    }

    function getCollateralETHValue(uint256 usdtAmount) public view returns (uint256) {
        return (usdtAmount * 1e18) / _getEthPriceUsd();
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
        return (excessETH * _getEthPriceUsd()) / 1e18;
    }

    function getUserAccountData(
        address user
    ) public view returns (DataTypes.UserAccountData memory data) {
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
        _updateGlobalState();

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
        _updateGlobalState();

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
        _updateGlobalState();

        if (principalBorrowed[msg.sender] > 0) {
            uint256 accrued = getAccruedInterest(msg.sender);
            principalBorrowed[msg.sender] += accrued;
            totalDebt += accrued;
        }
        lastBorrowerUpdateTimestamp[msg.sender] = block.timestamp;

        userCollateral[msg.sender] -= amount;

        if (principalBorrowed[msg.sender] > 0) {
            DataTypes.UserAccountData memory data = getUserAccountData(msg.sender);
            require(data.healthFactor >= 1e18, "Withdrawal drops Health Factor below 1.0");
        }

        require(collateralToken.transfer(msg.sender, amount), "Transfer failed");
        emit CollateralWithdrawn(msg.sender, amount);
    }

    function borrowETH(uint256 amount) external nonReentrant {
        _updateGlobalState();
        require(amount <= address(this).balance, "Insufficient pool liquidity");

        if (principalBorrowed[msg.sender] > 0) {
            uint256 accrued = getAccruedInterest(msg.sender);
            principalBorrowed[msg.sender] += accrued;
            totalDebt += accrued;
        }
        lastBorrowerUpdateTimestamp[msg.sender] = block.timestamp;

        DataTypes.UserAccountData memory data = getUserAccountData(msg.sender);
        require(amount <= data.maxBorrowETH, "Exceeds max borrow power (LTV)");

        principalBorrowed[msg.sender] += amount;
        totalDebt += amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");

        emit Borrow(msg.sender, amount);
    }

    function repayETH() external payable nonReentrant {
        _updateGlobalState();
        uint256 accruedInterest = getAccruedInterest(msg.sender);
        uint256 debtAmount = principalBorrowed[msg.sender] + accruedInterest;

        require(debtAmount > 0, "No active debt");
        require(msg.value > 0, "Zero repayment amount");

        uint256 payAmount = msg.value;

        // If payment covers debt (or within 0.0001 ETH of total debt), wipe debt completely
        if (payAmount >= debtAmount || (debtAmount - payAmount) < 100000000000000) {
            uint256 refundAmount = payAmount > debtAmount ? payAmount - debtAmount : 0;
            uint256 principal = principalBorrowed[msg.sender];
            principalBorrowed[msg.sender] = 0;
            totalDebt -= principal;
            lastBorrowerUpdateTimestamp[msg.sender] = 0;

            if (refundAmount > 0) {
                (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
                require(success, "Refund failed");
            }
            emit Repay(msg.sender, debtAmount);
        } else {
            uint256 newPrincipal = debtAmount - payAmount;
            totalDebt = totalDebt - principalBorrowed[msg.sender] + newPrincipal;
            principalBorrowed[msg.sender] = newPrincipal;
            lastBorrowerUpdateTimestamp[msg.sender] = block.timestamp;
            emit Repay(msg.sender, payAmount);
        }
    }

    function _distributeInterest(uint256 interestAmount) internal {
        if (interestAmount == 0) return;

        uint256 suppliersShare = (interestAmount * (100 - RESERVE_FACTOR)) / 100;
        uint256 protocolShare = interestAmount - suppliersShare;
        uint256 targetBuffer = (totalEthDeposited * BUFFER_TARGET_PERCENT) / 100;
        if (targetBuffer < MIN_BUFFER) targetBuffer = MIN_BUFFER;

        if (reserveBuffer < targetBuffer) {
            uint256 bufferShare = protocolShare / 2;
            reserveBuffer += bufferShare;
            protocolFees += protocolShare - bufferShare;
        } else {
            protocolFees += protocolShare;
        }

        if (totalEthDeposited > 0) {
            liquidityIndex += (suppliersShare * 1e18) / totalEthDeposited;
        }
    }

    function liquidate(address borrower) external payable nonReentrant {
        _updateGlobalState();
        DataTypes.UserAccountData memory data = getUserAccountData(borrower);
        require(data.healthFactor < 1e18, "Position is healthy");

        uint256 debtToCover = data.totalDebtETH;
        require(msg.value >= debtToCover, "Insufficient ETH to cover debt");

        uint256 collateralToSeizeInETH = (debtToCover * (100 + LIQUIDATION_BONUS)) / 100;
        uint256 collateralToSeizeUSDT =
            (collateralToSeizeInETH * _getEthPriceUsd()) / 1e18;

        if (collateralToSeizeUSDT > userCollateral[borrower]) {
            collateralToSeizeUSDT = userCollateral[borrower];
        }

        totalDebt -= principalBorrowed[borrower];
        principalBorrowed[borrower] = 0;
        userCollateral[borrower] -= collateralToSeizeUSDT;

        require(collateralToken.transfer(msg.sender, collateralToSeizeUSDT), "Collateral transfer failed");

        emit Liquidated(borrower, msg.sender, debtToCover, collateralToSeizeUSDT);
    }

    function withdrawProtocolFees(uint256 amount) external onlyOwner {
        require(amount <= protocolFees, "Exceeds protocol fees");
        require(address(this).balance >= amount, "Insufficient pool liquidity");

        protocolFees -= amount;
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "ETH transfer failed");
        emit ProtocolFeesWithdrawn(owner(), amount);
    }

    function _updateGlobalState() internal {
        uint256 elapsed = block.timestamp - lastGlobalUpdateTimestamp;
        if (elapsed == 0) return;

        if (totalDebt > 0) {
            uint256 interest = calculateAccruedInterest(
                totalDebt,
                calculateBorrowRatePerSec(totalDebt, totalEthDeposited),
                elapsed
            );
            _distributeInterest(interest);
        }
        lastGlobalUpdateTimestamp = block.timestamp;
    }

    function _getEthPriceUsd() internal view returns (uint256) {
        (, int256 answer, , uint256 updatedAt, ) =
            AggregatorV3Interface(priceOracle).latestRoundData();
        require(answer > 0, "Invalid oracle answer");
        require(updatedAt > 0, "Oracle has no update");
        require(block.timestamp - updatedAt <= ORACLE_HEARTBEAT, "Stale oracle price");
        return uint256(answer) * 1e10;
    }
}