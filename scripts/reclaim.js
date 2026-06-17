// Reclaim the unredeemed remainder of a channel after expiry (run by the PAYER).
// Usage: node scripts/reclaim.js <channelId>
import { getSigner, getContract, fromWei, txLink } from './lib.js';

try {
  const [channelId] = process.argv.slice(2);
  if (channelId === undefined) {
    console.error('Usage: node scripts/reclaim.js <channelId>');
    process.exit(1);
  }

  const contract = getContract(getSigner());
  console.log(`Reclaiming remainder of channel ${channelId}...`);
  const tx = await contract.reclaim(BigInt(channelId));
  console.log('tx:', txLink(tx.hash));
  const receipt = await tx.wait();

  let amount;
  for (const log of receipt.logs) {
    try {
      const p = contract.interface.parseLog(log);
      if (p?.name === 'Reclaimed') { amount = p.args.amount; break; }
    } catch { /* not ours */ }
  }
  console.log('');
  console.log(`Reclaimed ${amount !== undefined ? fromWei(amount) : '?'} PHRS. Channel closed.`);
} catch (e) {
  console.error('Error:', e.shortMessage || e.message || e);
  process.exit(1);
}
