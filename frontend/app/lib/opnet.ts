'use client';
import { JSONRpcProvider, getContract } from 'opnet';
import { networks, Network } from '@btc-vision/bitcoin';
import { BitcoinInterfaceAbi } from 'opnet/browser/abi/interfaces/BitcoinInterfaceAbi.js';

const NETWORK: Network = networks.testnet;

const PILL    = process.env.NEXT_PUBLIC_PILL_ADDRESS!;
const MOTO    = process.env.NEXT_PUBLIC_MOTO_ADDRESS!;
const VAULT   = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS ?? '';
const LENDING = process.env.NEXT_PUBLIC_LENDING_CONTRACT_ADDRESS ?? '';

export const TOKEN_ADDRESSES = { PILL, MOTO } as const;
export type TokenSymbol = keyof typeof TOKEN_ADDRESSES;
export const CONTRACT_ADDRESSES = { VAULT, LENDING };

// ── Provider ──────────────────────────────────────────────────────────────────

let _provider: JSONRpcProvider | null = null;
function getProvider(): JSONRpcProvider {
  if (!_provider) {
    _provider = new JSONRpcProvider('https://testnet.opnet.org', NETWORK);
  }
  return _provider;
}

// ── Wallet ────────────────────────────────────────────────────────────────────

interface OPWalletProvider {
  requestAccounts: () => Promise<string[]>;
  getAccounts: () => Promise<string[]>;
  signAndBroadcastInteraction: (args: { to: string; calldata: Uint8Array }) => Promise<{ txid: string }[]>;
}

export function getWalletProvider(): OPWalletProvider | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { opnet?: OPWalletProvider }).opnet ?? null;
}

export async function connectWallet(): Promise<string> {
  const wallet = getWalletProvider();
  if (!wallet) throw new Error('OP Wallet not found. Please install the extension.');
  const accounts = await wallet.requestAccounts();
  if (!accounts?.length) throw new Error('No accounts returned.');
  return accounts[0];
}

export async function getAddress(): Promise<string | null> {
  const wallet = getWalletProvider();
  if (!wallet) return null;
  try {
    const accounts = await wallet.getAccounts();
    return accounts?.[0] ?? null;
  } catch { return null; }
}

// ── Utils ─────────────────────────────────────────────────────────────────────

export function parseAmount(amount: string, decimals = 8): bigint {
  const [whole, frac = ''] = amount.split('.');
  return BigInt(whole + frac.padEnd(decimals, '0').slice(0, decimals));
}

export function formatAmount(raw: bigint, decimals = 8): string {
  if (raw === BigInt(0)) return '0';
  const s = raw.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, -decimals) || '0';
  const frac = s.slice(-decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

// ── ABIs ──────────────────────────────────────────────────────────────────────

const VAULT_ABI: BitcoinInterfaceAbi = [
  { name: 'deposit',         inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  { name: 'withdraw',        inputs: [{ name: 'token', type: 'address' }, { name: 'shares', type: 'uint256' }] },
  { name: 'getUserShares',   inputs: [{ name: 'user',  type: 'address' }, { name: 'token',  type: 'address' }] },
  { name: 'getExchangeRate', inputs: [{ name: 'token', type: 'address' }] },
  { name: 'getTotalAssets',  inputs: [{ name: 'token', type: 'address' }] },
  { name: 'getTotalShares',  inputs: [{ name: 'token', type: 'address' }] },
];

const LENDING_ABI: BitcoinInterfaceAbi = [
  { name: 'depositCollateral', inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  { name: 'borrow',            inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  { name: 'repay',             inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  { name: 'getUserDebt',       inputs: [{ name: 'user',  type: 'address' }, { name: 'token',  type: 'address' }] },
  { name: 'getUserCollateral', inputs: [{ name: 'user',  type: 'address' }, { name: 'token',  type: 'address' }] },
];

const OP20_ABI: BitcoinInterfaceAbi = [
  { name: 'balanceOf', inputs: [{ name: 'owner', type: 'address' }] },
];

// ── Read helper ───────────────────────────────────────────────────────────────

async function readContract(address: string, abi: BitcoinInterfaceAbi, method: string, params: unknown[]): Promise<bigint> {
  try {
    const c = getContract(address, abi, getProvider(), NETWORK);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (c as any)[method](...params);
    const val = result?.properties?.value ?? result?.value ?? result?.decoded?.[0] ?? result;
    return BigInt(String(val ?? 0));
  } catch (e) {
    console.error(`readContract ${method}:`, e);
    return BigInt(0);
  }
}

// ── Token ─────────────────────────────────────────────────────────────────────

export async function getTokenBalance(token: string, user: string): Promise<bigint> {
  return readContract(token, OP20_ABI, 'balanceOf', [user]);
}

// ── Vault reads ───────────────────────────────────────────────────────────────

export async function getUserShares(user: string, token: string): Promise<bigint> {
  return readContract(VAULT, VAULT_ABI, 'getUserShares', [user, token]);
}
export async function getExchangeRate(token: string): Promise<bigint> {
  return readContract(VAULT, VAULT_ABI, 'getExchangeRate', [token]);
}
export async function getTotalAssets(token: string): Promise<bigint> {
  return readContract(VAULT, VAULT_ABI, 'getTotalAssets', [token]);
}
export async function getTotalShares(token: string): Promise<bigint> {
  return readContract(VAULT, VAULT_ABI, 'getTotalShares', [token]);
}

// ── Lending reads ─────────────────────────────────────────────────────────────

export async function getUserDebt(user: string, token: string): Promise<bigint> {
  return readContract(LENDING, LENDING_ABI, 'getUserDebt', [user, token]);
}
export async function getUserCollateral(user: string, token: string): Promise<bigint> {
  return readContract(LENDING, LENDING_ABI, 'getUserCollateral', [user, token]);
}

// ── Write helper ──────────────────────────────────────────────────────────────

async function writeContract(address: string, abi: BitcoinInterfaceAbi, method: string, params: unknown[]): Promise<string> {
  const wallet = getWalletProvider();
  if (!wallet) throw new Error('OP Wallet not found');
  const c = getContract(address, abi, getProvider(), NETWORK);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encoded = await (c as any)[method](...params);
  const calldata: Uint8Array = encoded?.calldata ?? encoded;
  const results = await wallet.signAndBroadcastInteraction({ to: address, calldata });
  return results?.[0]?.txid ?? '';
}

// ── Vault writes ──────────────────────────────────────────────────────────────

export async function vaultDeposit(token: string, amount: bigint): Promise<string> {
  return writeContract(VAULT, VAULT_ABI, 'deposit', [token, amount]);
}
export async function vaultWithdraw(token: string, shares: bigint): Promise<string> {
  return writeContract(VAULT, VAULT_ABI, 'withdraw', [token, shares]);
}

// ── Lending writes ────────────────────────────────────────────────────────────

export async function lendingDepositCollateral(token: string, amount: bigint): Promise<string> {
  return writeContract(LENDING, LENDING_ABI, 'depositCollateral', [token, amount]);
}
export async function lendingBorrow(token: string, amount: bigint): Promise<string> {
  return writeContract(LENDING, LENDING_ABI, 'borrow', [token, amount]);
}
export async function lendingRepay(token: string, amount: bigint): Promise<string> {
  return writeContract(LENDING, LENDING_ABI, 'repay', [token, amount]);
}
