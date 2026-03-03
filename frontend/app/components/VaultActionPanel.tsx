'use client';

import { useState, useCallback } from 'react';
import {
  vaultDeposit,
  vaultWithdraw,
  TOKEN_ADDRESSES,
  parseAmount,
  getAddress,
  getPublicKey,
} from '../lib/opnet';
import type { TokenInfo } from '../hooks/useVaultData';

type Mode = 'deposit' | 'withdraw';
type TokenSymbol = keyof typeof TOKEN_ADDRESSES;

interface Props {
  tokens?: TokenInfo[];
  onSuccess?: () => void;
}

export default function VaultActionPanel({ tokens = [], onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('deposit');
  const [token, setToken] = useState<TokenSymbol>('PILL');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tokenInfo = tokens.find((t) => t.symbol === token);
  const maxForMode =
    mode === 'deposit' ? tokenInfo?.walletBalance : tokenInfo?.userShares;

  const handleMax = () => {
    if (maxForMode && maxForMode !== '0') setAmount(maxForMode);
  };

  const handleSubmit = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setLoading(true);
    setError(null);
    setTxHash(null);
    try {
      const address = await getAddress();
      if (!address) throw new Error('Wallet not connected. Please connect first.');
      const pubKey = await getPublicKey(address);

      const tokenAddr = TOKEN_ADDRESSES[token];
      const rawAmount = parseAmount(amount, 8);

      let hash: string;
      if (mode === 'deposit') {
        hash = await vaultDeposit(tokenAddr, rawAmount, pubKey);
      } else {
        hash = await vaultWithdraw(tokenAddr, rawAmount, pubKey);
      }
      setTxHash(hash);
      setAmount('');
      onSuccess?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transaction failed');
    } finally {
      setLoading(false);
    }
  }, [mode, token, amount, onSuccess]);

  return (
    <div className="card p-6 fade-up">
      <h2 className="font-display font-700 text-white text-lg mb-5">Vault Actions</h2>

      {/* Mode tabs */}
      <div className="flex gap-2 mb-5">
        {(['deposit', 'withdraw'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null); setTxHash(null); setAmount(''); }}
            className={`flex-1 btn-secondary capitalize ${mode === m ? 'tab-active' : ''}`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Token select */}
      <div className="mb-4">
        <label className="font-mono text-[11px] text-[rgba(226,232,240,0.5)] uppercase tracking-widest block mb-1.5">
          Token
        </label>
        <div className="flex gap-2">
          {(Object.keys(TOKEN_ADDRESSES) as TokenSymbol[]).map((sym) => {
            const info = tokens.find((t) => t.symbol === sym);
            return (
              <button
                key={sym}
                onClick={() => { setToken(sym); setAmount(''); }}
                className={`flex-1 rounded-xl font-mono text-sm font-bold border transition-all py-2.5 px-3 ${
                  token === sym
                    ? sym === 'PILL'
                      ? 'bg-[rgba(247,147,26,0.12)] border-[rgba(247,147,26,0.5)] text-[#F7931A]'
                      : 'bg-[rgba(0,255,209,0.12)] border-[rgba(0,255,209,0.5)] text-[#00FFD1]'
                    : 'bg-transparent border-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.4)]'
                }`}
              >
                <span>{sym}</span>
                {info && (
                  <span className="block text-[10px] font-normal opacity-60 mt-0.5">
                    {mode === 'deposit' ? `${info.walletBalance} avail.` : `${info.userShares} shares`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Amount input */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <label className="font-mono text-[11px] text-[rgba(226,232,240,0.5)] uppercase tracking-widest">
            Amount
          </label>
          {maxForMode && maxForMode !== '0' && (
            <button
              onClick={handleMax}
              className="font-mono text-[10px] text-[rgba(0,255,209,0.6)] hover:text-[#00FFD1] transition-colors"
            >
              MAX: {maxForMode}
            </button>
          )}
        </div>
        <input
          className="input-field"
          type="number"
          min="0"
          step="0.00000001"
          placeholder="0.00000000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <p className="font-mono text-[10px] text-[rgba(226,232,240,0.3)] mt-1.5">
          {mode === 'deposit'
            ? `Deposit ${token} → receive vault shares`
            : `Burn vault shares → receive ${token}`}
        </p>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/30">
          <p className="font-mono text-xs text-red-400">{error}</p>
        </div>
      )}

      {txHash && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-[rgba(0,255,209,0.06)] border border-[rgba(0,255,209,0.2)]">
          <p className="font-mono text-[11px] text-[#00FFD1]">✓ TX Submitted</p>
          <p className="font-mono text-[10px] text-[rgba(0,255,209,0.6)] break-all mt-0.5">{txHash}</p>
        </div>
      )}

      <button className="btn-primary w-full" onClick={handleSubmit} disabled={loading}>
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="spinner !w-4 !h-4 !border-[#050810]/30 !border-t-[#050810]" />
            Sending…
          </span>
        ) : (
          `${mode === 'deposit' ? 'Deposit' : 'Withdraw'} ${token}`
        )}
      </button>
    </div>
  );
}
