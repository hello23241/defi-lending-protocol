// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IChainlinkOracle.sol";

contract ChainlinkOracle is Ownable, IChainlinkOracle {
    uint256 public constant TEMPORARY_OVERRIDE_DURATION = 2 minutes;

    IChainlinkOracle public immutable feed;
    int256 public temporaryPrice;
    uint256 public temporaryPriceUntil;

    constructor(address feedAddress) Ownable(msg.sender) {
        require(feedAddress != address(0), "Invalid feed");
        feed = IChainlinkOracle(feedAddress);
        require(feed.decimals() <= 18, "Unsupported feed decimals");
    }

    function decimals() external view override returns (uint8) {
        return feed.decimals();
    }

    function description() external view override returns (string memory) {
        return feed.description();
    }

    function version() external view override returns (uint256) {
        return feed.version();
    }

    function getRoundData(uint80 roundId)
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return feed.getRoundData(roundId);
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        if (block.timestamp < temporaryPriceUntil) {
            return (type(uint80).max, temporaryPrice, 0, block.timestamp, type(uint80).max);
        }
        return feed.latestRoundData();
    }

    function setTemporaryPrice(int256 newPrice) external onlyOwner {
        require(newPrice > 0, "Invalid price");
        temporaryPrice = newPrice;
        temporaryPriceUntil = block.timestamp + TEMPORARY_OVERRIDE_DURATION;
    }
}
