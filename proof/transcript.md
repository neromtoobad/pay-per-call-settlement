# Live proof — pay-per-call settlement on Pharos Atlantic

- Contract: [`0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05`](https://atlantic.pharosscan.xyz/address/0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05)
- Chain: Pharos Atlantic Testnet (688689) · Explorer: https://atlantic.pharosscan.xyz
- Payer:    [`0x7137684FEA3e46b280307C2fDB59d095Af09a7fc`](https://atlantic.pharosscan.xyz/address/0x7137684FEA3e46b280307C2fDB59d095Af09a7fc)
- Provider: [`0x2938f4Da623E2c01cC4DEb1943917f42e340Decc`](https://atlantic.pharosscan.xyz/address/0x2938f4Da623E2c01cC4DEb1943917f42e340Decc) (freshly generated, funded by payer)

## 1. Fund provider (for redeem gas)
- fund tx: [`0x52bc572f23b65df4efce649d84668b6b800dfb13fb3ca0068dabae6c16b8033f`](https://atlantic.pharosscan.xyz/tx/0x52bc572f23b65df4efce649d84668b6b800dfb13fb3ca0068dabae6c16b8033f)

## 2. Open channel (escrow 0.2 PHRS)
- open tx: [`0xddd5c2e965614b8317593b8c26ebb98c623cb3199c8a7ea507296790cce0cfe8`](https://atlantic.pharosscan.xyz/tx/0xddd5c2e965614b8317593b8c26ebb98c623cb3199c8a7ea507296790cce0cfe8)
- channelId: 0 · expiry: 2026-06-17T11:43:02.000Z

## 3. Pay per call (off-chain vouchers — zero transactions)
- call 1: signed voucher, cumulative 0.05 PHRS  (off-chain, free)
- call 2: signed voucher, cumulative 0.10 PHRS  (off-chain, free)
- call 3: signed voucher, cumulative 0.15 PHRS  (off-chain, free)
- 3 calls authorized, **0 transactions** so far. The provider holds signatures worth 0.15 PHRS.

## 4. Settle — one redeem covers all three calls
- redeem tx: [`0xb39aa2e9e68b612f7971904fcc4678643e9766ec8ef3cd6abb9c79fda9baf7a5`](https://atlantic.pharosscan.xyz/tx/0xb39aa2e9e68b612f7971904fcc4678643e9766ec8ef3cd6abb9c79fda9baf7a5)
- provider redeemed cumulative 0.15 PHRS in a single tx (paid: 0.15 PHRS)

## 5. Reclaim remainder after expiry
- reclaim tx: [`0x93fdf1c402b7581ea3808fd83e83f9fdf1bae013d0eb3f533cdfc48927539864`](https://atlantic.pharosscan.xyz/tx/0x93fdf1c402b7581ea3808fd83e83f9fdf1bae013d0eb3f533cdfc48927539864)
- payer reclaimed 0.05 PHRS (deposit 0.2 − settled 0.15)

## Result
Three pay-per-call charges were authorized with free off-chain signatures and settled by a single on-chain transaction, then the unused escrow was returned. This is x402-style metered payment between agents — pay per call, settle once.
