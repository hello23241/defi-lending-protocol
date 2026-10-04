import { network } from "hardhat";

async function main() {

  const { ethers } = await network.create();

  const [deployer] = await ethers.getSigners();
  const networkInfo = await ethers.provider.getNetwork();

  console.log("--------------------------------------------------");
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  console.log("--------------------------------------------------");

  let chainlinkFeed = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
  if (networkInfo.chainId === 31337n) {
    console.log("Deploying TestChainlinkFeed for the local simulated network...");
    const TestChainlinkFeed = await ethers.getContractFactory("TestChainlinkFeed");
    const testFeed = await TestChainlinkFeed.deploy(2655_00000000n);
    await testFeed.waitForDeployment();
    chainlinkFeed = await testFeed.getAddress();
  }

  // 1. Deploy the Chainlink feed wrapper
  console.log("Deploying ChainlinkOracle...");
  const ChainlinkOracle = await ethers.getContractFactory("ChainlinkOracle");
  const chainlinkOracle = await ChainlinkOracle.deploy(chainlinkFeed);
  await chainlinkOracle.waitForDeployment();
  const oracleAddress = await chainlinkOracle.getAddress();
  console.log(`ChainlinkOracle deployed to: ${oracleAddress}`);

  // 2. Deploy MockUSDT
  console.log("Deploying MockUSDT...");
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const mockUSDT = await MockUSDT.deploy(oracleAddress);
  await mockUSDT.waitForDeployment();
  const mockAddress = await mockUSDT.getAddress();
  console.log(`MockUSDT deployed to: ${mockAddress}`);

  // 3. Deploy LendingPool with MockUSDT address as collateral token
  console.log("Deploying LendingPool...");
  const LendingPool = await ethers.getContractFactory("LendingPool");
  const lendingPool = await LendingPool.deploy(mockAddress, oracleAddress);
  await lendingPool.waitForDeployment();
  const poolAddress = await lendingPool.getAddress();
  console.log(`LendingPool deployed to: ${poolAddress}`);
  await (await mockUSDT.setLendingPool(poolAddress)).wait();

  console.log("--------------------------------------------------");
  console.log("Deployment Complete!");
  console.log("Save these deployed addresses for your Frontend configuration:");
  console.log(`VITE_MOCK_USDT_ADDRESS="${mockAddress}"`);
  console.log(`VITE_ORACLE_ADDRESS="${oracleAddress}"`);
  console.log(`VITE_LENDING_POOL_ADDRESS="${poolAddress}"`);
  console.log("--------------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});