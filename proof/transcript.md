# Live proof — pay-per-call settlement on Pharos Atlantic

- Contract: [`0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05`](https://atlantic.pharosscan.xyz/address/0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05)
- Chain: Pharos Atlantic Testnet (688689) · Explorer: https://atlantic.pharosscan.xyz
- Payer: [`0x7137684FEA3e46b280307C2fDB59d095Af09a7fc`](https://atlantic.pharosscan.xyz/address/0x7137684FEA3e46b280307C2fDB59d095Af09a7fc)
- Provider: [`0xC372EFe7b30E0517a670FBC439948bc59d29CcAF`](https://atlantic.pharosscan.xyz/address/0xC372EFe7b30E0517a670FBC439948bc59d29CcAF) (freshly generated, funded by payer)

## 1. Open channel
- fund tx: [`0x50e4ebdc8d3d6a9397971b07be9235968f8307dd6d9ce64962619acbe4ac5944`](https://atlantic.pharosscan.xyz/tx/0x50e4ebdc8d3d6a9397971b07be9235968f8307dd6d9ce64962619acbe4ac5944)
- open tx: [`0xc4d0069290847ce6119421d2301cd64ca9efabef9e5f45b687a38c730b1b661c`](https://atlantic.pharosscan.xyz/tx/0xc4d0069290847ce6119421d2301cd64ca9efabef9e5f45b687a38c730b1b661c) — channel 3, escrow 0.2 PHRS

## 2. Pay per call (off-chain vouchers — zero transactions)
- call 1: cumulative 0.05 PHRS (off-chain, free)
- call 2: cumulative 0.1 PHRS (off-chain, free)
- call 3: cumulative 0.15 PHRS (off-chain, free)
- 3 calls authorized, **0 transactions** so far; provider holds signatures worth 0.15 PHRS.

## 3. Forged-voucher attack — rejected on-chain
- A voucher signed by the provider (not the payer) was rejected: `redeem` recovers the signer and requires it equals the channel payer (BadVoucher).

## 4. Settle — one redeem covers all three calls
- redeem tx: [`0xe9b12fe958c009135062f742e9626ea4703082df1ef6ed80833ac11ccab1b1e2`](https://atlantic.pharosscan.xyz/tx/0xe9b12fe958c009135062f742e9626ea4703082df1ef6ed80833ac11ccab1b1e2) — paid 0.15 PHRS

## 5. Reclaim remainder after expiry
- reclaim tx: [`0x5850402a12d97d6a1e8ad21993d2b733ebbfe9626b11f49f5e156a671f46d04f`](https://atlantic.pharosscan.xyz/tx/0x5850402a12d97d6a1e8ad21993d2b733ebbfe9626b11f49f5e156a671f46d04f) — 0.05 PHRS returned

## Result
**3 calls settled in 1 transaction.** Provider earned 0.15 PHRS, payer reclaimed 0.05 PHRS, and a forged voucher was rejected on-chain. Pay per call, settle once.
