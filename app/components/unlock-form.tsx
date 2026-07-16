'use client';

import { useState } from 'react';
import { useVault } from '@/lib/vault';

type Props = {
  title?: string;
  subtitle?: string;
  mode?: 'login' | 'vault';
  onDone?: () => void;
};

export default function UnlockForm({
  title = 'Unlock Pathpad',
  subtitle = 'One password opens every path. A secure session cookie keeps you signed in — the password never stays in localStorage.',
  mode = 'login',
  onDone,
}: Props) {
  const { login, unlockVault } = useVault();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'vault') await unlockVault(password);
      else await login(password);
      setPassword('');
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <p className="eyebrow">Pathpad</p>
      <h1>{title}</h1>
      <p className="muted">{subtitle}</p>

      <div className="password-field" style={{ marginTop: 24 }}>
        <input
          autoFocus
          type={showPassword ? 'text' : 'password'}
          placeholder="Master password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
          autoComplete="current-password"
        />
        <button
          className="ghost"
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? 'Hide' : 'Show'}
        </button>
      </div>
      <button type="submit" disabled={!password.trim() || loading} style={{ marginTop: 10 }}>
        {loading ? 'Unlocking…' : 'Unlock'}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}
