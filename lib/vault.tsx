'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearKeyFromDevice,
  deriveMasterKey,
  exportKey,
  importKey,
  loadKeyFromDevice,
  saveKeyToDevice,
} from '@/lib/crypto';

type VaultState = {
  ready: boolean;
  /** Fully ready to read/write notes on this device. */
  unlocked: boolean;
  authed: boolean;
  hasKey: boolean;
  masterKey: CryptoKey | null;
  /** One-step unlock for everyday use. */
  unlock: (password: string) => Promise<void>;
  lock: () => Promise<void>;
  refreshAuth: () => Promise<void>;
};

const VaultContext = createContext<VaultState | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      setAuthed(Boolean(data?.ok));
    } catch {
      setAuthed(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      let key: CryptoKey | null = null;
      const stored = loadKeyFromDevice();
      if (stored) {
        try {
          key = await importKey(stored);
        } catch {
          clearKeyFromDevice();
        }
      }

      let sessionOk = false;
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        sessionOk = Boolean(data?.ok);
      } catch {
        sessionOk = false;
      }

      // Everyday use: only stay unlocked when both session cookie and device key exist.
      if (!sessionOk || !key) {
        if (!sessionOk) clearKeyFromDevice();
        key = sessionOk ? key : null;
      }

      if (!cancelled) {
        setAuthed(sessionOk);
        setMasterKey(key);
        setReady(true);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [refreshAuth]);

  const unlock = useCallback(async (password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    const data = (await res.json().catch(() => null)) as {
      error?: string;
      retryAfter?: number;
    } | null;

    if (!res.ok) {
      if (res.status === 429) {
        throw new Error(
          data?.error || `Too many attempts. Try again in ${data?.retryAfter ?? 60}s.`
        );
      }
      throw new Error(data?.error || 'Wrong password.');
    }

    const key = await deriveMasterKey(password);
    const exported = await exportKey(key);
    saveKeyToDevice(exported);
    setMasterKey(key);
    setAuthed(true);
  }, []);

  const lock = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearKeyFromDevice();
    setMasterKey(null);
    setAuthed(false);
  }, []);

  const unlocked = authed && masterKey != null;

  const value = useMemo<VaultState>(
    () => ({
      ready,
      unlocked,
      authed,
      hasKey: masterKey != null,
      masterKey,
      unlock,
      lock,
      refreshAuth,
    }),
    [ready, unlocked, authed, masterKey, unlock, lock, refreshAuth]
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used within VaultProvider');
  return ctx;
}
