'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  clearLocalRecents,
  formatRelativeTime,
  pushLocalRecent,
  randomSlug,
  readLocalRecents,
  safeSlug,
  type RecentNote,
} from '@/lib/notes';
import { useVault } from '@/lib/vault';

type NoteMeta = {
  slug: string;
  updatedAt: number;
};

export default function PathPicker() {
  const router = useRouter();
  const { ready, unlocked, lock } = useVault();
  const [path, setPath] = useState('');
  const [recents, setRecents] = useState<RecentNote[]>([]);
  const [notes, setNotes] = useState<NoteMeta[]>([]);

  useEffect(() => {
    setRecents(readLocalRecents());
  }, []);

  useEffect(() => {
    if (!unlocked) {
      setNotes([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/notes', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setNotes(Array.isArray(data.notes) ? data.notes : []);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  function openSlug(slug: string) {
    const clean = safeSlug(slug);
    if (!clean) return;
    pushLocalRecent(clean);
    router.push(`/${clean}`);
  }

  function goToNote(event: React.FormEvent) {
    event.preventDefault();
    openSlug(path.trim().replace(/^\/+/, ''));
  }

  function quickNote() {
    openSlug(randomSlug(6));
  }

  const chips =
    notes.length > 0
      ? notes.slice(0, 8).map((n) => ({ slug: n.slug, label: formatRelativeTime(n.updatedAt) }))
      : recents.slice(0, 8).map((n) => ({ slug: n.slug, label: 'recent' }));

  return (
    <div className="path-picker">
      <button className="quick-note" type="button" onClick={quickNote}>
        Quick note
        <span>New random path — copy the link to your phone</span>
      </button>

      <form className="path-form" onSubmit={goToNote}>
        <span className="path-prefix">/</span>
        <input
          autoFocus
          type="text"
          placeholder="or type a path — ideas, todo…"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit">Open</button>
      </form>

      {chips.length > 0 ? (
        <div className="recents">
          <div className="recents-header">
            <span className="examples-label">
              {notes.length > 0 ? 'Your notes' : 'Recent on this device'}
            </span>
            {notes.length === 0 && recents.length > 0 ? (
              <button
                className="text-btn"
                type="button"
                onClick={() => {
                  clearLocalRecents();
                  setRecents([]);
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="examples">
            {chips.map((item) => (
              <Link
                key={item.slug}
                className="example-chip recent-chip"
                href={`/${item.slug}`}
                onClick={() => pushLocalRecent(item.slug)}
              >
                /{item.slug}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="examples">
          <span className="examples-label">Examples</span>
          {['todo', 'ideas', 'links'].map((example) => (
            <Link key={example} className="example-chip" href={`/${example}`}>
              /{example}
            </Link>
          ))}
        </div>
      )}

      {ready ? (
        <p className="home-status">
          {unlocked ? (
            <>
              Unlocked on this device ·{' '}
              <button className="text-btn inline" type="button" onClick={() => void lock()}>
                Lock
              </button>
            </>
          ) : (
            'Password asked once when you open a note'
          )}
        </p>
      ) : null}
    </div>
  );
}
