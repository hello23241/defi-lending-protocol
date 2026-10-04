// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IChainlinkOracle.sol";

contract MockUSDT is ERC20, Ownable {
    uint256 public constant ORACLE_HEARTBEAT = 3600;
    IChainlinkOracle public immutable priceOracle;
    address public lendingPool;

    event PublicMint(address indexed account, uint256 ethPaid, uint256 amount);
    event LiquidationBurn(uint256 amount, uint256 poolShare, uint256 treasuryShare);

    constructor(address oracle) ERC20("Mock Tether", "mUSDT") Ownable(msg.sender) {
        require(oracle != address(0), "Invalid oracle");
        priceOracle = IChainlinkOracle(oracle);
    }

    function setLendingPool(address pool) external onlyOwner {
        require(pool != address(0), "Invalid pool");
        require(lendingPool == address(0), "Pool already set");
        lendingPool = pool;
    }

    function mint(uint256 amount) external payable {
        uint256 requiredEth = quoteMint(amount);
        require(msg.value >= requiredEth, "Insufficient ETH payment");
        _mint(msg.sender, amount);
        if (msg.value > requiredEth) {
            (bool refunded, ) = payable(msg.sender).call{value: msg.value - requiredEth}("");
            require(refunded, "Refund failed");
        }
        emit PublicMint(msg.sender, requiredEth, amount);
    }

    function mintFree(address recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        _mint(recipient, amount);
    }

    function quoteMint(uint256 amount) public view returns (uint256) {
        (, int256 answer, , uint256 updatedAt, ) = priceOracle.latestRoundData();
        require(answer > 0, "Invalid oracle answer");
        require(updatedAt > 0 && updatedAt <= block.timestamp, "Invalid oracle timestamp");
        require(block.timestamp - updatedAt <= ORACLE_HEARTBEAT, "Stale oracle price");
        uint256 price18 = (uint256(answer) * 1e18) / (10 ** priceOracle.decimals());
        return (amount * 1e18) / price18;
    }

    function burnForLiquidation(uint256 amount) external {
        require(msg.sender == lendingPool, "Only lending pool");
        uint256 supplyBeforeBurn = totalSupply();
        uint256 backingEth = (address(this).balance * amount) / supplyBeforeBurn;
        _burn(msg.sender, amount);

        uint256 poolShare = backingEth / 2;
        uint256 treasuryShare = backingEth - poolShare;
        (bool poolPaid, ) = payable(lendingPool).call{value: poolShare}("");
        require(poolPaid, "Pool payment failed");
        (bool treasuryPaid, ) = payable(owner()).call{value: treasuryShare}("");
        require(treasuryPaid, "Treasury payment failed");
        emit LiquidationBurn(amount, poolShare, treasuryShare);
    }
}