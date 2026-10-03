// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

library DataTypes {
    struct UserAccountData {
        uint256 totalCollateralETH;
        uint256 totalDebtETH;
        uint256 maxBorrowETH;
        uint256 healthFactor;
        uint256 lastUpdateTimestamp;
    }
}
