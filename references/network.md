# Network — Pharos Atlantic Testnet

| Field | Value |
|---|---|
| Network | Pharos Atlantic Testnet |
| Chain ID | `688689` |
| Token | `PHRS` |
| Explorer | https://atlantic.pharosscan.xyz (also https://pharos-testnet.socialscan.io) |
| Faucet | https://testnet.pharosnetwork.xyz (requires binding an X account) |

## Deployed contract

| Field | Value |
|---|---|
| Contract | `PayPerCallChannels` |
| Address | `0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05` |
| Explorer | https://atlantic.pharosscan.xyz/address/0xAcAB26A6130fC6cB32CAB58Ec0F011E7346a2E05 |
| Deploy tx | `0x45fce2a61c34ce9a475d2c2247ac2c8cee3cabaffc11b14634f1064206b379db` |

## RPC — use a ZAN keyed endpoint

```
RPC=https://api.zan.top/node/v1/pharos/atlantic/<YOUR_KEY>
```

Get a free key at https://zan.top → **Node Service** → create API key.

The commonly documented `https://testnet.dplabs-internal.com` presents a `*.zan.top`
TLS certificate, so strict clients (`ethers`, `forge`, `cast`) reject the hostname
mismatch (`invalid peer certificate: NotValidForName`). Browsers tolerate it; the
CLI tooling does not. The ZAN keyed endpoint has a valid cert and serves standard
JSON-RPC.

## Wallet setup (MetaMask)

- Network Name: `Pharos Atlantic Testnet`
- RPC URL: your ZAN endpoint
- Chain ID: `688689`
- Currency Symbol: `PHRS`
- Block Explorer: `https://atlantic.pharosscan.xyz`
