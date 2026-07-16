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
  clearKeyFromSession,
  deriveMasterKey,
  exportKey,
  importKey,
  loadKeyFromSession,
  saveKeyToSession,
} from '@/lib/crypto';

type VaultState = {
  ready: boolean;
  authed: boolean;
  hasKey: boolean;
  masterKey: CryptoKey | null;
  login: (password: string) => Promise<void>;
  unlockVault: (password: string) => Promise<void>;
  logout: () => Promise<void>;
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
      await refreshAuth();
      const stored = loadKeyFromSession();
      if (stored) {
        try {
          const key = await importKey(stored);
          if (!cancelled) setMasterKey(key);
        } catch {
          clearKeyFromSession();
        }
      }
      if (!cancelled) setReady(true);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [refreshAuth]);

  const setKeyFromPassword = useCallback(async (password: string) => {
    const key = await deriveMasterKey(password);
    const exported = await exportKey(key);
    saveKeyToSession(exported);
    setMasterKey(key);
  }, []);

  const login = useCallback(
    async (password: string) => {
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
            data?.error ||
              `Too many attempts. Try again in ${data?.retryAfter ?? 60}s.`
          );
        }
        throw new Error(data?.error || 'Wrong password.');
      }

      await setKeyFromPassword(password);
      setAuthed(true);
    },
    [setKeyFromPassword]
  );

  const unlockVault = useCallback(
    async (password: string) => {
      // Session may already exist; only re-derive the encryption key.
      if (!authed) {
        await login(password);
        return;
      }
      await setKeyFromPassword(password);
    },
    [authed, login, setKeyFromPassword]
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearKeyFromSession();
    setMasterKey(null);
    setAuthed(false);
  }, []);

  const value = useMemo<VaultState>(
    () => ({
      ready,
      authed,
      hasKey: masterKey != null,
      masterKey,
      login,
      unlockVault,
      logout,
      refreshAuth,
    }),
    [ready, authed, masterKey, login, unlockVault, logout, refreshAuth]
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used within VaultProvider');
  return ctx;
}
