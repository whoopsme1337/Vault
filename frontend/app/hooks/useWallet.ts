'use client';
import { useState, useEffect } from 'react';
import { connectWallet, getAddress } from '../lib/opnet';

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Retry getting address until wallet is ready
    let attempts = 0;
    const tryGetAddress = async () => {
      const addr = await getAddress();
      if (addr) {
        setAddress(addr);
      } else if (attempts < 10) {
        attempts++;
        setTimeout(tryGetAddress, 500);
      }
    };
    tryGetAddress();
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
