// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

abstract contract InterestRateModel {
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant OPTIMAL_UTILIZATION = 80e16;
    uint256 public constant BASE_RATE_APY = 2e16;
    uint256 public constant SLOPE_1_APY = 4e16;
    uint256 public constant SLOPE_2_APY = 60e16;

    function calculateBorrowRatePerSec(
        uint256 debt,
        uint256 deposits
    ) internal pure returns (uint256) {
        if (deposits == 0) return BASE_RATE_APY / SECONDS_PER_YEAR;

        uint256 utilization = (debt * 1e18) / deposits;
        uint256 annualRate;
        if (utilization <= OPTIMAL_UTILIZATION) {
            annualRate =
                BASE_RATE_APY +
                (SLOPE_1_APY * utilization) /
                OPTIMAL_UTILIZATION;
        } else {
            uint256 excessUtilization = utilization - OPTIMAL_UTILIZATION;
            annualRate =
                BASE_RATE_APY +
                SLOPE_1_APY +
                (SLOPE_2_APY * excessUtilization) /
                (1e18 - OPTIMAL_UTILIZATION);
        }

        return annualRate / SECONDS_PER_YEAR;
    }

    function calculateAccruedInterest(
        uint256 principal,
        uint256 ratePerSecond,
        uint256 elapsed
    ) internal pure returns (uint256) {
        return (principal * ratePerSecond * elapsed) / 1e18;
    }
}
