'use client';
import { JSONRpcProvider, getContract, BitcoinInterfaceAbi, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import { networks, Network } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';

const NETWORK: Network = networks.testnet;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://testnet.opnet.org';
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
  [VAULT]: process.env.NEXT_PUBLIC_VAULT_BTC_ADDRESS ?? VAULT,
  [LENDING]: process.env.NEXT_PUBLIC_LENDING_BTC_ADDRESS ?? LENDING,
};
export type TokenSymbol = keyof typeof TOKEN_ADDRESSES;
export const CONTRACT_ADDRESSES = { VAULT, LENDING };

// ── Address helpers ───────────────────────────────────────────────────────────

function hexToAddress(hexAddress: string): Address {
  // Remove 0x prefix, do NOT pad - contract toString() returns unpadded hex
  const hex = hexAddress.startsWith('0x') ? hexAddress.slice(2) : hexAddress;
  // Parse hex into bytes (right-aligned if odd length)
  const padded = hex.length % 2 === 1 ? '0' + hex : hex;
  const byteLen = padded.length / 2;
  const bytes = new Uint8Array(32);
  const offset = 32 - byteLen;
  for (let i = 0; i < byteLen; i++) {
    bytes[offset + i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (Address as any)(bytes);
}

function toVaultAddress(hexAddress: string): Address {
  return hexToAddress(hexAddress);
}

// ── Provider ──────────────────────────────────────────────────────────────────

let _provider: JSONRpcProvider | null = null;
function getProvider(): JSONRpcProvider {
  if (!_provider) {
    _provider = new JSONRpcProvider(RPC_URL, NETWORK);
  }
  return _provider;
}

// ── Wallet ────────────────────────────────────────────────────────────────────

interface OPWalletProvider {
  requestAccounts: () => Promise<string[]>;
  getAccounts: () => Promise<string[]>;
  signAndBroadcastInteraction: (args: Record<string, unknown>) => Promise<{ txid?: string; result?: string }[]>;
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
    const xOnlyHex = scriptHex.slice(4, 68); // 32 bytes
    const xOnlyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      xOnlyBytes[i] = parseInt(xOnlyHex.slice(i * 2, i * 2 + 2), 16);
    }
    // Reconstruct compressed 33-byte pubkey (assume even = 0x02)
    const compressed = new Uint8Array(33);
    compressed[0] = 0x02;
    compressed.set(xOnlyBytes, 1);
    // new Address(mldsaKey=32bytes, classicalKey=33bytes)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (Address as any)(xOnlyBytes, compressed);
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
  const hex = pubKeyHex.startsWith('0x') ? pubKeyHex.slice(2) : pubKeyHex;
  const xOnly = hex.slice(hex.length - 64).padStart(64, '0');
  const xOnlyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    xOnlyBytes[i] = parseInt(xOnly.slice(i * 2, i * 2 + 2), 16);
  }
  const compressed = new Uint8Array(33);
  compressed[0] = 0x02;
  compressed.set(xOnlyBytes, 1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addr = new (Address as any)(xOnlyBytes, compressed);
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
  { name: 'balanceOf',         type: BitcoinAbiTypes.Function, inputs: [{ name: 'owner',   type: ABIDataTypes.ADDRESS }],                                                         outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }] },
  { name: 'increaseAllowance', type: BitcoinAbiTypes.Function, inputs: [{ name: 'spender', type: ABIDataTypes.ADDRESS }, { name: 'amount', type: ABIDataTypes.UINT256 }], outputs: [] },
];

// ── Read helper ───────────────────────────────────────────────────────────────

