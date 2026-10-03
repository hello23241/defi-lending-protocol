Revamp React Frontend UI, Number Formatting, and Layout.

Refactor the React/Vite dashboard UI to adopt a clean, modern DeFi aesthetic (dark/light neutral theme with clear card hierarchy) and update the number formatting and live debt toggle logic according to the following specifications:

1. DYNAMIC NUMBER FORMATTING HELPER:
   - Create a helper function `formatAmount(value, decimals = 4)`:
     - If value == 0 or null/undefined, return "0.00".
     - Otherwise, format the number showing up to 4 significant decimal places (e.g., 0.01654321 -> "0.0165", 12.34567 -> "12.35").
     - Use this helper for all displayed values (Wallet Balances, Pool Liquidity, Collateral, Health Factor).

2. LIVE DEBT DISPLAY TOGGLE:
   - Add a React state toggle: `const [showDebtInWei, setShowDebtInWei] = useState(false)`.
   - Next to "Your Live Debt", render a toggle button (e.g., `[View in Wei]` / `[View in ETH]`).
   - If `showDebtInWei` is false:
     - Render debt formatted in ETH using `formatAmount(debtInEth)` with label "ETH".
   - If `showDebtInWei` is true:
     - Render exact debt converted to Wei string (ethers.formatUnits(debt, 0)) with label "Wei".

3. UI & LAYOUT REVAMP (MODERN DEFI STYLE):
   - Header Bar:
     - Align project logo/title "PeerPool Lending" to the left.
     - Position wallet address badge / "Connect Wallet" button on the top right.
   - Top Stat Cards Grid (4 Key Metric Summary Cards):
     - Card 1: Wallet Balances (ETH & mUSDT) + "Faucet (1000 mUSDT)" button.
     - Card 2: Pool Liquidity & Utilization (Total Liquidity vs Your Supplied Share).
     - Card 3: Borrow Capacity (Max Borrow Power vs Live Debt).
     - Card 4: Health Factor Badge with Dynamic Color Status:
       * Green (#22c55e) if Health Factor >= 1.5 or ∞
       * Yellow (#eab308) if 1.0 <= Health Factor < 1.5
       * Red (#ef4444) if Health Factor < 1.0 (Liquidation Alert!)
   - Action Tabs / 2-Column Action Grid:
     - Column 1 (Lender Actions):
       * Supply ETH (Input + Deposit Button)
       * Withdraw ETH (Input + Max Button + Withdraw Button)
     - Column 2 (Borrower & Collateral Actions):
       * Manage Collateral (Deposit & Withdraw mUSDT)
       * Borrow ETH & Repay Debt (Input + Max Button + Repay/Borrow Actions)
   - Input Fields & Buttons:
     - Add inline "MAX" buttons inside input boxes for quick action filling.
     - Style buttons with rounded corners, clear primary hover states, and disabled states during pending wallet transactions.