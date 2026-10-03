Implement 3-Card Protocol Summary Banner.

Replace the current top protocol overview section in App.jsx with a sleek 3-card horizontal grid:

1. Card 1 - "ASSET":
   - Header: "ASSET" (small uppercase tracking-wider muted text).
   - Content: Flex container with an ETH token icon (SVG or SVG image) and large "ETH / Ethereum" text.

2. Card 2 - "DYNAMIC RATES":
   - Header: "RATES (SUPPLY / BORROW)"
   - Content: Two large side-by-side formatted numbers:
     * Supply APY: e.g., "1.80%" (Styled green)
     * Slash separator "/"
     * Borrow APY: e.g., "3.25%" (Styled blue/white)
   - Subtext: Small muted labels below indicating "Supply APY" vs "Borrow APY".

3. Card 3 - "UTILIZATION RATE":
   - Header: "POOL UTILIZATION"
   - Content: Single large percentage value: `((totalDebtEth / totalPoolEth) * 100).toFixed(2) + "%"`.
   - Add a subtle background progress bar below the number reflecting the percentage fill level (green under 80%, yellow/red above 80%).