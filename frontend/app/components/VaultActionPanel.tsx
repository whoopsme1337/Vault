'use client';

import { useState, useCallback } from 'react';
import {
  vaultDeposit,
  vaultWithdraw,
  approveToken,
  TOKEN_ADDRESSES,
  VAULT,
  parseAmount,
  getAddress,
  getPublicKey,
} from '../lib/opnet';
import type { TokenInfo } from '../hooks/useVaultData';

type Mode = 'deposit' | 'withdraw';
type Step = 'idle' | 'approved' | 'done';
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
  const [step, setStep] = useState<Step>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [approveTxHash, setApproveTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tokenInfo = tokens.find((t) => t.symbol === token);
  const maxForMode = mode === 'deposit' ? tokenInfo?.walletBalance : tokenInfo?.userShares;

  const reset = () => { setStep('idle'); setError(null); setTxHash(null); setApproveTxHash(null); };

  const handleMax = () => {
    if (maxForMode && maxForMode !== '0') setAmount(maxForMode);
  };

  const handleApprove = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) { setError('Enter a valid amount'); return; }
    setLoading(true); setError(null);
    try {
      const address = await getAddress();
      if (!address) throw new Error('Wallet not connected.');
      const pubKey = await getPublicKey(address);
      const tokenAddr = TOKEN_ADDRESSES[token];
      const rawAmount = parseAmount(amount, 8);
      const approveHash = await approveToken(tokenAddr, VAULT, rawAmount, pubKey);
      setApproveTxHash(approveHash || null);
      setStep('approved');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setLoading(false);
    }
  }, [token, amount]);

  const handleDeposit = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) { setError('Enter a valid amount'); return; }
    setLoading(true); setError(null);
    try {
      const address = await getAddress();
      if (!address) throw new Error('Wallet not connected.');
      const pubKey = await getPublicKey(address);
      const tokenAddr = TOKEN_ADDRESSES[token];
      const rawAmount = parseAmount(amount, 8);
      const hash = await vaultDeposit(tokenAddr, rawAmount, pubKey);
      setTxHash(hash);
      setAmount('');
      setStep('done');
      onSuccess?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Deposit failed');
    } finally {
      setLoading(false);
    }
  }, [token, amount, onSuccess]);

  const handleWithdraw = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) { setError('Enter a valid amount'); return; }
    setLoading(true); setError(null);
    try {
      const address = await getAddress();
      if (!address) throw new Error('Wallet not connected.');
      const pubKey = await getPublicKey(address);
      const tokenAddr = TOKEN_ADDRESSES[token];
      const rawAmount = parseAmount(amount, 8);
      const hash = await vaultWithdraw(tokenAddr, rawAmount, pubKey);
      setTxHash(hash);
      setAmount('');
      setStep('done');
      onSuccess?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Withdraw failed');
    } finally {
      setLoading(false);
    }
  }, [token, amount, onSuccess]);

  return (
    <div className="card p-6 fade-up">
      <h2 className="font-display font-700 text-white text-lg mb-5">Vault Actions</h2>

      {/* Mode tabs */}
      <div className="flex gap-2 mb-5">
        {(['deposit', 'withdraw'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); reset(); setAmount(''); }}
            className={`flex-1 btn-secondary capitalize ${mode === m ? 'tab-active' : ''}`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Token select */}
      <div className="mb-4">
        <label className="font-mono text-[11px] text-[rgba(226,232,240,0.5)] uppercase tracking-widest block mb-1.5">Token</label>
        <div className="flex gap-2">
          {(Object.keys(TOKEN_ADDRESSES) as TokenSymbol[]).map((sym) => {
            const info = tokens.find((t) => t.symbol === sym);
            return (
              <button
                key={sym}
                onClick={() => { setToken(sym); setAmount(''); reset(); }}
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
          <label className="font-mono text-[11px] text-[rgba(226,232,240,0.5)] uppercase tracking-widest">Amount</label>
          {maxForMode && maxForMode !== '0' && (
            <button onClick={handleMax} className="font-mono text-[10px] text-[rgba(0,255,209,0.6)] hover:text-[#00FFD1] transition-colors">
              MAX: {maxForMode}
            </button>
          )}
        </div>
        <input
          className="input-field"
          type="number" min="0" step="0.00000001" placeholder="0.00000000"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); reset(); }}
        />
        <p className="font-mono text-[10px] text-[rgba(226,232,240,0.3)] mt-1.5">
          {mode === 'deposit' ? `Deposit ${token} → receive vault shares` : `Burn vault shares → receive ${token}`}
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
          <a
            href={`https://opscan.org/transactions/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-[#F7931A] hover:text-[#ffaa44] transition-colors mt-1 block"
          >
            View on OPScan ↗
          </a>
        </div>
      )}

      {mode === 'deposit' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-5 h-5 rounded-full text-[10px] font-mono font-bold flex items-center justify-center border ${step !== 'idle' ? 'border-[rgba(0,255,209,0.6)] text-[#00FFD1] bg-[rgba(0,255,209,0.1)]' : 'border-[#F7931A] text-[#F7931A]'}`}>1</span>
            <span className="font-mono text-[11px] text-[rgba(255,255,255,0.4)]">Approve {token} spend</span>
            <span className="flex-1 h-px bg-[rgba(255,255,255,0.06)]" />
            <span className={`w-5 h-5 rounded-full text-[10px] font-mono font-bold flex items-center justify-center border ${step === 'approved' ? 'border-[#F7931A] text-[#F7931A]' : 'border-[rgba(255,255,255,0.12)] text-[rgba(255,255,255,0.2)]'}`}>2</span>
            <span className="font-mono text-[11px] text-[rgba(255,255,255,0.4)]">Deposit to vault</span>
          </div>

          <button className="btn-primary w-full" onClick={handleApprove} disabled={loading || step !== 'idle'}>
            {loading && step === 'idle' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner !w-4 !h-4 !border-[#050810]/30 !border-t-[#050810]" />
                Approving…
              </span>
            ) : step !== 'idle' ? '✓ Approved' : `Step 1: Approve ${token}`}
          </button>

          {step === 'approved' && (
            <div className="px-3 py-2 rounded-lg bg-[rgba(247,147,26,0.06)] border border-[rgba(247,147,26,0.2)]">
              <p className="font-mono text-[10px] text-[rgba(247,147,26,0.7)] text-center">
                ⏳ Wait ~30s for approval to confirm on-chain, then click Step 2
              </p>
              {approveTxHash && (
                <a
                  href={`https://opscan.org/transactions/${approveTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] text-[#F7931A] hover:text-[#ffaa44] transition-colors mt-1 block text-center"
                >
                  View Approve TX on OPScan ↗
                </a>
              )}
            </div>
          )}

          <button className="btn-primary w-full" onClick={handleDeposit} disabled={loading || step !== 'approved'} style={{ opacity: step !== 'approved' ? 0.4 : 1 }}>
            {loading && step === 'approved' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner !w-4 !h-4 !border-[#050810]/30 !border-t-[#050810]" />
                Depositing…
              </span>
            ) : `Step 2: Deposit ${token}`}
          </button>
        </div>
      ) : (
        <button className="btn-primary w-full" onClick={handleWithdraw} disabled={loading}>
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="spinner !w-4 !h-4 !border-[#050810]/30 !border-t-[#050810]" />
              Withdrawing…
            </span>
          ) : `Withdraw ${token}`}
        </button>
      )}
    </div>
  );
}
