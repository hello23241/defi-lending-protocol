import { network } from "hardhat";

async function main() {

  const { ethers } = await network.create();

  const [deployer] = await ethers.getSigners();

  console.log("--------------------------------------------------");
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  console.log("--------------------------------------------------");

  // 1. Deploy MockUSDT
  console.log("Deploying MockUSDT...");
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const mockUSDT = await MockUSDT.deploy();
  await mockUSDT.waitForDeployment();
  const mockAddress = await mockUSDT.getAddress();
  console.log(`MockUSDT deployed to: ${mockAddress}`);

  const oracleAddress = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

  // 2. Deploy LendingPool with MockUSDT address as collateral token
  console.log("Deploying LendingPool...");
  const LendingPool = await ethers.getContractFactory("LendingPool");
  const lendingPool = await LendingPool.deploy(mockAddress, oracleAddress);
  await lendingPool.waitForDeployment();
  const poolAddress = await lendingPool.getAddress();
  console.log(`LendingPool deployed to: ${poolAddress}`);

  console.log("--------------------------------------------------");
  console.log("Deployment Complete!");
  console.log("Save these deployed addresses for your Frontend configuration:");
  console.log(`VITE_MOCK_USDT_ADDRESS="${mockAddress}"`);
  console.log(`VITE_LENDING_POOL_ADDRESS="${poolAddress}"`);
  console.log("--------------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});