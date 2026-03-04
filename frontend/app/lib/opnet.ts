'use client';
import { JSONRpcProvider, getContract, BitcoinInterfaceAbi, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import { networks, Network } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';

const NETWORK: Network = networks.regtest;

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

// ── Address helpers ───────────────────────────────────────────────────────────

// Decode an opt1... bech32m address to an Address object
function decodeOpt1Address(opt1: string): Address {
  // bech32m charset
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const str = opt1.toLowerCase();
  const sepIdx = str.lastIndexOf('1');
  if (sepIdx < 1) throw new Error(`Invalid opt1 address: ${opt1}`);
  const data = str.slice(sepIdx + 1, -6); // strip hrp, separator, and 6-char checksum
  const words: number[] = [];
  for (const c of data) {
    const val = CHARSET.indexOf(c);
    if (val < 0) throw new Error(`Invalid bech32m char: ${c}`);
    words.push(val);
  }
  // Convert from 5-bit groups to 8-bit bytes (skip witness version byte)
  const version = words[0];
  const payload = words.slice(1);
  const bytes = new Uint8Array(Math.floor(payload.length * 5 / 8));
  let acc = 0, bits = 0, idx = 0;
  for (const val of payload) {
    acc = (acc << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes[idx++] = (acc >> bits) & 0xff;
    }
  }
  void version;
  return Address.wrap(bytes.slice(0, 32));
}

// Convert token hex address to Address object for vault/lending calls
function toVaultAddress(hexAddress: string): Address {
  const btcAddr = TOKEN_BTC_ADDRESSES[hexAddress];
  if (btcAddr) {
    return decodeOpt1Address(btcAddr);
  }
  // fallback: try as hex
  const hex = hexAddress.startsWith('0x') ? hexAddress.slice(2) : hexAddress;
  const bytes = new Uint8Array(32);
  const start = Math.max(0, hex.length - 64);
  const relevant = hex.slice(start).padStart(64, '0');
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(relevant.slice(i * 2, i * 2 + 2), 16);
  }
  return Address.wrap(bytes);
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

let _cachedPubKey: Address | null = null;

function pubkeyFromScriptHex(scriptHex: string): Address | null {
  // Taproot scriptPubKey = 5120 + 32 bytes x-only pubkey
  if (scriptHex.startsWith('5120') && scriptHex.length >= 68) {
    const xOnlyHex = scriptHex.slice(4, 68); // 32 bytes = 64 hex chars
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(xOnlyHex.slice(i * 2, i * 2 + 2), 16);
    }
    return Address.wrap(bytes);
  }
  return null;
}

export async function getPublicKey(address: string): Promise<Address> {
  if (_cachedPubKey) return _cachedPubKey;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opnet = typeof window !== 'undefined' ? (window as any).opnet : null;
    const utxos: any[] = await opnet?.getBitcoinUtxos?.();
    if (utxos?.length) {
      for (const utxo of utxos) {
        const scriptHex: string = utxo.scriptPubKey?.hex ?? '';
        const addr = pubkeyFromScriptHex(scriptHex);
        if (addr) {
          _cachedPubKey = addr;
          return addr;
        }
      }
    }
  } catch (e) {
    console.error('[getPublicKey] failed:', e);
  }

  throw new Error('PUBKEY_REQUIRED');
}

export function setCachedPublicKey(pubKeyHex: string): Address {
  // pubKeyHex = 0x02... (33 bytes compressed) or raw 32-byte hex
  const hex = pubKeyHex.startsWith('0x') ? pubKeyHex.slice(2) : pubKeyHex;
  // Use last 32 bytes (x-only part)
  const xOnly = hex.slice(hex.length - 64);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(xOnly.slice(i * 2, i * 2 + 2), 16);
  }
  const addr = Address.wrap(bytes);
  _cachedPubKey = addr;
  return addr;
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
  return readContract(token, OP20_ABI, 'balanceOf', [user]);
}

// ── Vault reads ───────────────────────────────────────────────────────────────

export async function getUserShares(userPubKey: Address, token: string): Promise<bigint> {
  return readContract(VAULT, VAULT_ABI, 'getUserShares', [userPubKey, toVaultAddress(token)]);
}
export async function getExchangeRate(token: string): Promise<bigint> {
  return readContract(VAULT, VAULT_ABI, 'getExchangeRate', [toVaultAddress(token)]);
}
export async function getTotalAssets(token: string): Promise<bigint> {
  return readContract(VAULT, VAULT_ABI, 'getTotalAssets', [toVaultAddress(token)]);
}
export async function getTotalShares(token: string): Promise<bigint> {
  return readContract(VAULT, VAULT_ABI, 'getTotalShares', [toVaultAddress(token)]);
}

// ── Lending reads ─────────────────────────────────────────────────────────────

export async function getUserDebt(userPubKey: Address, token: string): Promise<bigint> {
  return readContract(LENDING, LENDING_ABI, 'getUserDebt', [userPubKey, toVaultAddress(token)]);
}
export async function getUserCollateral(userPubKey: Address, token: string): Promise<bigint> {
  return readContract(LENDING, LENDING_ABI, 'getUserCollateral', [userPubKey, toVaultAddress(token)]);
}

// ── Write helper ──────────────────────────────────────────────────────────────

async function writeContract(address: string, abi: BitcoinInterfaceAbi, method: string, params: unknown[], sender?: Address): Promise<string> {
  const wallet = getWalletProvider();
  if (!wallet) throw new Error('OP Wallet not found');
  const c = getContract(address, abi, getProvider(), NETWORK, sender);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encoded = await (c as any)[method](...params);
  const calldata: Uint8Array = encoded?.calldata ?? encoded;
  const results = await wallet.signAndBroadcastInteraction({ to: address, calldata });
  return results?.[0]?.txid ?? '';
}

// ── Vault writes ──────────────────────────────────────────────────────────────

export async function vaultDeposit(token: string, amount: bigint, sender: Address): Promise<string> {
  return writeContract(VAULT, VAULT_ABI, 'deposit', [toVaultAddress(token), amount], sender);
}
export async function vaultWithdraw(token: string, shares: bigint, sender: Address): Promise<string> {
  return writeContract(VAULT, VAULT_ABI, 'withdraw', [toVaultAddress(token), shares], sender);
}

// ── Lending writes ────────────────────────────────────────────────────────────

export async function lendingDepositCollateral(token: string, amount: bigint, sender: Address): Promise<string> {
  return writeContract(LENDING, LENDING_ABI, 'depositCollateral', [toVaultAddress(token), amount], sender);
}
export async function lendingBorrow(token: string, amount: bigint, sender: Address): Promise<string> {
  return writeContract(LENDING, LENDING_ABI, 'borrow', [toVaultAddress(token), amount], sender);
}
export async function lendingRepay(token: string, amount: bigint, sender: Address): Promise<string> {
  return writeContract(LENDING, LENDING_ABI, 'repay', [toVaultAddress(token), amount], sender);
}
