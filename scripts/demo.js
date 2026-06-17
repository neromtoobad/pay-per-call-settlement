// End-to-end live demo: pay-per-call settlement on Pharos Atlantic.
// Payer = the wallet in .env. Provider = a fresh wallet funded by the payer.
// Shows 3 off-chain vouchers (3 "calls", zero tx) settled by ONE on-chain redeem,
// then the payer reclaims the remainder. Writes proof/transcript.md.
//
// Usage: node scripts/demo.js [depositPHRS] [durationSecs]
import { ethers } from 'ethers';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  getProvider, getSigner, getContract,
  signVoucher, toWei, fromWei, txLink, addressLink, EXPLORER,
} from './lib.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const log = (s = '') => { console.log(s); lines.push(s); };

async function waitForTimestamp(provider, ts, label) {
  log(`  ...waiting for ${label}`);
  for (;;) {
    const b = await provider.getBlock('latest');
    if (b.timestamp > ts) return;
    await sleep(3000);
  }
}

function eventArgs(contract, receipt, name) {
  for (const lg of receipt.logs) {
    try { const p = contract.interface.parseLog(lg); if (p?.name === name) return p.args; } catch { /* skip */ }
  }
  return null;
}

try {
  const [depositArg, durationArg] = process.argv.slice(2);
  const depositPhrs = depositArg ?? '0.2';
  const duration = Number(durationArg ?? 60);

  const provider = getProvider();
  const payer = getSigner();
  const providerWallet = ethers.Wallet.createRandom().connect(provider);
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const payerContract = getContract(payer);
  const providerContract = getContract(providerWallet);

  log('# Live proof — pay-per-call settlement on Pharos Atlantic');
  log('');
  log(`- Contract: [\`${contractAddress}\`](${addressLink(contractAddress)})`);
  log(`- Chain: Pharos Atlantic Testnet (688689) · Explorer: ${EXPLORER}`);
  log(`- Payer:    [\`${payer.address}\`](${addressLink(payer.address)})`);
  log(`- Provider: [\`${providerWallet.address}\`](${addressLink(providerWallet.address)}) (freshly generated, funded by payer)`);
  log('');

  // 1. Fund provider for redeem gas.
  log('## 1. Fund provider (for redeem gas)');
  const fundTx = await payer.sendTransaction({ to: providerWallet.address, value: toWei('0.02') });
  log(`- fund tx: [\`${fundTx.hash}\`](${txLink(fundTx.hash)})`);
  await fundTx.wait();
  log('');

  // 2. Open channel.
  log(`## 2. Open channel (escrow ${depositPhrs} PHRS)`);
  const openTx = await payerContract.openChannel(providerWallet.address, duration, { value: toWei(depositPhrs) });
  log(`- open tx: [\`${openTx.hash}\`](${txLink(openTx.hash)})`);
  const openRc = await openTx.wait();
  const channelId = eventArgs(payerContract, openRc, 'ChannelOpened').channelId;
  const channel = await payerContract.getChannel(channelId);
  log(`- channelId: ${channelId} · expiry: ${new Date(Number(channel.expiry) * 1000).toISOString()}`);
  log('');

  // 3. Three off-chain vouchers — one per "call". No transactions.
  log('## 3. Pay per call (off-chain vouchers — zero transactions)');
  const cumulatives = ['0.05', '0.10', '0.15'];
  let lastSig;
  for (let i = 0; i < cumulatives.length; i++) {
    const cum = cumulatives[i];
    lastSig = await signVoucher(payer, contractAddress, channelId, toWei(cum));
    log(`- call ${i + 1}: signed voucher, cumulative ${cum} PHRS  (off-chain, free)`);
  }
  log(`- 3 calls authorized, **0 transactions** so far. The provider holds signatures worth ${cumulatives[cumulatives.length - 1]} PHRS.`);
  log('');

  // 4. Provider settles all three with ONE redeem of the latest voucher.
  log('## 4. Settle — one redeem covers all three calls');
  const provStart = await provider.getBalance(providerWallet.address);
  const redeemTx = await providerContract.redeem(channelId, toWei('0.15'), lastSig);
  log(`- redeem tx: [\`${redeemTx.hash}\`](${txLink(redeemTx.hash)})`);
  const redeemRc = await redeemTx.wait();
  const paid = eventArgs(providerContract, redeemRc, 'Redeemed').paid;
  log(`- provider redeemed cumulative 0.15 PHRS in a single tx (paid: ${fromWei(paid)} PHRS)`);
  log('');

  // 5. After expiry, payer reclaims the remainder.
  log('## 5. Reclaim remainder after expiry');
  await waitForTimestamp(provider, Number(channel.expiry), 'channel to expire');
  const reclaimTx = await payerContract.reclaim(channelId);
  log(`- reclaim tx: [\`${reclaimTx.hash}\`](${txLink(reclaimTx.hash)})`);
  const reclaimRc = await reclaimTx.wait();
  const reclaimed = eventArgs(payerContract, reclaimRc, 'Reclaimed').amount;
  log(`- payer reclaimed ${fromWei(reclaimed)} PHRS (deposit ${depositPhrs} − settled 0.15)`);
  log('');

  log('## Result');
  log('Three pay-per-call charges were authorized with free off-chain signatures and settled by a single on-chain transaction, then the unused escrow was returned. This is x402-style metered payment between agents — pay per call, settle once.');

  mkdirSync('proof', { recursive: true });
  writeFileSync('proof/transcript.md', lines.join('\n') + '\n');
  console.log('\nWrote proof/transcript.md');
} catch (e) {
  console.error('Error:', e.shortMessage || e.message || e);
  process.exit(1);
}
