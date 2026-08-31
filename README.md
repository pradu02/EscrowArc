# EscrowArc

**Lock payment. Release on delivery.** — a single-milestone vUSDC escrow prototype for Arc Testnet.

> ⚠️ Testnet prototype only. Use test vUSDC only; do not send real funds.

## What it demonstrates

1. A client approves and locks vUSDC in the `EscrowArc` smart contract.
2. The nominated freelancer accepts the milestone.
3. The client releases payment after delivery.
4. Before acceptance, the client can refund the escrow to their own wallet.

The first version deliberately has no dispute-resolution or timeout system. A production implementation needs an audited dispute, governance, and reserve design.

## Deploy to Arc Testnet

1. Open `contracts/EscrowArc.sol` in Remix and compile with Solidity `0.8.20`.
2. Deploy with the Arc Testnet vUSDC ERC-20 address:

   ```
   0x3600000000000000000000000000000000000000
   ```

3. Paste the deployed address into `ESCROW_CONTRACT_ADDRESS` in `src/contractConfig.js`.
4. Install dependencies and run the frontend:

   ```bash
   npm install
   npm run dev
   ```

## Demo flow

Use two wallets. The client wallet creates and funds an escrow. Connect the freelancer wallet to accept it. Reconnect the client wallet to release the payment. Every action is visible in the Arc Testnet explorer.
