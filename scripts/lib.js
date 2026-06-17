// Shared helpers for the Pharos pay-per-call settlement scripts.
// The voucher hashing/signing here mirrors the contract exactly:
//   voucherHash = keccak256(abi.encodePacked(address(this), channelId, cumulativeAmount))
//   signature   = personal_sign(voucherHash)   (ethers wallet.signMessage(getBytes(hash)))
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { ethers } from 'ethers';

const abi = JSON.parse(readFileSync(new URL('../references/abi.json', import.meta.url)));

function requireEnv(name) {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in ` +
      `(RPC, PRIVATE_KEY, CONTRACT_ADDRESS).`
    );
  }
  return v;
}

export function getProvider() {
  return new ethers.JsonRpcProvider(requireEnv('RPC'));
}

export function getSigner() {
  return new ethers.Wallet(requireEnv('PRIVATE_KEY'), getProvider());
}

export function getContract(signerOrProvider) {
  const runner = signerOrProvider ?? getProvider();
  return new ethers.Contract(requireEnv('CONTRACT_ADDRESS'), abi, runner);
}

/** The voucher hash a payer signs — must match the contract's voucherHash(). */
export function voucherHash(contractAddress, channelId, cumulativeAmountWei) {
  return ethers.solidityPackedKeccak256(
    ['address', 'uint256', 'uint256'],
    [contractAddress, channelId, cumulativeAmountWei]
  );
}

/** Sign a voucher off-chain (free, no tx). Returns a 65-byte signature. */
export async function signVoucher(signer, contractAddress, channelId, cumulativeAmountWei) {
  const hash = voucherHash(contractAddress, channelId, cumulativeAmountWei);
  return signer.signMessage(ethers.getBytes(hash));
}

export const toWei = (phrs) => ethers.parseEther(String(phrs));
export const fromWei = (wei) => ethers.formatEther(wei);

export const EXPLORER = 'https://atlantic.pharosscan.xyz';
export const txLink = (h) => `${EXPLORER}/tx/${h}`;
export const addressLink = (a) => `${EXPLORER}/address/${a}`;
