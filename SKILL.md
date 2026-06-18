---
name: pay-per-call-settlement
description: x402-style pay-per-call settlement for on-chain agents on Pharos. Use this skill whenever one agent must pay another per API call, per tool invocation, or per inference — metered micropayments, prepaid usage, or agent-to-agent billing — settled on-chain WITHOUT a transaction per call. Trigger on "pay per call", "x402", "agent payments", "pay an agent", "metered billing", "micropayments", "prepaid API credits", "usage-based payment", "payment channel", or any agent-to-agent service payment.
---

# Pay-Per-Call Settlement (Pharos)

x402-style payment channels for agent-to-agent metered payments. A payer escrows
PHRS for a provider once, then signs a cheap **off-chain voucher per call**. The
provider serves each call instantly (funds are locked) and redeems the **latest**
voucher on-chain whenever it wants — so N calls settle in **one** transaction, not
N. The payer reclaims any unused escrow after the channel expires.

This is a **settlement primitive other agents call** — not an execution skill. It
does not swap, deploy, or move tokens generically; the `pharos-skill-engine` owns
that. This is the payment rail agents bill each other over.

## When to use

- An agent charges another agent per API call / tool call / inference.
- Prepaid, metered usage between agents (top up, draw down per call).
- Any agent-to-agent service where a transaction per call would be too slow/costly.

## When NOT to use

- One-off transfers or swaps — use `pharos-skill-engine`.
- Payments where on-chain-per-payment is fine and metering isn't needed.

## Capability Index

Pharos Skill Engine format — map a user intent to its on-chain operation. Full `cast`/`forge` command templates (parameters, output parsing, error handling) are in [`references/pay-per-call.md`](references/pay-per-call.md).

| User Need | Capability | Detailed Instructions |
|---|---|---|
| Open a payment channel / escrow PHRS for a provider | `cast send openChannel()` | → [references/pay-per-call.md](references/pay-per-call.md#open-a-channel) |
| Pay per call (sign an off-chain voucher) | `cast wallet sign` voucher | → [references/pay-per-call.md](references/pay-per-call.md#sign-a-voucher-off-chain--free-no-transaction) |
| Redeem vouchers / get paid (provider) | `cast send redeem()` | → [references/pay-per-call.md](references/pay-per-call.md#redeem-provider-only) |
| Reclaim unused escrow after expiry | `cast send reclaim()` | → [references/pay-per-call.md](references/pay-per-call.md#reclaim-payer-only-after-expiry) |
| Inspect a channel | `cast call` views | → [references/pay-per-call.md](references/pay-per-call.md#views-free--no-gas) |

> Same verified contract (`0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05`), two interfaces: drive it with `cast`/`forge` (above, Pharos Skill Engine style) **or** the ethers `scripts/` (below).

## How it works

1. **Open a channel** — payer escrows PHRS for a specific provider, with an expiry.
2. **Pay per call (off-chain)** — for each call, the payer signs a voucher with the
   new *cumulative* total owed. Free, instant, no transaction.
3. **Redeem** — the provider submits the latest voucher on-chain; the contract pays
   `cumulative − alreadyWithdrawn`. One tx settles every call so far.
4. **Reclaim** — after expiry, the payer withdraws whatever wasn't redeemed.

### The voucher (the security keystone)

```
voucherHash = keccak256(abi.encodePacked(contractAddress, channelId, cumulativeAmount))
signature   = personal_sign(voucherHash)        // ethers wallet.signMessage(getBytes(hash))
```

On redeem, the contract recovers the signer and requires it equals the channel
**payer**. Binding `contractAddress` + `channelId` + `cumulativeAmount` stops voucher
forgery, cross-channel replay, and cross-contract replay; the `withdrawn`
high-water mark stops double-claims. Use `signVoucher()` in `scripts/lib.js` — it
matches the contract exactly.

## Prerequisites

- **Node 18+**, then from the skill directory: `npm install` (ethers v6 + dotenv).
- A `.env` (copy `.env.example`) with:
  - `RPC` — a ZAN Atlantic endpoint `https://api.zan.top/node/v1/pharos/atlantic/<KEY>` (free at https://zan.top → Node Service). The bare `dplabs` RPC presents a `*.zan.top` cert and is rejected by `ethers`/`forge`. See `references/network.md`.
  - `PRIVATE_KEY` — the agent wallet (testnet only; never commit it).
  - `CONTRACT_ADDRESS` — the deployed channels contract (below).
- A funded wallet — claim PHRS at https://testnet.pharosnetwork.xyz.

## Deployed contract (Pharos Atlantic Testnet)

- **Address:** `0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05`
- **Explorer:** https://atlantic.pharosscan.xyz/address/0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05
- **Chain ID:** 688689 · **Token:** PHRS

Set `CONTRACT_ADDRESS=0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05` to use the shared
deployment, or deploy your own from `contracts/`.

## Agent workflow

The **payer** runs `openChannel`, `voucher` (per call), and `reclaim`. The
**provider** runs `redeem` with its own key. Both run from the skill directory.

```bash
# Payer: open a channel escrowing 0.2 PHRS to a provider for 1 hour.
node scripts/openChannel.js <providerAddress> 0.2 3600     # prints channelId

# Payer: sign a voucher per call (off-chain, free). Cumulative grows each call.
node scripts/voucher.js <channelId> 0.05      # after call 1
node scripts/voucher.js <channelId> 0.10      # after call 2
node scripts/voucher.js <channelId> 0.15      # after call 3

# Provider (PRIVATE_KEY = provider): redeem the latest voucher — settles all calls.
node scripts/redeem.js <channelId>

# Inspect any time.
node scripts/query.js <channelId>

# Payer: after expiry, reclaim the unused escrow.
node scripts/reclaim.js <channelId>
```

Run the whole thing end-to-end (funds a provider automatically):

```bash
node scripts/demo.js 0.2 60
```

`voucher.js` saves the latest signed voucher to a gitignored `.vouchers.json`; in a
real deployment the payer sends each voucher to the provider out-of-band, and the
provider calls `redeem` with `<cumulativeWei> <signature>`.

## Worked example

```bash
# Payer opens a channel to provider P, escrowing 1 PHRS for an hour.
node scripts/openChannel.js 0xProvider... 1 3600        # -> channelId 0

# Provider serves 3 calls; payer signs cumulative 0.2, 0.5, 0.9 PHRS (off-chain).
node scripts/voucher.js 0 0.2
node scripts/voucher.js 0 0.5
node scripts/voucher.js 0 0.9

# Provider redeems once -> receives 0.9 PHRS for all 3 calls in a single tx.
node scripts/redeem.js 0

# After expiry, payer reclaims the remaining 0.1 PHRS.
node scripts/reclaim.js 0
```

## Composability

Pairs with the `commit-reveal-coordination` skill: agents privately **bid** for a
job (commit-reveal), then **pay per call** for the work (this skill). Coordination +
settlement is the spine of an agent-commerce protocol.

## References

- `references/network.md` — Pharos Atlantic params, RPC guidance, deployed address.
- `references/contract.md` — every function, its args, reverts, and events.
- `references/abi.json` — the contract ABI used by the scripts.
