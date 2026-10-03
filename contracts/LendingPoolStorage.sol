// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

abstract contract LendingPoolStorage is Ownable, ReentrancyGuard {
    IERC20 public immutable collateralToken;
    address public immutable priceOracle;

    uint256 public liquidityIndex = 1e18;
    uint256 public lastGlobalUpdateTimestamp;
    uint256 public totalEthDeposited;
    uint256 public totalDebt;
    uint256 public protocolFees;
    uint256 public reserveBuffer;

    mapping(address => uint256) public principalBorrowed;
    mapping(address => uint256) public userCollateral;
    mapping(address => uint256) public lastBorrowerUpdateTimestamp;

    mapping(address => uint256) public lenderDepositShares;
    mapping(address => uint256) public userLiquidityIndex;

    constructor(address _collateralToken, address _priceOracle) Ownable(msg.sender) {
        collateralToken = IERC20(_collateralToken);
        priceOracle = _priceOracle;
        lastGlobalUpdateTimestamp = block.timestamp;
    }
}
