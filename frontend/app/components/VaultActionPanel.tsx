'use client';

import { useState, useCallback } from 'react';
import {
  lendingDepositCollateral,
  lendingBorrow,
  lendingRepay,
  TOKEN_ADDRESSES,
  parseAmount,
} from '../lib/opnet';

type LendMode = 'collateral' | 'borrow' | 'repay';
type TokenSymbol = keyof typeof TOKEN_ADDRESSES;

interface Props {
  onSuccess?: () => void;
}

const MODE_LABELS: Record<LendMode, string> = {
  collateral: 'Deposit Collateral',
  borrow: 'Borrow',
  repay: 'Repay',
};

export default function LendingActionPanel({ onSuccess }: Props) {
  const [mode, setMode] = useState<LendMode>('collateral');
  const [token, setToken] = useState<TokenSymbol>('PILL');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setLoading(true);
    setError(null);
    setTxHash(null);
    try {
      const tokenAddr = TOKEN_ADDRESSES[token];
      const rawAmount = parseAmount(amount, 8);

      let hash: string;
      if (mode === 'collateral') {
        hash = await lendingDepositCollateral(tokenAddr, rawAmount);
      } else if (mode === 'borrow') {
        hash = await lendingBorrow(tokenAddr, rawAmount);
      } else {
        hash = await lendingRepay(tokenAddr, rawAmount);
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

  const modeDescription: Record<LendMode, string> = {
    collateral: `Deposit ${token} as collateral → borrow ${token === 'PILL' ? 'MOTO' : 'PILL'}`,
    borrow: `Borrow ${token} against ${token === 'PILL' ? 'MOTO' : 'PILL'} collateral (150% ratio)`,
    repay: `Repay outstanding ${token} debt with 5% APR interest`,
  };

  return (
    <div className="card p-6 fade-up" style={{ animationDelay: '0.1s' }}>
      <h2 className="font-display font-700 text-white text-lg mb-5">
        Lending
        <span className="ml-2 badge badge-orange text-[10px]">5% APR · 150% CR</span>
      </h2>

      {/* Mode tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {(Object.keys(MODE_LABELS) as LendMode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null); setTxHash(null); }}
            className={`flex-1 btn-secondary text-[11px] !py-2 ${mode === m ? 'tab-active' : ''}`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Token select */}
      <div className="mb-4">
        <label className="font-mono text-[11px] text-[rgba(226,232,240,0.5)] uppercase tracking-widest block mb-1.5">
          Token
        </label>
        <div className="flex gap-2">
          {(Object.keys(TOKEN_ADDRESSES) as TokenSymbol[]).map((sym) => (
            <button
              key={sym}
              onClick={() => setToken(sym)}
              className={`flex-1 py-2.5 rounded-xl font-mono text-sm font-bold border transition-all ${
                token === sym
                  ? sym === 'PILL'
                    ? 'bg-[rgba(247,147,26,0.12)] border-[rgba(247,147,26,0.5)] text-[#F7931A]'
                    : 'bg-[rgba(0,255,209,0.12)] border-[rgba(0,255,209,0.5)] text-[#00FFD1]'
                  : 'bg-transparent border-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.4)]'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div className="mb-5">
        <label className="font-mono text-[11px] text-[rgba(226,232,240,0.5)] uppercase tracking-widest block mb-1.5">
          Amount
        </label>
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
          {modeDescription[mode]}
        </p>
      </div>

      {/* Collateral ratio info */}
      {mode === 'borrow' && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-[rgba(247,147,26,0.05)] border border-[rgba(247,147,26,0.15)]">
          <p className="font-mono text-[10px] text-[rgba(247,147,26,0.8)]">
            ⚠ Maintain 150% collateral ratio to avoid liquidation risk
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/30">
          <p className="font-mono text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Tx hash */}
      {txHash && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-[rgba(0,255,209,0.06)] border border-[rgba(0,255,209,0.2)]">
          <p className="font-mono text-[11px] text-[#00FFD1]">✓ TX Submitted</p>
          <p className="font-mono text-[10px] text-[rgba(0,255,209,0.6)] break-all mt-0.5">
            {txHash}
          </p>
        </div>
      )}

      <button
        className="btn-primary w-full"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="spinner !w-4 !h-4 !border-[#050810]/30 !border-t-[#050810]" />
            Sending…
          </span>
        ) : (
          `${MODE_LABELS[mode]} ${token}`
        )}
      </button>
    </div>
  );
}
