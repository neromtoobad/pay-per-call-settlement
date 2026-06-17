# Contract — PayPerCallChannels

Unidirectional payment channels for x402-style pay-per-call settlement.
Source: `contracts/src/PayPerCallChannels.sol`.

## The voucher

```
voucherHash = keccak256(abi.encodePacked(address(this), channelId, cumulativeAmount))
signature   = personal_sign(voucherHash)
```

A voucher authorizes a **cumulative** total owed on a channel. The provider only
ever submits the highest voucher it holds; on redeem the contract pays
`cumulativeAmount − withdrawn`. Build/sign with `scripts/lib.js` →
`voucherHash()` / `signVoucher()`, which match the contract.

## Struct

```solidity
struct Channel {
    address payer;      // funds the channel, signs vouchers
    address provider;   // sole redeemer
    uint256 deposit;    // total escrowed (grows with topUp)
    uint256 withdrawn;  // cumulative redeemed so far
    uint64  expiry;     // payer may reclaim remainder after this
    bool    closed;     // set on reclaim; channel becomes inert
}
```

## Functions

### `openChannel(provider, duration) payable → channelId`
Escrow `msg.value` for `provider`; `expiry = now + duration`.
- Reverts `ZeroDeposit` if `msg.value == 0`.
- Reverts `ZeroDuration` if `duration == 0`.
- Reverts `ZeroProvider` if `provider == address(0)`.
- Reverts `ExpiryOverflow` if the expiry would exceed `uint64`.
- Emits `ChannelOpened`.

### `topUp(channelId) payable`
Add escrow to an open channel.
- Reverts `ChannelDoesNotExist`, `ChannelClosed`, `NotPayer`, `ZeroDeposit`.
- Emits `ToppedUp`.

### `redeem(channelId, cumulativeAmount, signature)`
Provider claims `cumulativeAmount − withdrawn`.
- Reverts `ChannelDoesNotExist` / `ChannelClosed`.
- Reverts `NotProvider` if caller isn't the channel provider.
- Reverts `AmountExceedsDeposit` if `cumulativeAmount > deposit`.
- Reverts `NothingToRedeem` if `cumulativeAmount <= withdrawn`.
- Reverts `BadVoucher` if the signature doesn't recover the payer (forged,
  wrong channel, or wrong contract).
- Emits `Redeemed(channelId, provider, cumulativeAmount, paid)`.

### `reclaim(channelId)`
Payer withdraws the remainder after expiry; closes the channel.
- Reverts `ChannelDoesNotExist` / `ChannelClosed`, `NotPayer`, `NotExpired`.
- Emits `Reclaimed(channelId, payer, amount)`.

## Views

| View | Returns |
|---|---|
| `voucherHash(channelId, cumulativeAmount)` | the hash a payer signs |
| `getChannel(channelId)` | the full `Channel` struct |
| `redeemable(channelId)` | `deposit − withdrawn` (max still claimable) |
| `channels(channelId)` | public mapping getter |
| `nextChannelId()` | next id / channel count |

## Events

```solidity
event ChannelOpened(uint256 indexed channelId, address indexed payer, address indexed provider, uint256 deposit, uint64 expiry);
event ToppedUp(uint256 indexed channelId, uint256 amount, uint256 newDeposit);
event Redeemed(uint256 indexed channelId, address indexed provider, uint256 cumulativeAmount, uint256 paid);
event Reclaimed(uint256 indexed channelId, address indexed payer, uint256 amount);
```

## Security properties

- **Forgery / replay resistance** — a voucher binds `address(this)`, `channelId`,
  and `cumulativeAmount`; the recovered signer must equal the payer. Covered by
  `test_RevertWhen_ForgedVoucher`, `test_RevertWhen_VoucherFromAnotherChannel`,
  and `test_RevertWhen_VoucherFromAnotherContract`.
- **No double-claim** — `withdrawn` only moves up; a stale/equal voucher reverts
  `NothingToRedeem`.
- **No over-draw** — `cumulativeAmount` is capped by `deposit`.
- **Provider must redeem before expiry** — after expiry the payer can reclaim the
  remainder, so the provider should redeem its latest voucher before the channel
  expires.
