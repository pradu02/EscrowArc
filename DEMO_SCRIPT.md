# EscrowArc — Demo Script

## Before the demo (do this the night before / 30 min prior)

- [ ] Two MetaMask accounts ready, both switched to **Arc Testnet** (chain ID 5042002)
  - **Account A = Client** — needs test vUSDC (get from https://faucet.circle.com if low)
  - **Account B = Freelancer** — just needs a tiny bit of native USDC for gas
- [ ] `npm run dev` running, `localhost:5173` open in browser, hard-refreshed once to confirm no console errors
- [ ] `contracts/EscrowArc.sol` already deployed, address correctly pasted in `src/contractConfig.js`
- [ ] Do one throwaway test run end-to-end (create → accept → release) *before* the real demo, so the first real transaction isn't your first time seeing it work
- [ ] Zoom in browser to ~110-125% so text is readable on a shared screen
- [ ] Have the Arcscan explorer tab pre-opened: `https://testnet.arcscan.app`

## The pitch line (say this first)

> "ArcEscrow is a testnet milestone-payment prototype. It locks vUSDC in a smart contract until the client releases payment, making the transaction transparent and reducing counterparty risk."

## Live demo flow (~4-5 minutes)

**1. Show the landing page (30 sec)**
- Point at the Client → Vault → Freelancer diagram: "Neither side has to trust the other first — the money sits in the middle."
- Scroll to "How the vault works" — the 3 numbered steps.

**2. Connect Account A / Client (30 sec)**
- Click "Connect wallet," approve in MetaMask.
- Point out the wallet chip top-right: address, copy button, Arcscan link.

**3. Create an escrow (60-90 sec)**
- Paste Account B's address as freelancer, amount (e.g. `5`), description ("Logo design — v1").
- Click "Approve & fund escrow" — narrate the two MetaMask popups: *"First transaction approves the contract to pull my vUSDC, second one actually locks it."*
- Once confirmed, point at the loaded escrow card: status = **Funded**, tracker shows step 1 lit up.
- Optional: click "View on Arcscan" to show the on-chain transaction — good transparency beat.

**4. Switch to Account B / Freelancer (45 sec)**
- Switch account in MetaMask (or disconnect + reconnect as B).
- Load the same escrow ID (or click it from the "As Freelancer" dashboard list).
- Click "Accept milestone." Status flips to **Accepted**, tracker moves.

**5. Switch back to Account A / Client, release payment (45 sec)**
- Load the escrow again, click "Release payment."
- Point at the freelancer's balance changing / the status flipping to **Released** (green).
- *"The contract can't judge whether the logo is actually good — that decision stays with the client in this MVP. Dispute resolution is future scope."*

**6. Show the refund path quickly (optional, 30 sec)**
- Create a second small escrow, then immediately hit "Refund" as client — show funds return instantly.
- *"If a freelancer goes silent, the client isn't stuck — refund works any time before release."*

**7. Close on the dashboard (30 sec)**
- Scroll to "All escrows in this vault" — *"Every escrow ever created is visible here, plus a personal view split by client / freelancer role — no backend database, this is all read straight from the chain."*

## If something breaks live

- **Transaction stuck / wrong network**: check MetaMask is on Arc Testnet (chain ID 5042002); the app should auto-prompt to switch.
- **"Insufficient funds" on approve**: Account A is low on test vUSDC — top up from https://faucet.circle.com before the demo, not during.
- **Blank/black page**: hard refresh (Ctrl+Shift+R). If it persists, check the browser console — almost always a stale cache issue, not a code bug at this point.
- **Have a backup**: a short screen recording of one full successful run, in case live testnet RPC hiccups during the actual presentation.

## One-liners for Q&A

- *"Why not let the contract judge quality?"* — Code can't evaluate subjective work like design or writing; that's why release authority stays with the client in v1, with dispute/mediator roles planned for v2.
- *"What stops the client from just never releasing?"* — Refund protects the client, but you're right that an unresponsive client is a real gap — that's exactly what a deadline/auto-refund and a mediator role would solve in the next version.
- *"Is this real money?"* — No, testnet vUSDC only, zero real value, purely for demonstrating the mechanism.
