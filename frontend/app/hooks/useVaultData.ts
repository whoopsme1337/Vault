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
  TOKEN_ADDRESSES,
  formatAmount,
} from '../lib/opnet';

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

  const fetchData = useCallback(async () => {
    if (!userAddress) return;
    setLoading(true);
    setError(null);
    try {
      const entries = Object.entries(TOKEN_ADDRESSES) as [string, string][];
      const results = await Promise.all(
        entries.map(async ([symbol, address]) => {
          const [balance, shares, rate, assets, totalSh, debt, collateral] = await Promise.all([
            getTokenBalance(address, userAddress).catch(() => 0n),
            getUserShares(userAddress, address).catch(() => 0n),
            getExchangeRate(address).catch(() => 10n ** 18n),
            getTotalAssets(address).catch(() => 0n),
            getTotalShares(address).catch(() => 0n),
            getUserDebt(userAddress, address).catch(() => 0n),
            getUserCollateral(userAddress, address).catch(() => 0n),
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

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { tokens, loading, error, refresh: fetchData };
}
