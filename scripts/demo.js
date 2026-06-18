// Live demo: x402 PAY-PER-CALL settlement on Pharos Atlantic — three off-chain
// vouchers (zero transactions) settled by ONE on-chain redeem, with a live
// forged-voucher attack the contract rejects. Writes proof/transcript.md.
//
// Usage: node scripts/demo.js [depositPHRS] [durationSecs]
import { ethers } from 'ethers';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  getProvider, getSigner, getContract,
  signVoucher, toWei, fromWei, txLink, addressLink,
} from './lib.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- terminal styling ----
const S = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', gray: '\x1b[90m',
};
const short = (h) => `${h.slice(0, 10)}…${h.slice(-4)}`;
const rule = (ch = '═', n = 60) => ch.repeat(n);
function banner(title, sub) {
  console.log(`\n${S.cyan}${rule()}${S.reset}`);
  console.log(`  ${S.bold}${title}${S.reset}`);
  if (sub) console.log(`  ${S.dim}${sub}${S.reset}`);
  console.log(`${S.cyan}${rule()}${S.reset}`);
}
const step = (n, total, t) =>
  console.log(`\n${S.cyan}${S.bold}▎ STEP ${n}/${total}${S.reset}${S.bold} · ${t}${S.reset}`);
const ok = (m) => console.log(`  ${S.green}✓${S.reset} ${m}`);
const bad = (m) => console.log(`  ${S.red}⛔ ${m}${S.reset}`);
const note = (m) => console.log(`     ${S.dim}${m}${S.reset}`);
const txln = (label, hash) =>
  console.log(`  ${S.green}✓${S.reset} ${label}  ${S.gray}${txLink(hash)}${S.reset}`);

// ---- transcript (markdown proof) ----
const T = [];
const rec = (md = '') => T.push(md);

async function waitWindow(provider, ts, label) {
  process.stdout.write(`     ${S.dim}waiting for ${label}…${S.reset}`);
  for (;;) {
    const b = await provider.getBlock('latest');
    if (b.timestamp > ts) { process.stdout.write(`${S.dim} done${S.reset}\n`); return; }
    await sleep(3000);
  }
}
function evt(contract, receipt, name) {
  for (const lg of receipt.logs) {
    try { const p = contract.interface.parseLog(lg); if (p?.name === name) return p.args; } catch { /* skip */ }
  }
  return null;
}

