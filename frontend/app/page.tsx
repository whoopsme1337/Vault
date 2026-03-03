'use client';

import { useEffect, useState } from 'react';
import Header from './components/Header';
import TokenStatsCard from './components/TokenStatsCard';
import VaultActionPanel from './components/VaultActionPanel';
import LendingActionPanel from './components/LendingActionPanel';
import { useWallet } from './hooks/useWallet';
import { useVaultData } from './hooks/useVaultData';

type Tab = 'vault' | 'lending';

export default function Home() {
  const { address, connect, isConnecting } = useWallet();
  const { tokens, loading, refresh } = useVaultData(address);
  const [tab, setTab] = useState<Tab>('vault');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-10">
        {/* Hero */}
        <div className="mb-10 fade-up">
          <div className="flex items-center gap-2 mb-2">
            <span className="badge badge-green">OPNet Testnet</span>
            <span className="badge badge-orange">Bitcoin Layer</span>
          </div>
          <h1
            className="font-display font-800 text-white leading-none"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
          >
            DeFi on Bitcoin
          </h1>
          <p className="font-mono text-sm text-[rgba(226,232,240,0.5)] mt-2 max-w-lg">
            Deposit <span className="text-[#F7931A]">PILL</span> or{' '}
            <span className="text-[#00FFD1]">MOTO</span> into the vault for yield-bearing shares,
            or use them as collateral to borrow the other token.
          </p>
        </div>

        {/* Not connected */}
        {!address ? (
          <div
            className="card p-12 text-center fade-up"
            style={{ animationDelay: '0.1s' }}
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#F7931A] to-[#00FFD1] mx-auto mb-5 flex items-center justify-center text-2xl">
              ₿
            </div>
            <h2 className="font-display font-700 text-white text-xl mb-2">
              Connect Your OP Wallet
            </h2>
            <p className="font-mono text-sm text-[rgba(226,232,240,0.4)] mb-6 max-w-sm mx-auto">
              Install the OP Wallet browser extension and connect to access the vault and lending protocol.
            </p>
            <button
              className="btn-primary mx-auto"
              onClick={connect}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
            <p className="font-mono text-[11px] text-[rgba(226,232,240,0.25)] mt-4">
              Get OP Wallet at{' '}
              <a
                href="https://opnet.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00FFD1] hover:underline"
              >
                opnet.org
              </a>
            </p>
          </div>
        ) : (
          <>
            {/* Token stats row */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-700 text-white">Your Positions</h2>
                <button
                  onClick={refresh}
                  disabled={loading}
                  className="font-mono text-[11px] text-[rgba(0,255,209,0.6)] hover:text-[#00FFD1] transition-colors flex items-center gap-1.5"
                >
                  {loading ? <span className="spinner !w-3 !h-3" /> : '↻'}
                  Refresh
                </button>
              </div>

              {loading && tokens.length === 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[0, 1].map((i) => (
                    <div
                      key={i}
                      className="card p-5 h-44 animate-pulse"
                      style={{ animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {tokens.map((t) => (
                    <TokenStatsCard key={t.symbol} token={t} />
                  ))}
                </div>
              )}
            </div>

            {/* Tab selector */}
            <div className="flex gap-2 mb-6">
              {(['vault', 'lending'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`btn-secondary capitalize flex-1 ${tab === t ? 'tab-active' : ''}`}
                >
                  {t === 'vault' ? '🔒 Vault' : '💰 Lending'}
                </button>
              ))}
            </div>

            {/* Action panels */}
            {tab === 'vault' ? (
              <VaultActionPanel tokens={tokens} onSuccess={refresh} />
            ) : (
              <LendingActionPanel onSuccess={refresh} />
            )}

            {/* Protocol addresses */}
            <div className="mt-10 card p-5 fade-up">
              <p className="font-mono text-[11px] text-[rgba(226,232,240,0.4)] uppercase tracking-widest mb-3">
                Protocol Addresses
              </p>
              <div className="space-y-2">
                {[
                  {
                    label: 'PILL Token',
                    addr: process.env.NEXT_PUBLIC_PILL_BTC_ADDRESS,
                    hex: process.env.NEXT_PUBLIC_PILL_ADDRESS,
                    color: '#F7931A',
                  },
                  {
                    label: 'MOTO Token',
                    addr: process.env.NEXT_PUBLIC_MOTO_BTC_ADDRESS,
                    hex: process.env.NEXT_PUBLIC_MOTO_ADDRESS,
                    color: '#00FFD1',
                  },
                  {
                    label: 'Vault Contract',
                    addr: process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS || '(not deployed)',
                    color: 'rgba(226,232,240,0.6)',
                  },
                  {
                    label: 'Lending Contract',
                    addr: process.env.NEXT_PUBLIC_LENDING_CONTRACT_ADDRESS || '(not deployed)',
                    color: 'rgba(226,232,240,0.6)',
                  },
                ].map(({ label, addr, hex, color }) => (
                  <div key={label} className="flex items-start gap-3">
                    <span
                      className="font-mono text-[10px] w-28 shrink-0 pt-0.5"
                      style={{ color: 'rgba(226,232,240,0.4)' }}
                    >
                      {label}
                    </span>
                    <div>
                      <span
                        className="font-mono text-[11px] break-all"
                        style={{ color }}
                      >
                        {addr}
                      </span>
                      {hex && (
                        <p className="font-mono text-[10px] text-[rgba(226,232,240,0.2)] break-all mt-0.5">
                          {hex}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-[rgba(0,255,209,0.06)] py-6 text-center">
        <p className="font-mono text-[11px] text-[rgba(226,232,240,0.2)]">
          OPNet DeFi · Built on Bitcoin · Testnet Only
        </p>
      </footer>
    </div>
  );
}
