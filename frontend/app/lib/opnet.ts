'use client';
import { JSONRpcProvider, getContract, BitcoinInterfaceAbi, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import { networks, Network } from '@btc-vision/bitcoin';

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
  { name: 'deposit',         type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }, { name: 'amount', type: ABIDataTypes.UINT256 }] },
  { name: 'withdraw',        type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }, { name: 'shares', type: ABIDataTypes.UINT256 }] },
  { name: 'getUserShares',   type: BitcoinAbiTypes.Function, inputs: [{ name: 'user',  type: ABIDataTypes.ADDRESS }, { name: 'token',  type: ABIDataTypes.ADDRESS }] },
  { name: 'getExchangeRate', type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }] },
  { name: 'getTotalAssets',  type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }] },
  { name: 'getTotalShares',  type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }] },
];

const LENDING_ABI: BitcoinInterfaceAbi = [
  { name: 'depositCollateral', type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }, { name: 'amount', type: ABIDataTypes.UINT256 }] },
  { name: 'borrow',            type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }, { name: 'amount', type: ABIDataTypes.UINT256 }] },
  { name: 'repay',             type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }, { name: 'amount', type: ABIDataTypes.UINT256 }] },
  { name: 'getUserDebt',       type: BitcoinAbiTypes.Function, inputs: [{ name: 'user',  type: ABIDataTypes.ADDRESS }, { name: 'token',  type: ABIDataTypes.ADDRESS }] },
  { name: 'getUserCollateral', type: BitcoinAbiTypes.Function, inputs: [{ name: 'user',  type: ABIDataTypes.ADDRESS }, { name: 'token',  type: ABIDataTypes.ADDRESS }] },
];

const OP20_ABI: BitcoinInterfaceAbi = [
  { name: 'balanceOf', type: BitcoinAbiTypes.Function, inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }] },
];

// ── Read helper ───────────────────────────────────────────────────────────────

async function readContract(address: string, abi: BitcoinInterfaceAbi, method: string, params: unknown[]): Promise<bigint> {
  try {
    const c = getContract(address, abi, getProvider(), NETWORK);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (c as any)[method](...params);

    // If the result is a plain string/number/bigint (e.g. raw hex), convert directly
    if (result === null || result === undefined) return BigInt(0);
    if (typeof result === 'bigint') return result;
    if (typeof result === 'number') return BigInt(result);
    if (typeof result === 'string') return BigInt(result);

    // Otherwise dig into the result object
    const val = result?.properties?.value ?? result?.value ?? result?.decoded?.[0] ?? result;
    if (typeof val === 'bigint') return val;
    if (typeof val === 'string' || typeof val === 'number') return BigInt(String(val));
    return BigInt(0);
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
