import { network } from "hardhat";

const { ethers } = await network.create();

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with account: ${deployer.address}`);

  const usdt = await ethers.deployContract("MockERC20", ["Mock USDT", "USDT"]);
  await usdt.waitForDeployment();

  const wbtc = await ethers.deployContract("MockERC20", ["Mock WBTC", "WBTC"]);
  await wbtc.waitForDeployment();

  const lending = await ethers.deployContract("PeerToPeerLending");
  await lending.waitForDeployment();

  console.log(`Mock USDT deployed to: ${await usdt.getAddress()}`);
  console.log(`Mock WBTC deployed to: ${await wbtc.getAddress()}`);
  console.log(`PeerToPeerLending deployed to: ${await lending.getAddress()}`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
