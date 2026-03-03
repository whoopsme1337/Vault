'use client';
import { useState, useEffect } from 'react';
import { connectWallet, getAddress } from '../lib/opnet';

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAddress().then(addr => { if (addr) setAddress(addr); });
  }, []);

  const connect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const addr = await connectWallet();
      setAddress(addr);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => setAddress(null);

  return { address, isConnecting, error, connect, disconnect };
}