async function readContract(address: string, abi: BitcoinInterfaceAbi, method: string, params: unknown[]): Promise<bigint> {
  try {
    const toAddress = TOKEN_BTC_ADDRESSES[address] ?? address;
    const c = getContract(toAddress, abi, getProvider(), NETWORK);
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

export async function getTokenBalance(token: string, userPubKey: Address): Promise<bigint> {
  return readContract(token, OP20_ABI, 'balanceOf', [userPubKey]);
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

  // Resolve opt1 address for wallet interaction
  const toAddress = TOKEN_BTC_ADDRESSES[address] ?? address;
  const c = getContract(toAddress, abi, getProvider(), NETWORK, sender);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encoded = await (c as any)[method](...params);
  const calldata: Buffer = Buffer.from(encoded?.calldata ?? encoded);

  // Get UTXOs and address from wallet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opnet = typeof window !== 'undefined' ? (window as any).opnet : null;
  const utxos = await opnet?.getBitcoinUtxos?.() ?? [];
  const accounts = await opnet?.getAccounts?.() ?? [];
  const from = accounts[0] ?? '';
  console.log('[writeContract] from:', from, 'to:', toAddress, 'utxos:', utxos.length);

  // contract must be exactly 32 bytes - use saltHash (indexed by opt1 address)
  // TOKEN_BTC_ADDRESSES maps hex→opt1, we need opt1→saltHash
  // The saltHash is the same as the hex address stored in env vars for vault/lending
  // For tokens, use their known 32-byte saltHash
  const SALT_HASHES: Record<string, string> = {
    [PILL]: '0x98b2e80d3a7d47c9e8f0b030c8266f4a4e9eb6eda71b2acc3521e82eeabf10b6',
    [MOTO]: '0x09543b861a9a02e6c1c3337b9380df2ce5b62af3c7732406a5b969478b1889e4',
    [VAULT]: process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS ?? VAULT,
    [LENDING]: process.env.NEXT_PUBLIC_LENDING_CONTRACT_ADDRESS ?? LENDING,
  };
  const contractHex = SALT_HASHES[address] ?? (address.startsWith('0x') ? address : '0x' + address);

  const interactionParams = {
    to: toAddress,
    contract: contractHex,
    calldata,
    utxos,
    from,
    refundTo: from,
    feeRate: 10,
    priorityFee: 0n,
    gasSatFee: 0n,
  };

  console.log('[writeContract] interactionParams:', JSON.stringify({
    to: interactionParams.to,
    contract: interactionParams.contract,
    from: interactionParams.from,
    utxosLen: utxos.length,
    calldataLen: calldata.length,
  }));

  const results = await wallet.signAndBroadcastInteraction(interactionParams);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (results?.[0] as any)?.result ?? (results?.[1] as any)?.result ?? (results?.[0] as any)?.txid ?? '';
}

// ── Vault writes ──────────────────────────────────────────────────────────────

export const VAULT_ADDRESS = VAULT;
export { VAULT };

export async function approveToken(token: string, spender: string, amount: bigint, sender: Address): Promise<void> {
  const spenderAddr = hexToAddress(spender);
  console.log('[approveToken] token:', token, 'spender hex:', spender, 'spenderAddr.toString():', spenderAddr.toString?.());
  // Approve max amount to avoid re-approval issues
  const maxAmount = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  await writeContract(token, OP20_ABI, 'increaseAllowance', [spenderAddr, maxAmount], sender);
}

export async function vaultDeposit(token: string, amount: bigint, sender: Address): Promise<string> {
  return writeContract(VAULT, VAULT_ABI, 'deposit', [toVaultAddress(token), amount], sender);
}
export async function vaultWithdraw(token: string, shares: bigint, sender: Address): Promise<string> {
  return writeContract(VAULT, VAULT_ABI, 'withdraw', [toVaultAddress(token), shares], sender);
}

// ── Lending writes ────────────────────────────────────────────────────────────

export async function lendingDepositCollateral(token: string, amount: bigint, sender: Address): Promise<string> {
  await approveToken(token, LENDING, amount, sender);
  return writeContract(LENDING, LENDING_ABI, 'depositCollateral', [toVaultAddress(token), amount], sender);
}
export async function lendingBorrow(token: string, amount: bigint, sender: Address): Promise<string> {
  return writeContract(LENDING, LENDING_ABI, 'borrow', [toVaultAddress(token), amount], sender);
}
export async function lendingRepay(token: string, amount: bigint, sender: Address): Promise<string> {
  await approveToken(token, LENDING, amount, sender);
  return writeContract(LENDING, LENDING_ABI, 'repay', [toVaultAddress(token), amount], sender);
}
