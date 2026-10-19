# PeerPool: Decentralized Lending & Borrowing Protocol (EVM / Sepolia)

PeerPool là giao thức cho vay phi tập trung (DeFi Lending Protocol) hoạt động trên mạng thử nghiệm Ethereum Sepolia. Giao thức cho phép người dùng cung cấp thanh khoản ETH để kiếm lãi suất (Lend / Supply), thế chấp tài sản token mUSDT để vay ETH (Borrow), đi kèm hệ thống Bot thanh lý tự động (Liquidator Bot) bảo vệ an toàn thanh khoản cho hồ vay.

---

## 🏛️ Kiến trúc hệ thống (System Architecture)

Dự án bao gồm 3 phân hệ chính hoạt động đồng bộ:

1. **Smart Contracts (Solidity v0.8.20):**
   - `LendingPool.sol`: Quản lý nạp/rút ETH, nạp/rút thế chấp mUSDT, giải ngân khoản vay, tính lãi suất theo thời gian thực (per-second compounding) và thực thi thanh lý tài sản.
   - `MockUSDT.sol`: Token ERC-20 chuẩn dùng làm tài sản thế chấp (Collateral), tích hợp cơ chế Faucet (mint tự do hoặc trade với ETH).
   - `PriceOracle.sol`: Oracle cung cấp tỷ giá định giá tài sản theo USD, hỗ trợ cập nhật giá giả lập để kiểm thử kịch bản thanh lý nợ xấu.

2. **Liquidator Bot & Sync Engine (TypeScript / Ethers.js v6):**
   - Quét log lịch sử sự kiện `Borrow` thông qua RPC kết hợp Etherscan API V2 Fallback chống nghẽn / rate-limit.
   - Lưu trữ danh sách người vay vào cơ sở dữ liệu **SQLite** ở chế độ **WAL Mode** (Write-Ahead Logging) tự phục hồi checkpoint sau sự cố.
   - Kiểm tra sức khỏe danh sách ví hàng loạt (Mass Health Checking) qua **Multicall3** chỉ với 1 RPC call duy nhất mỗi 10 giây.
   - Tự động điều chỉnh Dynamic Priority Gas Fee khi phát hiện vị thế nguy cấp ($HF < 0.95$) và tự động định tuyến lợi nhuận thu được về ví Developer.

3. **Decentralized Application Frontend (React / Vite):**
   - Giao diện trực quan phân định 2 chế độ: Cung cấp thanh khoản (Lend) và Vay thế chấp (Borrow).
   - Thanh trượt mô phỏng Chỉ số An toàn (Health Factor Preview) theo thời gian thực trước khi người dùng xác nhận giao dịch.
   - Bảng điều khiển quản trị (Admin Dashboard) hiển thị 10 thẻ trạng thái tài chính của hồ và bảng giám sát người vay theo thời gian thực.
   - Hỗ trợ song ngữ: Tiếng Việt / English.

---

## 📊 Tham số tài chính của giao thức (Protocol Parameters)

| Tham số | Giá trị | Giải thích |
| :--- | :--- | :--- |
| **Loan-to-Value (LTV)** | `65%` | Hạn mức vay tối đa tính trên tổng giá trị tài sản thế chấp |
| **Liquidation Threshold** | `80%` | Ngưỡng rủi ro kích hoạt thanh lý vị thế nợ |
| **Liquidation Bonus** | `5%` | Phần thưởng dành cho bot thanh lý khi xử lý nợ xấu |
| **Base Borrow Rate** | `2.00%` | Lãi suất sàn cơ bản hàng năm |
| **Health Factor Safe** | `≥ 1.45` | Ngưỡng an toàn bảo vệ vị thế người vay |

$$\text{Health Factor (HF)} = \frac{\text{Collateral Value in ETH} \times \text{Liquidation Threshold}}{\text{Total Debt in ETH}}$$

* **$HF > 1.00$:** Vị thế an toàn.
* **$HF < 1.00$:** Vị thế rơi vào trạng thái nợ xấu (Undercollateralized), bất kỳ ai hoặc Bot đều có quyền thanh lý để thu hồi vốn.

---

## 🚀 Hướng dẫn cài đặt và chạy thử nghiệm (Setup & Installation)

### 1. Yêu cầu môi trường
- [Node.js](https://nodejs.org/) (Phiên bản `v18.x` hoặc `v20.x`)
- [Git](https://git-scm.com/)
- Trình duyệt tích hợp ví [MetaMask](https://metamask.io/) đã cấu hình mạng **Sepolia Testnet**.

### 2. Cài đặt thư viện dependencies
Clone repository và cài đặt các gói cần thiết:

```bash
git clone [https://github.com/](https://github.com/)<your-username>/defi-lending-protocol.git
cd defi-lending-protocol
npm install