'use client';

import { useState } from 'react';
import { useVault } from '@/lib/vault';

type Props = {
  title?: string;
  subtitle?: string;
  onDone?: () => void;
  compact?: boolean;
};

export default function UnlockForm({
  title = 'Enter password',
  subtitle = 'Same password on every device. Stay signed in until you lock.',
  onDone,
  compact = false,
}: Props) {
  const { unlock } = useVault();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await unlock(password);
      setPassword('');
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wrong password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={`login ${compact ? 'compact' : ''}`} onSubmit={submit}>
      {!compact ? (
        <>
          <p className="eyebrow">Pathpad</p>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </>
      ) : null}

      <div className="password-field" style={compact ? undefined : { marginTop: 24 }}>
        <input
          autoFocus
          type={showPassword ? 'text' : 'password'}
          placeholder="Password"
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
        {loading ? 'Opening…' : 'Continue'}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}
