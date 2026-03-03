'use client';

import { useWallet } from '../hooks/useWallet';

export default function Header() {
  const { address, isConnecting, error, connect, disconnect } = useWallet();

  const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

  return (
    <header className="w-full border-b border-[rgba(0,255,209,0.08)] bg-[rgba(5,8,16,0.85)] backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F7931A] to-[#C87019] flex items-center justify-center text-[#050810] font-bold text-sm">
            ₿
          </div>
          <div>
            <p className="font-display font-800 text-white text-sm tracking-wide leading-none">OPNET DEFI</p>
            <p className="font-mono text-[10px] text-[#00FFD1] opacity-70 mt-0.5">VAULT + LENDING</p>
          </div>
        </div>

        {/* Network badge */}
        <span className="badge badge-orange hidden sm:inline">
          {process.env.NEXT_PUBLIC_OPNET_NETWORK ?? 'testnet'}
        </span>

        {/* Wallet */}
        <div className="flex items-center gap-3">
          {error && (
            <span className="font-mono text-red-400 text-xs hidden md:block">{error}</span>
          )}
          {address ? (
            <div className="flex items-center gap-2">
              <span className="badge badge-green">{short(address)}</span>
              <button
                className="btn-secondary !py-2 !px-3 !text-[11px]"
                onClick={disconnect}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              className="btn-primary !py-2 !px-4"
              onClick={connect}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <span className="flex items-center gap-2">
                  <span className="spinner !w-4 !h-4" />
                  Connecting…
                </span>
              ) : (
                'Connect OP Wallet'
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
