# Pay-Per-Call Settlement — Operation Instructions

> **Contract:** `0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05` (`PayPerCallChannels`, verified on Pharos Scan)
> **Network:** Pharos Atlantic Testnet · chain-id `688689`
> **RPC:** `export RPC=https://api.zan.top/node/v1/pharos/atlantic/<YOUR_KEY>` (free key at zan.top → Node Service). The bare `dplabs` URL presents a `*.zan.top` cert and is rejected by `cast`/`forge`.
> **Private key:** pass explicitly via `--private-key $PRIVATE_KEY`. Add `--legacy` on every write — Atlantic requires legacy (type-0) gas.

Sections follow: Overview → Command Template → Parameters → Output Parsing → Error Handling → Agent Guidelines.

---

## Open a channel

### Overview
Escrow PHRS for a specific provider, opening a unidirectional payment channel with an expiry.

### Command Template
```bash
# The new channelId is the value of nextChannelId() immediately BEFORE this call (ids start at 0).
cast call 0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05 "nextChannelId()(uint256)" --rpc-url $RPC   # = your new channelId
cast send 0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05 "openChannel(address,uint64)" \
  <providerAddress> 3600 --value 0.2ether \
  --private-key $PRIVATE_KEY --rpc-url $RPC --legacy
```

### Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| provider | address | Yes | The only address allowed to redeem from this channel |
| duration | uint64 | Yes | Seconds until the payer may reclaim the remainder |
| (value) | PHRS | Yes | `--value <amount>ether` — the escrow deposit (must be > 0) |

### Output Parsing
| Field | Description |
|---|---|
| channelId | `nextChannelId()` read before the send; also in the `ChannelOpened` event |

### Error Handling
| Error | Cause | Fix |
|---|---|---|
| `ZeroDeposit()` | `--value` is 0 | Send a positive deposit |
| `ZeroProvider()` | provider is `0x0` | Pass a real provider address |
| `ZeroDuration()` | duration is 0 | Pass duration > 0 |

> **Agent Guidelines**: 1) Read `nextChannelId()` first, record it. 2) `--value Xether` carries the deposit. 3) `--legacy`.

---

## Sign a voucher (off-chain — free, NO transaction)

### Overview
Authorize a payment for a call by signing a voucher. The amount is **cumulative** (total owed so far). This is free and off-chain; the provider redeems the latest one on-chain.

### Command Template
```bash
# cumulative amount in WEI (0.15 PHRS = 150000000000000000)
VH=$(cast keccak $(cast concat-hex \
  0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05 \
  $(cast to-uint256 <channelId>) \
  $(cast to-uint256 <cumulativeWei>)))
SIG=$(cast wallet sign --private-key $PRIVATE_KEY $VH)   # EIP-191 personal_sign
echo "$SIG"     # send this signature + the cumulative amount to the provider
```

### Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| channelId | uint256 | Yes | The channel |
| cumulativeWei | uint256 | Yes | Total PHRS (wei) authorized so far — must only ever increase |

### Output Parsing
| Field | Description |
|---|---|
| SIG | 65-byte signature; hand it + the cumulative amount to the provider out-of-band |

> **Agent Guidelines**: 1) The amount is cumulative, not per-call — each voucher supersedes the last. 2) Never exceed the channel deposit. 3) Verify with `cast call voucherHash(uint256,uint256)` if unsure.

---

## Redeem (provider only)

### Overview
The provider submits the latest voucher to get paid `cumulativeAmount − alreadyWithdrawn`. One redeem settles every call so far.

### Command Template
```bash
cast send 0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05 "redeem(uint256,uint256,bytes)" \
  <channelId> <cumulativeWei> $SIG \
  --private-key $PROVIDER_KEY --rpc-url $RPC --legacy
```

### Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| channelId | uint256 | Yes | The channel |
| cumulativeAmount | uint256 | Yes | The voucher amount (wei) |
| signature | bytes | Yes | The payer's voucher signature |

### Error Handling
| Error | Cause | Fix |
|---|---|---|
| `NotProvider()` | caller isn't the channel provider | Run from the provider wallet |
| `BadVoucher()` | signature doesn't recover the payer | Use a voucher signed by the channel payer |
| `AmountExceedsDeposit()` | cumulative > deposit | Top up, or use a voucher ≤ deposit |
| `NothingToRedeem()` | cumulative ≤ already withdrawn | Use a higher (newer) voucher |

> **Agent Guidelines**: 1) Redeem the HIGHEST voucher you hold. 2) Redeem before the channel expires, or the payer can reclaim it.

---

## Reclaim (payer only, after expiry)

### Overview
The payer withdraws the unredeemed remainder after the channel expires; this closes the channel.

### Command Template
```bash
cast send 0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05 "reclaim(uint256)" \
  <channelId> --private-key $PRIVATE_KEY --rpc-url $RPC --legacy
```

### Error Handling
| Error | Cause | Fix |
|---|---|---|
| `NotExpired()` | before the expiry | Wait until `expiry` passes |
| `NotPayer()` | caller isn't the payer | Run from the payer wallet |
| `ChannelClosed()` | already reclaimed | — |

---

## Views (free — no gas)

```bash
cast call 0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05 \
  "getChannel(uint256)((address,address,uint256,uint256,uint64,bool))" <channelId> --rpc-url $RPC
cast call 0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05 "redeemable(uint256)(uint256)" <channelId> --rpc-url $RPC
cast call 0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05 "voucherHash(uint256,uint256)(bytes32)" <channelId> <cumulativeWei> --rpc-url $RPC
```