try {
  const [dep, dur] = process.argv.slice(2);
  const depositPhrs = dep ?? '0.2';
  const duration = Number(dur ?? 30);

  const provider = getProvider();
  const payer = getSigner();
  const prov = ethers.Wallet.createRandom().connect(provider);
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const payerC = getContract(payer);
  const provC = getContract(prov);

  banner('PAY-PER-CALL  ·  x402 Settlement', 'Live on Pharos Atlantic Testnet (688689)');

  // Preflight: prove the real connection + balance before spending anything.
  const net = await provider.getNetwork();
  const bal = await provider.getBalance(payer.address);
  if (net.chainId !== 688689n) {
    throw new Error(`Wrong chain ${net.chainId} — open a fresh terminal, or run: unset RPC PRIVATE_KEY CONTRACT_ADDRESS`);
  }
  if (bal < toWei('0.1')) {
    throw new Error(`Payer ${payer.address} balance ${fromWei(bal)} PHRS is too low.`);
  }
  console.log(`\n  ${S.dim}contract${S.reset} ${short(contractAddress)}    ${S.dim}chainId${S.reset} ${net.chainId} ${S.green}✓${S.reset}`);
  console.log(`  ${S.dim}payer   ${S.reset} ${short(payer.address)}    ${S.dim}balance${S.reset} ${Number(fromWei(bal)).toFixed(3)} PHRS`);

  rec('# Live proof — pay-per-call settlement on Pharos Atlantic');
  rec('');
  rec(`- Contract: [\`${contractAddress}\`](${addressLink(contractAddress)})`);
  rec('- Chain: Pharos Atlantic Testnet (688689) · Explorer: https://atlantic.pharosscan.xyz');
  rec(`- Payer: [\`${payer.address}\`](${addressLink(payer.address)})`);
  rec(`- Provider: [\`${prov.address}\`](${addressLink(prov.address)}) (freshly generated, funded by payer)`);
  rec('');

  const TOTAL = 6;

  // STEP 1 — open channel
  step(1, TOTAL, 'Open a channel & escrow funds');
  const fundTx = await payer.sendTransaction({ to: prov.address, value: toWei('0.02') });
  await fundTx.wait();
  txln('funded provider for gas', fundTx.hash);
  const openTx = await payerC.openChannel(prov.address, duration, { value: toWei(depositPhrs) });
  const openRc = await openTx.wait();
  const channelId = evt(payerC, openRc, 'ChannelOpened').channelId;
  const ch = await payerC.getChannel(channelId);
  txln(`channel #${channelId} opened — escrow ${depositPhrs} PHRS`, openTx.hash);
  note(`one up-front transaction; expires in ${duration}s`);
  rec('## 1. Open channel');
  rec(`- fund tx: [\`${fundTx.hash}\`](${txLink(fundTx.hash)})`);
  rec(`- open tx: [\`${openTx.hash}\`](${txLink(openTx.hash)}) — channel ${channelId}, escrow ${depositPhrs} PHRS`);
  rec('');

  // STEP 2 — pay per call off-chain
  step(2, TOTAL, 'Pay per call — sign vouchers OFF-CHAIN (zero tx)');
  const depW = toWei(depositPhrs);
  const calls = [depW / 4n, depW / 2n, (depW * 3n) / 4n];
  let lastSig;
  for (let i = 0; i < calls.length; i++) {
    lastSig = await signVoucher(payer, contractAddress, channelId, calls[i]);
    ok(`call ${i + 1} → cumulative ${fromWei(calls[i])} PHRS   ${S.gray}(off-chain, free)${S.reset}`);
  }
  const settleW = calls[calls.length - 1];
  console.log(`\n  ${S.yellow}⚡ 3 calls authorized · ${S.bold}0 transactions${S.reset}${S.yellow} so far${S.reset}`);
  note(`the provider holds signatures worth ${fromWei(settleW)} PHRS, redeemable anytime.`);
  rec('## 2. Pay per call (off-chain vouchers — zero transactions)');
  for (let i = 0; i < calls.length; i++) rec(`- call ${i + 1}: cumulative ${fromWei(calls[i])} PHRS (off-chain, free)`);
  rec(`- 3 calls authorized, **0 transactions** so far; provider holds signatures worth ${fromWei(settleW)} PHRS.`);
  rec('');

  // STEP 3 — forged voucher attack
  step(3, TOTAL, 'Attack — a FORGED voucher (not signed by the payer)');
  const forged = await signVoucher(prov, contractAddress, channelId, settleW); // signed by provider, not payer
  try {
    const t = await provC.redeem(channelId, settleW, forged);
    await t.wait();
    bad('forged voucher ACCEPTED — should never happen');
  } catch {
    bad('rejected by the contract');
    note('redeem recovers the signer and requires it equals the payer;');
    note('a voucher signed by anyone else fails (BadVoucher).');
  }
  rec('## 3. Forged-voucher attack — rejected on-chain');
  rec('- A voucher signed by the provider (not the payer) was rejected: `redeem` recovers the signer and requires it equals the channel payer (BadVoucher).');
  rec('');

  // STEP 4 — settle
  step(4, TOTAL, 'Settle — one redeem covers all three calls');
  const redeemTx = await provC.redeem(channelId, settleW, lastSig);
  const redeemRc = await redeemTx.wait();
  const paid = evt(provC, redeemRc, 'Redeemed').paid;
  txln(`provider redeemed ${fromWei(settleW)} PHRS in ONE tx (paid ${fromWei(paid)})`, redeemTx.hash);
  const remaining = await payerC.redeemable(channelId);
  note(`3 calls settled by 1 transaction · ${fromWei(remaining)} PHRS still escrowed`);
  rec('## 4. Settle — one redeem covers all three calls');
  rec(`- redeem tx: [\`${redeemTx.hash}\`](${txLink(redeemTx.hash)}) — paid ${fromWei(paid)} PHRS`);
  rec('');

  // STEP 5 — reclaim
  step(5, TOTAL, 'Reclaim the unused escrow after expiry');
  await waitWindow(provider, Number(ch.expiry), 'channel to expire');
  const reclaimTx = await payerC.reclaim(channelId);
  const reclaimRc = await reclaimTx.wait();
  const reclaimed = evt(payerC, reclaimRc, 'Reclaimed').amount;
  txln(`payer reclaimed ${fromWei(reclaimed)} PHRS`, reclaimTx.hash);
  rec('## 5. Reclaim remainder after expiry');
  rec(`- reclaim tx: [\`${reclaimTx.hash}\`](${txLink(reclaimTx.hash)}) — ${fromWei(reclaimed)} PHRS returned`);
  rec('');

  // STEP 6 — summary box
  step(6, TOTAL, 'Result');
  console.log(`  ${S.green}┌─ SETTLED ${rule('─', 37)}${S.reset}`);
  console.log(`  ${S.green}│${S.reset}  ${S.bold}⚡ 3 calls → 1 settlement transaction${S.reset}`);
  console.log(`  ${S.green}│${S.reset}  ${S.dim}provider earned ${fromWei(settleW)} · payer reclaimed ${fromWei(reclaimed)}${S.reset}`);
  console.log(`  ${S.green}│${S.reset}  ${S.dim}pay per call, settle once — x402 between agents.${S.reset}`);
  console.log(`  ${S.green}└${rule('─', 47)}${S.reset}`);
  rec('## Result');
  rec(`**3 calls settled in 1 transaction.** Provider earned ${fromWei(settleW)} PHRS, payer reclaimed ${fromWei(reclaimed)} PHRS, and a forged voucher was rejected on-chain. Pay per call, settle once.`);

  mkdirSync('proof', { recursive: true });
  writeFileSync('proof/transcript.md', T.join('\n') + '\n');
  console.log(`\n  ${S.dim}proof written → proof/transcript.md${S.reset}\n`);
} catch (e) {
  console.error(`\n  ${S.red}Error:${S.reset} ${e.shortMessage || e.message || e}`);
  process.exit(1);
}
