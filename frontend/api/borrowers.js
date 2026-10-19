// api/borrowers.js - Chạy trên server Vercel, bảo mật key tuyệt đối
export default async function handler(req, res) {
  const apiKey = process.env.ETHERSCAN_API_KEY || "";
  const poolAddress = process.env.VITE_LENDING_POOL_ADDRESS;
  const startBlock = process.env.VITE_BOT_START_BLOCK || "11860788";
  const borrowTopic = "0xcbc04eca7e9da35cb1393a6135a199ca52e450d5e9251cbd99f7847d33a36750"; // Borrow(address,uint256)

  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("chainid", "11155111"); // Sepolia
  url.searchParams.set("module", "logs");
  url.searchParams.set("action", "getLogs");
  url.searchParams.set("address", poolAddress);
  url.searchParams.set("fromBlock", startBlock.toString());
  url.searchParams.set("toBlock", "latest");
  url.searchParams.set("topic0", borrowTopic);
  if (apiKey) url.searchParams.set("apikey", apiKey);

  try {
    const response = await fetch(url.toString());
    const data = await response.json();
    const logs = Array.isArray(data.result) ? data.result : [];
    
    // Lọc lấy danh sách địa chỉ ví duy nhất
    const borrowers = [];
    for (const log of logs) {
      if (log.topics && log.topics[1]) {
        borrowers.push("0x" + log.topics[1].slice(26));
      }
    }

    return res.status(200).json({ success: true, borrowers: [...new Set(borrowers)] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}