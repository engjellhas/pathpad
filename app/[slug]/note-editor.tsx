'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type SaveState = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

export default function NoteEditor({ slug }: { slug: string }) {
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<SaveState>('idle');
  const [error, setError] = useState('');
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
        if (response.status === 401) throw new Error('Wrong password.');
        if (response.status === 503) {
          throw new Error(
            typeof data?.error === 'string'
              ? data.error
              : 'Storage not configured. Add Upstash Redis in your Vercel project.',
          );
        }
        throw new Error('Could not load note.');
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
      } catch {
        setStatus('error');
        setError('Could not save. Check password/storage env vars.');
      }
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [content, password, slug, unlocked]);

  if (!unlocked) {
    return (
      <main className="wrap">
        <section className="card login">
          <p className="eyebrow">/{slug}</p>
          <h1>Enter password</h1>
          <p className="muted">One password protects all note paths.</p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void loadNote();
            }}
          >
            <input
              autoFocus
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="submit">Open note</button>
          </form>

          {error ? <p className="error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="editor">
      <header>
        <div>
          <p className="eyebrow">Private note</p>
          <h1>/{slug}</h1>
        </div>

        <div className={`status ${status}`}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'loading' ? 'Loading…' : status === 'error' ? 'Error' : ''}
        </div>
      </header>

      <textarea
        autoFocus
        spellCheck="false"
        placeholder="Type anything here…"
        value={content}
        onChange={(event) => setContent(event.target.value)}
      />

      {error ? <p className="error bottom">{error}</p> : null}
    </main>
  );
}
