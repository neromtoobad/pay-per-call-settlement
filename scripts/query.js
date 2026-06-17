// Inspect a channel's state.
// Usage: node scripts/query.js <channelId>
import { getContract, fromWei } from './lib.js';

try {
  const [channelId] = process.argv.slice(2);
  if (channelId === undefined) {
    console.error('Usage: node scripts/query.js <channelId>');
    process.exit(1);
  }

  const contract = getContract();
  const id = BigInt(channelId);
  const c = await contract.getChannel(id);
  const redeemable = await contract.redeemable(id);

  console.log(`Channel ${channelId}`);
  console.log(`  payer:      ${c.payer}`);
  console.log(`  provider:   ${c.provider}`);
  console.log(`  deposit:    ${fromWei(c.deposit)} PHRS`);
  console.log(`  withdrawn:  ${fromWei(c.withdrawn)} PHRS`);
  console.log(`  remaining:  ${fromWei(redeemable)} PHRS`);
  console.log(`  expiry:     ${new Date(Number(c.expiry) * 1000).toISOString()}`);
  console.log(`  closed:     ${c.closed}`);
} catch (e) {
  console.error('Error:', e.shortMessage || e.message || e);
  process.exit(1);
}
