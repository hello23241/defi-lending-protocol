// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract MockChainlinkOracle {
    int256 private price;
    uint256 private updatedAt;

    constructor(int256 initialPrice) {
        price = initialPrice;
        updatedAt = block.timestamp;
    }

    function setPrice(int256 newPrice) external {
        price = newPrice;
        updatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, price, 0, updatedAt, 1);
    }
}
