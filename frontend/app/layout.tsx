import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OPNet DeFi — Vault & Lending',
  description: 'Modular DeFi protocol for PILL & MOTO tokens on Bitcoin via OPNet',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-grid min-h-screen">{children}</body>
    </html>
  );
}
