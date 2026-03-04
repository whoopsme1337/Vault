'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getUserShares,
  getExchangeRate,
  getTotalAssets,
  getTotalShares,
  getUserDebt,
  getUserCollateral,
  getTokenBalance,
  getPublicKey,
  setCachedPublicKey,
  TOKEN_ADDRESSES,
  formatAmount,
} from '../lib/opnet';


import type { Address } from '@btc-vision/transaction';

export interface TokenInfo {
  symbol: string;
  address: string;
  // Wallet
  walletBalance: string;
  walletBalanceRaw: bigint;
  // Vault
  userShares: string;
  exchangeRate: string;
  totalAssets: string;
  totalShares: string;
  // Lending
  userDebt: string;
  userCollateral: string;
}

export function useVaultData(userAddress: string | null) {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pubkeyRequired, setPubkeyRequired] = useState(false);

  const fetchData = useCallback(async () => {
    if (!userAddress) return;
    setLoading(true);
    setError(null);
    try {
      // Resolve public key once for all calls that need it
      let pubKey: Address | null = null;
      try {
        pubKey = await getPublicKey(userAddress);
        setPubkeyRequired(false);
      } catch (e) {
        if (e instanceof Error && e.message === 'PUBKEY_REQUIRED') {
          setPubkeyRequired(true);
        } else {
          console.warn('Could not resolve public key — vault/lending data unavailable');
        }
      }

      const entries = Object.entries(TOKEN_ADDRESSES) as [string, string][];
      const results = await Promise.all(
        entries.map(async ([symbol, address]) => {
          const [balance, shares, rate, assets, totalSh, debt, collateral] = await Promise.all([
            getTokenBalance(address, userAddress).catch(() => BigInt(0)),
            pubKey ? getUserShares(pubKey, address).catch(() => BigInt(0)) : Promise.resolve(BigInt(0)),
            getExchangeRate(address).catch(() => BigInt(10) ** BigInt(18)),
            getTotalAssets(address).catch(() => BigInt(0)),
            getTotalShares(address).catch(() => BigInt(0)),
            pubKey ? getUserDebt(pubKey, address).catch(() => BigInt(0)) : Promise.resolve(BigInt(0)),
            pubKey ? getUserCollateral(pubKey, address).catch(() => BigInt(0)) : Promise.resolve(BigInt(0)),
          ]);
          return {
            symbol,
            address,
            walletBalance: formatAmount(balance),
            walletBalanceRaw: balance,
            userShares: formatAmount(shares),
            exchangeRate: formatAmount(rate),
            totalAssets: formatAmount(assets),
            totalShares: formatAmount(totalSh),
            userDebt: formatAmount(debt),
            userCollateral: formatAmount(collateral),
          };
        }),
      );
      setTokens(results);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch vault data');
    } finally {
      setLoading(false);
    }
  }, [userAddress]);

  const submitPublicKey = useCallback((pubKeyHex: string) => {
    try {
      setCachedPublicKey(pubKeyHex);
      setPubkeyRequired(false);
      fetchData();
    } catch {
      setError('Invalid public key format. Expected 0x02... or 0x03...');
    }
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { tokens, loading, error, refresh: fetchData, pubkeyRequired, submitPublicKey };
}
