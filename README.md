# pay-per-call-settlement

**x402-style pay-per-call settlement for Pharos AI agents.** One agent pays another
per call — per API hit, per tool invocation, per inference — settled on-chain
**without a transaction per call**. Escrow once, sign cheap off-chain vouchers, settle
the lot in a single redeem.

- **Skill:** installable via `npx skills add <repo-url>` (Claude Code / Codex / OpenClaw)
- **Contract:** [`0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05`](https://atlantic.pharosscan.xyz/address/0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05) on Pharos Atlantic Testnet (chainId `688689`)

## The problem

Agents that sell services to other agents need to bill *per call*. Settling each
call on-chain is too slow and too expensive for metered, high-frequency usage —
but trusting the counterparty to pay later isn't an option either.

## What it is

Unidirectional **payment channels** (the x402 / state-channel pattern), as an
installable Pharos skill backed by `PayPerCallChannels.sol`. A payer escrows PHRS
for a provider once; for each call the payer signs an off-chain voucher with the new
**cumulative** total owed; the provider serves instantly (funds are locked) and
redeems the **latest** voucher on-chain whenever it wants. N calls → 1 transaction.

It's a **settlement primitive other agents call** — not an execution skill.

### The voucher (the security keystone)

```
voucherHash = keccak256(abi.encodePacked(contractAddress, channelId, cumulativeAmount))
signature   = personal_sign(voucherHash)
```

On redeem, the contract recovers the signer and requires it equals the channel
**payer**. Binding `contractAddress` + `channelId` + `cumulativeAmount` stops voucher
forgery, cross-channel replay, and cross-contract replay; a `withdrawn` high-water
mark stops double-claims. The JS `signVoucher()` is verified to match the contract's
on-chain `voucherHash()` exactly.

## Install & use

```bash
npx skills add <repo-url>
cd ~/.claude/skills/pay-per-call-settlement
npm install
cp .env.example .env      # set RPC (ZAN key) + PRIVATE_KEY + CONTRACT_ADDRESS
```

```bash
# Payer: escrow 1 PHRS to a provider for an hour.
node scripts/openChannel.js 0xProvider... 1 3600        # -> channelId

# Payer: one voucher per call (off-chain, free). Cumulative grows each call.
node scripts/voucher.js <channelId> 0.2
node scripts/voucher.js <channelId> 0.5
node scripts/voucher.js <channelId> 0.9

# Provider (its own key): redeem the latest voucher — settles every call at once.
node scripts/redeem.js <channelId>

# Payer: reclaim the unused escrow after expiry.
node scripts/reclaim.js <channelId>
```

Or run it all at once (auto-funds a provider): `node scripts/demo.js 0.2 60`

## Live proof

A full pay-per-call cycle on Pharos Atlantic (log: [`proof/transcript.md`](proof/transcript.md)):

| Step | Transaction |
|---|---|
| Deploy | [`0x45fc…79db`](https://atlantic.pharosscan.xyz/tx/0x45fce2a61c34ce9a475d2c2247ac2c8cee3cabaffc11b14634f1064206b379db) |
| Open channel (escrow 0.2) | [`0xddd5…0cfe8`](https://atlantic.pharosscan.xyz/tx/0xddd5c2e965614b8317593b8c26ebb98c623cb3199c8a7ea507296790cce0cfe8) |
| 3 calls → 3 off-chain vouchers | **0 transactions** (cumulative 0.05 → 0.10 → 0.15) |
| Redeem latest → settles all 3 | [`0xb39a…f7a5`](https://atlantic.pharosscan.xyz/tx/0xb39aa2e9e68b612f7971904fcc4678643e9766ec8ef3cd6abb9c79fda9baf7a5) |
| Reclaim remainder (0.05) | [`0x93fd…9864`](https://atlantic.pharosscan.xyz/tx/0x93fdf1c402b7581ea3808fd83e83f9fdf1bae013d0eb3f533cdfc48927539864) |

Three calls were authorized with free off-chain signatures and settled by one
on-chain transaction; the unused escrow was returned. Pay per call, settle once.

## Security

```
forge test -vvv     # 12 passed
```

Headline tests: `test_RevertWhen_ForgedVoucher` (non-payer signature),
`test_RevertWhen_VoucherFromAnotherChannel` (cross-channel replay), and
`test_RevertWhen_VoucherFromAnotherContract` (cross-contract replay) — plus
over-draw, no-replay, access control, and lifecycle.

## Repo layout

```
SKILL.md                 # agent-facing: when & how to use
references/              # network params, contract reference, ABI
scripts/                 # ethers v6 scripts (open/voucher/redeem/reclaim/query + demo)
contracts/               # Foundry: contract, tests, deploy script
proof/transcript.md      # live on-chain run
```

## Composability

Pairs with [`commit-reveal-coordination`](https://github.com/neromtoobad/commit-reveal-coordination):
agents privately **bid** for a job (commit-reveal), then **pay per call** for the
work (this skill). Coordination + settlement is the spine of an agent-commerce
protocol — the Phase-2 Agent Arena thesis.

## License

MIT
