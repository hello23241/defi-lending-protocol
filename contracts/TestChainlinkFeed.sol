// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract TestChainlinkFeed {
    int256 public answer;
    uint256 public updatedAt;

    constructor(int256 initialAnswer) {
        answer = initialAnswer;
        updatedAt = block.timestamp;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "Test ETH / USD";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function setAnswer(int256 newAnswer) external {
        answer = newAnswer;
        updatedAt = block.timestamp;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, 0, updatedAt, 1);
    }

    function getRoundData(uint80) external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, 0, updatedAt, 1);
    }
}
