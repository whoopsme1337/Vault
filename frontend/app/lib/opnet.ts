'use client';
import { JSONRpcProvider, getContract, BitcoinInterfaceAbi, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import { networks, Network } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';

const NETWORK: Network = networks.testnet;

const PILL    = process.env.NEXT_PUBLIC_PILL_ADDRESS!;
const MOTO    = process.env.NEXT_PUBLIC_MOTO_ADDRESS!;
const PILL_BTC = process.env.NEXT_PUBLIC_PILL_BTC_ADDRESS!;
const MOTO_BTC = process.env.NEXT_PUBLIC_MOTO_BTC_ADDRESS!;
const VAULT   = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS ?? '';
const LENDING = process.env.NEXT_PUBLIC_LENDING_CONTRACT_ADDRESS ?? '';

export const TOKEN_ADDRESSES = { PILL, MOTO } as const;
export const TOKEN_BTC_ADDRESSES: Record<string, string> = {
  [PILL]: PILL_BTC,
  [MOTO]: MOTO_BTC,
};
export type TokenSymbol = keyof typeof TOKEN_ADDRESSES;
export const CONTRACT_ADDRESSES = { VAULT, LENDING };

// Vault/Lending contracts expect opt1... bech32 addresses for tokens
function toVaultTokenAddress(hexAddress: string): string {
  return TOKEN_BTC_ADDRESSES[hexAddress] ?? hexAddress;
}

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

// ── Public Key Resolution ─────────────────────────────────────────────────────

let _cachedPubKey: string | null = null;

export async function getPublicKey(address: string): Promise<string> {
  if (_cachedPubKey) return _cachedPubKey;
  try {
    const info = await getProvider().getPublicKeyInfo(address, false);
    // getPublicKeyInfo returns an Address — toHex() gives the 0x02... public key
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pubKey: string = (info as any)?.toHex?.() ?? info?.toString?.() ?? String(info);
    if (!pubKey) throw new Error('No public key returned for address');
    _cachedPubKey = pubKey;
    return pubKey;
  } catch (e) {
    throw new Error(
      `Could not resolve public key for ${address}. ` +
      `Please provide your public key manually (e.g. 0x02...).`
    );
  }
}

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
  { name: 'deposit',         type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }, { name: 'amount', type: ABIDataTypes.UINT256 }], outputs: [] },
  { name: 'withdraw',        type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }, { name: 'shares', type: ABIDataTypes.UINT256 }], outputs: [] },
  { name: 'getUserShares',   type: BitcoinAbiTypes.Function, inputs: [{ name: 'user',  type: ABIDataTypes.ADDRESS }, { name: 'token',  type: ABIDataTypes.ADDRESS }], outputs: [{ name: 'shares',       type: ABIDataTypes.UINT256 }] },
  { name: 'getExchangeRate', type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],                                                  outputs: [{ name: 'exchangeRate', type: ABIDataTypes.UINT256 }] },
  { name: 'getTotalAssets',  type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],                                                  outputs: [{ name: 'totalAssets',  type: ABIDataTypes.UINT256 }] },
  { name: 'getTotalShares',  type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],                                                  outputs: [{ name: 'totalShares',  type: ABIDataTypes.UINT256 }] },
];

const LENDING_ABI: BitcoinInterfaceAbi = [
  { name: 'depositCollateral', type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }, { name: 'amount', type: ABIDataTypes.UINT256 }], outputs: [] },
  { name: 'borrow',            type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }, { name: 'amount', type: ABIDataTypes.UINT256 }], outputs: [] },
  { name: 'repay',             type: BitcoinAbiTypes.Function, inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }, { name: 'amount', type: ABIDataTypes.UINT256 }], outputs: [] },
  { name: 'getUserDebt',       type: BitcoinAbiTypes.Function, inputs: [{ name: 'user',  type: ABIDataTypes.ADDRESS }, { name: 'token',  type: ABIDataTypes.ADDRESS }], outputs: [{ name: 'debt',       type: ABIDataTypes.UINT256 }] },
  { name: 'getUserCollateral', type: BitcoinAbiTypes.Function, inputs: [{ name: 'user',  type: ABIDataTypes.ADDRESS }, { name: 'token',  type: ABIDataTypes.ADDRESS }], outputs: [{ name: 'collateral', type: ABIDataTypes.UINT256 }] },
];

const OP20_ABI: BitcoinInterfaceAbi = [
  { name: 'balanceOf', type: BitcoinAbiTypes.Function, inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }], outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }] },
];

// ── Read helper ───────────────────────────────────────────────────────────────

