// Open a payment channel and escrow PHRS for a provider.
// Usage: node scripts/openChannel.js <providerAddress> <depositPHRS> <durationSeconds>
import { getSigner, getContract, toWei, txLink } from './lib.js';

try {
  const [provider, depositPhrs, durationArg] = process.argv.slice(2);
  if (!provider || depositPhrs === undefined || durationArg === undefined) {
    console.error('Usage: node scripts/openChannel.js <providerAddress> <depositPHRS> <durationSeconds>');
    process.exit(1);
  }

  const contract = getContract(getSigner());
  const value = toWei(depositPhrs);

  console.log(`Opening channel -> provider ${provider}, deposit ${depositPhrs} PHRS, duration ${durationArg}s`);
  const tx = await contract.openChannel(provider, BigInt(durationArg), { value });
  console.log('tx:', txLink(tx.hash));
  const receipt = await tx.wait();

  let channelId;
  for (const log of receipt.logs) {
    try {
      const p = contract.interface.parseLog(log);
      if (p?.name === 'ChannelOpened') { channelId = p.args.channelId; break; }
    } catch { /* not ours */ }
  }

  console.log('');
  console.log(`Channel opened. channelId = ${channelId}`);
  console.log(`Next: sign per-call vouchers off-chain with: node scripts/voucher.js ${channelId} <cumulativePHRS>`);
} catch (e) {
  console.error('Error:', e.shortMessage || e.message || e);
  process.exit(1);
}
