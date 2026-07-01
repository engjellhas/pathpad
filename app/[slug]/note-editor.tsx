'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

type SaveState = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

function statusLabel(status: SaveState) {
  switch (status) {
    case 'loading':
      return 'Loading…';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Could not save';
    default:
      return '';
  }
}

export default function NoteEditor({ slug }: { slug: string }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const loadedRef = useRef(false);

  const storageKey = useMemo(() => 'private-notes-password', []);

  useEffect(() => {
    const savedPassword = window.localStorage.getItem(storageKey);
    if (savedPassword) {
      setPassword(savedPassword);
      void loadNote(savedPassword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadNote(activePassword = password) {
    setStatus('loading');
    setError('');

    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
        headers: { 'x-note-password': activePassword },
        cache: 'no-store',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (response.status === 401) {
          window.localStorage.removeItem(storageKey);
          throw new Error('Wrong password. Try again.');
        }
        if (response.status === 503) {
          throw new Error('Notes storage is not set up yet. Check your server configuration.');
        }
        throw new Error('Could not open this note. Please try again.');
      }

      const data = await response.json();
      setContent(data.content ?? '');
      setUnlocked(true);
      window.localStorage.setItem(storageKey, activePassword);
      loadedRef.current = true;
      setStatus('saved');
    } catch (err) {
      setUnlocked(false);
      loadedRef.current = false;
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  useEffect(() => {
    if (!unlocked || !loadedRef.current) return;

    setStatus('saving');

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            'x-note-password': password,
          },
          body: JSON.stringify({ content }),
        });

        if (!response.ok) throw new Error('Could not save note.');
        setStatus('saved');
        setError('');
      } catch {
        setStatus('error');
        setError('Could not save your changes. Check your connection and try typing again.');
      }
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [content, password, slug, unlocked]);

  function lockNote() {
    window.localStorage.removeItem(storageKey);
    setUnlocked(false);
    setContent('');
    setPassword('');
    setError('');
    setStatus('idle');
    loadedRef.current = false;
  }

  async function copyLink() {
    const url = `${window.location.origin}/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy link.');
    }
  }

  if (!unlocked) {
    return (
      <main className="wrap">
        <section className="card login">
          <Link className="back-link" href="/">
            ← Home
          </Link>
          <p className="eyebrow">/{slug}</p>
          <h1>Unlock this note</h1>
          <p className="muted">One password opens every path. Your browser remembers it on this device.</p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void loadNote();
            }}
          >
            <div className="password-field">
              <input
                autoFocus
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={status === 'loading'}
              />
              <button
                className="ghost"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <button type="submit" disabled={!password.trim() || status === 'loading'}>
              {status === 'loading' ? 'Opening…' : 'Open note'}
            </button>
          </form>

          {error ? <p className="error">{error}</p> : null}
        </section>
      </main>
    );
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <main className="editor">
      <header className="editor-header">
        <div>
          <p className="eyebrow">Private note</p>
          <h1>/{slug}</h1>
        </div>

        <div className="toolbar">
          <button className="ghost" type="button" onClick={() => void copyLink()}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button className="ghost" type="button" onClick={lockNote}>
            Lock
          </button>
          <div className={`status-pill ${status}`} aria-live="polite">
            <span className="status-dot" />
            {statusLabel(status)}
          </div>
        </div>
      </header>

      <textarea
        autoFocus
        spellCheck="false"
        placeholder="Start typing — your note saves automatically…"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        disabled={status === 'loading'}
      />

      <footer className="editor-footer">
        <span>{content.length} characters · {wordCount} words</span>
        <span>Autosaves as you type</span>
      </footer>

      {error ? <p className="error bottom">{error}</p> : null}
    </main>
  );
}