async function readContract(address: string, abi: BitcoinInterfaceAbi, method: string, params: unknown[]): Promise<bigint> {
  try {
    const c = getContract(address, abi, getProvider(), NETWORK);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (c as any)[method](...params);

    if (result === null || result === undefined) return BigInt(0);
    if (typeof result === 'bigint') return result;
    if (typeof result === 'number') return BigInt(result);
    if (typeof result === 'string') return BigInt(result);

    // opnet returns decoded values in result.properties as a Map or object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = result?.properties as any;
    if (props) {
      // Try Map first
      if (typeof props.values === 'function') {
        const first = [...props.values()][0];
        if (first !== undefined) return BigInt(String(first));
      }
      // Try plain object
      const firstVal = Object.values(props)[0];
      if (firstVal !== undefined) return BigInt(String(firstVal));
    }

    const val = result?.value ?? result?.decoded?.[0];
    if (val !== undefined) return BigInt(String(val));
    return BigInt(0);
  } catch (e) {
    console.error(`readContract ${method}:`, e);
    return BigInt(0);
  }
}

// ── Token ─────────────────────────────────────────────────────────────────────

export async function getTokenBalance(token: string, user: string): Promise<bigint> {
  return readContract(token, OP20_ABI, 'balanceOf', [Address.fromString(user)]);
}

// ── Vault reads ───────────────────────────────────────────────────────────────

// user must be a public key hex string e.g. 0x02...
export async function getUserShares(userPubKey: string, token: string): Promise<bigint> {
  return readContract(VAULT, VAULT_ABI, 'getUserShares', [Address.fromString(userPubKey), Address.fromString(toVaultTokenAddress(token))]);
}
export async function getExchangeRate(token: string): Promise<bigint> {
  return readContract(VAULT, VAULT_ABI, 'getExchangeRate', [Address.fromString(toVaultTokenAddress(token))]);
}
export async function getTotalAssets(token: string): Promise<bigint> {
  return readContract(VAULT, VAULT_ABI, 'getTotalAssets', [Address.fromString(toVaultTokenAddress(token))]);
}
export async function getTotalShares(token: string): Promise<bigint> {
  return readContract(VAULT, VAULT_ABI, 'getTotalShares', [Address.fromString(toVaultTokenAddress(token))]);
}

// ── Lending reads ─────────────────────────────────────────────────────────────

// user must be a public key hex string e.g. 0x02...
export async function getUserDebt(userPubKey: string, token: string): Promise<bigint> {
  return readContract(LENDING, LENDING_ABI, 'getUserDebt', [Address.fromString(userPubKey), Address.fromString(toVaultTokenAddress(token))]);
}
export async function getUserCollateral(userPubKey: string, token: string): Promise<bigint> {
  return readContract(LENDING, LENDING_ABI, 'getUserCollateral', [Address.fromString(userPubKey), Address.fromString(toVaultTokenAddress(token))]);
}

// ── Write helper ──────────────────────────────────────────────────────────────

async function writeContract(address: string, abi: BitcoinInterfaceAbi, method: string, params: unknown[], senderPubKey?: string): Promise<string> {
  const wallet = getWalletProvider();
  if (!wallet) throw new Error('OP Wallet not found');
  const sender = senderPubKey ? Address.fromString(senderPubKey) : undefined;
  const c = getContract(address, abi, getProvider(), NETWORK, sender);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encoded = await (c as any)[method](...params);
  const calldata: Uint8Array = encoded?.calldata ?? encoded;
  const results = await wallet.signAndBroadcastInteraction({ to: address, calldata });
  return results?.[0]?.txid ?? '';
}

// ── Vault writes ──────────────────────────────────────────────────────────────

export async function vaultDeposit(token: string, amount: bigint, senderPubKey: string): Promise<string> {
  return writeContract(VAULT, VAULT_ABI, 'deposit', [Address.fromString(toVaultTokenAddress(token)), amount], senderPubKey);
}
export async function vaultWithdraw(token: string, shares: bigint, senderPubKey: string): Promise<string> {
  return writeContract(VAULT, VAULT_ABI, 'withdraw', [Address.fromString(toVaultTokenAddress(token)), shares], senderPubKey);
}

// ── Lending writes ────────────────────────────────────────────────────────────

export async function lendingDepositCollateral(token: string, amount: bigint, senderPubKey: string): Promise<string> {
  return writeContract(LENDING, LENDING_ABI, 'depositCollateral', [Address.fromString(toVaultTokenAddress(token)), amount], senderPubKey);
}
export async function lendingBorrow(token: string, amount: bigint, senderPubKey: string): Promise<string> {
  return writeContract(LENDING, LENDING_ABI, 'borrow', [Address.fromString(toVaultTokenAddress(token)), amount], senderPubKey);
}
export async function lendingRepay(token: string, amount: bigint, senderPubKey: string): Promise<string> {
  return writeContract(LENDING, LENDING_ABI, 'repay', [Address.fromString(toVaultTokenAddress(token)), amount], senderPubKey);
}
