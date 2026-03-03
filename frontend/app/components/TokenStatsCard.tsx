'use client';

import type { TokenInfo } from '../hooks/useVaultData';

interface Props {
  token: TokenInfo;
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] text-[rgba(226,232,240,0.4)] uppercase tracking-widest">
        {label}
      </span>
      <span
        className="font-mono text-sm"
        style={{ color: highlight ? 'white' : 'rgba(226,232,240,0.75)' }}
      >
        {value}
      </span>
    </div>
  );
}

export default function TokenStatsCard({ token }: Props) {
  const accentColor = token.symbol === 'PILL' ? '#F7931A' : '#00FFD1';
  const cardBg = token.symbol === 'PILL'
    ? 'rgba(247,147,26,0.05)'
    : 'rgba(0,255,209,0.05)';

  const hasBalance = token.walletBalanceRaw > 0n;
  const hasShares = token.userShares !== '0';
  const hasDebt = token.userDebt !== '0';

  return (
    <div
      className="card p-5 fade-up flex flex-col gap-4"
      style={{ borderColor: `${accentColor}22`, background: cardBg }}
    >
      {/* Token header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
            style={{ background: accentColor, color: '#050810' }}
          >
            {token.symbol[0]}
          </div>
          <div>
            <p className="font-display font-700 text-white leading-none">{token.symbol}</p>
            <p className="font-mono text-[10px] text-[rgba(226,232,240,0.3)] mt-0.5 truncate max-w-[140px]">
              {token.address.slice(0, 14)}…
            </p>
          </div>
        </div>
        <span
          className="badge"
          style={{
            background: `${accentColor}15`,
            color: accentColor,
            border: `1px solid ${accentColor}40`,
          }}
        >
          OP_20
        </span>
      </div>

      {/* WALLET BALANCE — hero stat */}
      <div
        className="rounded-xl px-4 py-3"
        style={{
          background: `${accentColor}10`,
          border: `1px solid ${accentColor}25`,
        }}
      >
        <p
          className="font-mono text-[10px] uppercase tracking-widest mb-1"
          style={{ color: `${accentColor}99` }}
        >
          Wallet Balance
        </p>
        <div className="flex items-baseline gap-2">
          <span
            className="font-mono text-2xl font-bold leading-none"
            style={{ color: hasBalance ? accentColor : 'rgba(226,232,240,0.2)' }}
          >
            {token.walletBalance}
          </span>
          <span
            className="font-mono text-xs"
            style={{ color: `${accentColor}70` }}
          >
            {token.symbol}
          </span>
        </div>
      </div>

      {/* Vault stats */}
      <div>
        <p
          className="font-mono text-[10px] uppercase tracking-widest mb-2.5"
          style={{ color: accentColor }}
        >
          ◈ Vault
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <Stat label="Your Shares" value={token.userShares} highlight={hasShares} />
          <Stat label="Exchange Rate" value={token.exchangeRate} />
          <Stat label="Total Assets" value={token.totalAssets} />
          <Stat label="Total Shares" value={token.totalShares} />
        </div>
      </div>

      {/* Lending stats */}
      <div style={{ borderTop: `1px solid ${accentColor}12`, paddingTop: '12px' }}>
        <p
          className="font-mono text-[10px] uppercase tracking-widest mb-2.5"
          style={{ color: accentColor }}
        >
          ◈ Lending
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <Stat label="Your Debt" value={token.userDebt} highlight={hasDebt} />
          <Stat label="Collateral" value={token.userCollateral} />
        </div>
        {hasDebt && (
          <p className="font-mono text-[10px] mt-2 text-red-400/60">
            ⚠ Outstanding debt — repay to avoid liquidation
          </p>
        )}
      </div>
    </div>
  );
}
