// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./interfaces/IChainlinkOracle.sol";

abstract contract LendingPoolStorage is Ownable, ReentrancyGuard {
    IERC20Metadata public immutable collateralToken;
    address public immutable priceOracle;
    uint8 public immutable collateralTokenDecimals;
    uint8 public immutable oracleDecimals;

    uint256 public liquidityIndex = 1e18;
    uint256 public lastGlobalUpdateTimestamp;
    uint256 public totalEthDeposited;
    uint256 public totalDebt;
    uint256 public protocolFees;
    uint256 public reserveBuffer;
    uint256 public reserveFactor;
    uint256 public totalBadDebt;
    uint256 public borrowIndex = 1e18;
    uint256 public constant MAX_RESERVE_FACTOR = 3500;

    event ReserveFactorUpdated(uint256 newFactor);

    mapping(address => uint256) public principalBorrowed;
    mapping(address => uint256) public userCollateral;
    mapping(address => uint256) public lastBorrowerUpdateTimestamp;
    mapping(address => uint256) public userBorrowIndex;

    mapping(address => uint256) public lenderDepositShares;
    mapping(address => uint256) public userLiquidityIndex;

    constructor(address _collateralToken, address _priceOracle) Ownable(msg.sender) {
        collateralToken = IERC20Metadata(_collateralToken);
        priceOracle = _priceOracle;
        collateralTokenDecimals = IERC20Metadata(_collateralToken).decimals();
        oracleDecimals = IChainlinkOracle(_priceOracle).decimals();
        require(collateralTokenDecimals <= 18, "Unsupported token decimals");
        require(oracleDecimals <= 18, "Unsupported oracle decimals");
        lastGlobalUpdateTimestamp = block.timestamp;
    }
}
