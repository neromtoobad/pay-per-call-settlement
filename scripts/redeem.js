// Redeem a voucher on-chain (run by the PROVIDER — their key in PRIVATE_KEY).
// Pays out (cumulativeAmount - alreadyWithdrawn). Usage:
//   node scripts/redeem.js <channelId>                       (reads latest from .vouchers.json)
//   node scripts/redeem.js <channelId> <cumulativeWei> <signature>   (explicit, e.g. received out-of-band)
import { readFileSync, existsSync } from 'node:fs';
import { getSigner, getContract, fromWei, txLink } from './lib.js';

const STORE = '.vouchers.json';

try {
  const [channelId, cumulativeWeiArg, signatureArg] = process.argv.slice(2);
  if (channelId === undefined) {
    console.error('Usage: node scripts/redeem.js <channelId> [cumulativeWei signature]');
    process.exit(1);
  }

  let cumulativeWei = cumulativeWeiArg;
  let signature = signatureArg;
  if (cumulativeWei === undefined || signature === undefined) {
    if (!existsSync(STORE)) throw new Error(`No ${STORE} and no explicit voucher args given.`);
    const entry = JSON.parse(readFileSync(STORE))[channelId];
    if (!entry) throw new Error(`No saved voucher for channel ${channelId} in ${STORE}.`);
    cumulativeWei = entry.cumulativeWei;
    signature = entry.signature;
  }

  const contract = getContract(getSigner());
  console.log(`Redeeming channel ${channelId} for cumulative ${fromWei(cumulativeWei)} PHRS`);
  const tx = await contract.redeem(BigInt(channelId), BigInt(cumulativeWei), signature);
  console.log('tx:', txLink(tx.hash));
  const receipt = await tx.wait();

  let paid;
  for (const log of receipt.logs) {
    try {
      const p = contract.interface.parseLog(log);
      if (p?.name === 'Redeemed') { paid = p.args.paid; break; }
    } catch { /* not ours */ }
  }
  console.log('');
  console.log(`Redeemed. Paid this call: ${paid !== undefined ? fromWei(paid) : '?'} PHRS.`);
} catch (e) {
  console.error('Error:', e.shortMessage || e.message || e);
  process.exit(1);
}
