// Sign a pay-per-call voucher OFF-CHAIN (free, no transaction).
// The payer signs a new cumulative total after each call; the provider redeems
// the latest one on-chain. Usage:
//   node scripts/voucher.js <channelId> <cumulativePHRS>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getSigner, voucherHash, signVoucher, toWei } from './lib.js';

const STORE = '.vouchers.json';

try {
  const [channelId, cumulativePhrs] = process.argv.slice(2);
  if (channelId === undefined || cumulativePhrs === undefined) {
    console.error('Usage: node scripts/voucher.js <channelId> <cumulativePHRS>');
    process.exit(1);
  }

  const signer = getSigner();
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const cumulativeWei = toWei(cumulativePhrs);

  const hash = voucherHash(contractAddress, channelId, cumulativeWei);
  const signature = await signVoucher(signer, contractAddress, channelId, cumulativeWei);

  const store = existsSync(STORE) ? JSON.parse(readFileSync(STORE)) : {};
  store[channelId] = {
    channelId,
    contract: contractAddress,
    payer: signer.address,
    cumulativePHRS: String(cumulativePhrs),
    cumulativeWei: cumulativeWei.toString(),
    voucherHash: hash,
    signature,
  };
  writeFileSync(STORE, JSON.stringify(store, null, 2) + '\n');

  console.log(`Signed voucher for channel ${channelId} (off-chain, free, no tx).`);
  console.log(`  cumulative: ${cumulativePhrs} PHRS`);
  console.log(`  signature:  ${signature}`);
  console.log(`Saved to ${STORE}. The provider redeems with: node scripts/redeem.js ${channelId}`);
} catch (e) {
  console.error('Error:', e.shortMessage || e.message || e);
  process.exit(1);
}
