## Plan: Sepolia Deployment Readiness

TL;DR: The contracts can be deployed with the existing `scripts/deploy.ts`, but the project needs credential rotation, corrected Hardhat configuration-variable naming, a funded Sepolia deployer, a compile/test/typecheck pass, deployment, contract verification, and frontend environment/network validation.

**Steps**
1. Rotate the exposed Sepolia deployer private key and Etherscan/Alchemy credentials from the pasted `.env`; never reuse the exposed private key. Keep the replacement secrets outside source control.
2. Make the runtime configuration consistent: `hardhat.config.ts` expects `SEPOLIA_PRIVATE_KEY`, while the current `.env` uses `PRIVATE_KEY`. Use the exact expected variable name or configure the Hardhat keystore. Confirm the RPC URL resolves to Sepolia and the selected account is the intended deployer.
3. Obtain Sepolia ETH for the deployer account and confirm its balance through the configured RPC before deployment.
4. Build and test the contracts, then typecheck the Hardhat scripts. The relevant sequence is `npx hardhat build`, `npx hardhat test mocha`, and `npx tsc --noEmit`.
5. Deploy the actual contracts with `npx hardhat run scripts/deploy.ts --network sepolia`. Record both transaction hashes and the resulting `MockUSDT` and `LendingPool` addresses. The script correctly deploys `MockUSDT` first and passes its address to `LendingPool`.
6. Verify both deployed contracts on Sepolia Etherscan using the matching compiler version `0.8.34`, optimizer profile if used, and the exact constructor argument for `LendingPool` (the deployed MockUSDT address). Add an explicit verification command/script if repeatability is desired.
7. Configure `frontend/.env` with the two deployed addresses and a Sepolia chain identifier/provider strategy. Rebuild the frontend with `npm run build`; deploy the resulting `frontend/dist` to the chosen host.
8. Manually smoke-test with MetaMask switched to Sepolia: connect, mint mUSDT, approve/deposit collateral, fund the pool with ETH, borrow, repay, withdraw collateral, and withdraw supplied ETH. Check transactions and balances on Etherscan.
9. Before treating the app as anything beyond a demo, review the protocol assumptions: `MockUSDT.mint` is unrestricted, the LendingPool uses a hard-coded ETH/USDT price instead of an oracle, and there is no production access control or pause mechanism.

**Relevant files**
- `c:/Files and stuff/Projects/defi-lending-protocol/hardhat.config.ts` — Sepolia RPC and config-variable names; currently expects `SEPOLIA_PRIVATE_KEY`.
- `c:/Files and stuff/Projects/defi-lending-protocol/scripts/deploy.ts` — actual two-contract deployment flow and address output.
- `c:/Files and stuff/Projects/defi-lending-protocol/contracts/MockUSDT.sol` — test token with unrestricted public minting.
- `c:/Files and stuff/Projects/defi-lending-protocol/contracts/LendingPool.sol` — constructor dependency and hard-coded price/risk parameters.
- `c:/Files and stuff/Projects/defi-lending-protocol/frontend/src/App.jsx` — reads `VITE_MOCK_USDT_ADDRESS` and `VITE_LENDING_POOL_ADDRESS`; currently does not enforce Sepolia network selection.
- `c:/Files and stuff/Projects/defi-lending-protocol/frontend/package.json` — frontend build command is `npm run build`.
- `c:/Files and stuff/Projects/defi-lending-protocol/.gitignore` — already ignores root and frontend `.env` files.

**Verification**
1. Confirm the replacement deployer address and Sepolia chain ID (11155111) through the RPC, and confirm the deployer has test ETH.
2. Run `npx hardhat build`, `npx hardhat test mocha`, and `npx tsc --noEmit` before deployment.
3. After deployment, read `LendingPool.collateralToken()` and confirm it equals the deployed MockUSDT address; confirm both addresses have bytecode.
4. Verify both contracts on Sepolia Etherscan and confirm constructor arguments.
5. Run `npm run build` from `frontend` with the deployment address variables present.
6. Perform the end-to-end wallet smoke test on Sepolia and inspect all write transactions.

**Decisions**
- Treat the current contracts as a Sepolia demonstration deployment, not a production lending protocol.
- Deploy the included `MockUSDT` rather than integrating a real stablecoin, because the current pool and frontend are built around its unrestricted mint function.
- Use the direct deployment script as the canonical path; the existing `ignition/modules/Counter.ts` is only a sample Counter module and does not deploy this application.

**Further Considerations**
1. If the goal is a public demo, add a frontend chain check and a clear wrong-network error before deployment; otherwise users can connect to another chain and get misleading RPC/address failures.
2. If the goal is production-like behavior, replace the mock token and fixed price with controlled token permissions and a tested oracle design before publishing the deployment.