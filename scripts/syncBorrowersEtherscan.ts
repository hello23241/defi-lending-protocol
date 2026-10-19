import { ethers } from "ethers";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const poolAddress = process.env.VITE_LENDING_POOL_ADDRESS;
const apiKey = process.env.ETHERSCAN_API_KEY || "";
const configuredStartBlock = process.env.BOT_START_BLOCK ? Number(process.env.BOT_START_BLOCK) : 11860788;
const SEPOLIA_CHAIN_ID = "11155111"; // Chain ID Sepolia cho Etherscan V2

if (!poolAddress || !ethers.isAddress(poolAddress)) {
  throw new Error("Địa chỉ VITE_LENDING_POOL_ADDRESS không hợp lệ trong .env");
}

// 1. KHỞI TẠO HOẶC MỞ KẾT NỐI BOT_STATE.DB
const db = new Database("bot_state.db");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS checkpoints (
    key TEXT PRIMARY KEY,
    block_number INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS borrowers (
    address TEXT PRIMARY KEY,
    updated_at INTEGER NOT NULL
  );
`);

// 2. TÍNH TOÁN TOPIC0 CỦA EVENT Borrow(address,uint256)
const BORROW_TOPIC = ethers.id("Borrow(address,uint256)");

async function fetchLatestBlock(): Promise<number> {
  const url = `https://api.etherscan.io/v2/api?chainid=${SEPOLIA_CHAIN_ID}&module=proxy&action=eth_blockNumber&apikey=${apiKey}`;
  const res = await fetch(url);
  const data = (await res.json()) as { result?: string };
  if (data?.result && typeof data.result === "string" && data.result.startsWith("0x")) {
    return parseInt(data.result, 16);
  }
  return configuredStartBlock;
}

async function syncBorrowers() {
  console.log(`[ETHERSCAN SYNC] Bắt đầu đồng bộ cho contract: ${poolAddress}`);
  console.log(`[ETHERSCAN SYNC] Start block: ${configuredStartBlock} | Topic: ${BORROW_TOPIC}`);

  const latestBlock = await fetchLatestBlock();
  console.log(`[ETHERSCAN SYNC] Latest Sepolia Block: ${latestBlock}`);

  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("chainid", SEPOLIA_CHAIN_ID);
  url.searchParams.set("module", "logs");
  url.searchParams.set("action", "getLogs");
  url.searchParams.set("address", poolAddress!);
  url.searchParams.set("fromBlock", configuredStartBlock.toString());
  url.searchParams.set("toBlock", "latest");
  url.searchParams.set("topic0", BORROW_TOPIC);
  if (apiKey) url.searchParams.set("apikey", apiKey);

  const response = await fetch(url.toString());
  const json = (await response.json()) as {
    status?: string;
    message?: string;
    result?: any;
  };

  if (json.status === "0" && json.message !== "No records found") {
    throw new Error(`Etherscan API Error: ${json.result || json.message}`);
  }

  const logs: any[] = Array.isArray(json.result) ? json.result : [];
  console.log(`[ETHERSCAN SYNC] Tìm thấy ${logs.length} Borrow event(s).`);

  const uniqueBorrowers = new Set<string>();

  for (const log of logs) {
    if (log.topics && log.topics[1]) {
      try {
        const borrowerAddress = ethers.getAddress("0x" + log.topics[1].slice(26));
        uniqueBorrowers.add(borrowerAddress);
      } catch (err) {
        console.warn(`[WARN] Không thể parse địa chỉ từ topic: ${log.topics[1]}`);
      }
    }
  }

  // 3. LƯU ATOMIC VÀO SQLITE
  const insertBorrower = db.prepare("INSERT OR IGNORE INTO borrowers (address, updated_at) VALUES (?, ?)");
  const updateCheckpoint = db.prepare("INSERT OR REPLACE INTO checkpoints (key, block_number) VALUES ('last_scanned_block', ?)");

  const syncTx = db.transaction(() => {
    const now = Date.now();
    for (const borrower of uniqueBorrowers) {
      insertBorrower.run(borrower, now);
    }
    updateCheckpoint.run(latestBlock);
  });

  syncTx();

  const totalInDb = (db.prepare("SELECT COUNT(*) as count FROM borrowers").get() as { count: number }).count;
  console.log(`\n======================================================`);
  console.log(`[HOÀN TẤT] Đã lưu ${uniqueBorrowers.size} borrower mới vào bot_state.db.`);
  console.log(`[HOÀN TẤT] Tổng số ví borrower hiện có trong DB: ${totalInDb}`);
  console.log(`[HOÀN TẤT] Checkpoint 'last_scanned_block' cập nhật lên: ${latestBlock}`);
  console.log(`======================================================`);
}

syncBorrowers()
  .catch((err) => {
    console.error("[FATAL ERROR]", err);
  })
  .finally(() => {
    db.close();
  });