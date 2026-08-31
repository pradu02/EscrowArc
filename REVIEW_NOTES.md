# EscrowArc — Review Notes

## Overall

The uploaded `EscrowArc.sol` + React frontend were already solid: correct
reentrancy guard, correct access control on each state transition, and the
`ARC_TESTNET` chain config (chain ID `5042002` / `0x4CEF52`, RPC, explorer,
vUSDC address) all match Arc's real testnet values. Compiled cleanly with
solc `0.8.20` and no warnings.

## Bug found & fixed

**`refundEscrow` only worked in the `Funded` state (before the freelancer
accepted).** Once the freelancer called `acceptEscrow`, the client had no
way to get their vUSDC back — even if the freelancer went silent and never
delivered. That's exactly the "freelancer kaam start hi nahi karta" case
from the spec, so this was a real gap, not just an edge case.

**Fix:** `refundEscrow` now allows refund while the escrow is `Funded`
**or** `Accepted`. It still correctly blocks refund once `Released`, since
funds have already left the contract by then.

```solidity
require(
    escrow.status == Status.Funded || escrow.status == Status.Accepted,
    "Escrow cannot be refunded in its current state"
);
```

The frontend's refund button (`App.jsx`) was updated to match — it now
shows for the client in both `Funded` (1) and `Accepted` (2) states,
instead of only `Funded`.

## What was verified

Compiled with `solc` 0.8.20 and exercised on an in-memory EVM (`ganache`)
with a mock 6-decimal vUSDC token — 11/11 checks pass:

- Happy path: create → accept → release, freelancer receives funds
- Refund works before acceptance (unchanged behavior)
- **Refund works after acceptance but before release (the fix)**
- Refund correctly reverts once payment has been released
- Access control: only the invited freelancer can accept; only the client
  can release or refund; a stranger can't call any state-changing function
- Release correctly reverts if the job was never accepted

Also ran `npm run build` (Vite) to confirm the frontend still compiles
after the `App.jsx` change — no errors.

## How to compile & test the contract yourself

```bash
npm install
npm run test:contracts   # compiles contracts/*.sol with solc, then runs test/EscrowArc.test.cjs
```

This doesn't need Hardhat or a live RPC — it compiles with the `solc` npm
package and runs the checks against an in-process EVM (`ganache`), so it
works in sandboxed/offline environments too.

## How to deploy to Arc Testnet

1. Get testnet vUSDC from the Circle faucet: https://faucet.circle.com
2. Deploy `contracts/EscrowArc.sol` (constructor arg: the vUSDC address,
   already set to `0x3600000000000000000000000000000000000000` in
   `src/contractConfig.js`) via Remix, or a Foundry/Hardhat script pointed
   at `https://rpc.testnet.arc.network` (chain ID 5042002).
3. Paste the deployed `EscrowArc` address into
   `ESCROW_CONTRACT_ADDRESS` in `src/contractConfig.js`.
4. `npm run dev` to run the frontend locally.

## Suggestions for a later version (not done here — out of MVP scope)

- Optional deadline on `Accepted` state, after which the client can refund
  even without explicit action (currently they always *can* refund once
  accepted per the fix above, this would just make it automatic/timeout-based).
- Dispute/mediator role for cases where client and freelancer disagree.
- Multi-milestone support (array of amounts instead of one lump sum).
