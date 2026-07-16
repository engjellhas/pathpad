'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ThemeToggle from '@/app/components/theme-toggle';
import UnlockForm from '@/app/components/unlock-form';
import { decryptText } from '@/lib/crypto';
import {
  clearLocalRecents,
  formatRelativeTime,
  pushLocalRecent,
  readLocalRecents,
  safeSlug,
  type RecentNote,
} from '@/lib/notes';
import { useVault } from '@/lib/vault';

type NoteMeta = {
  slug: string;
  updatedAt: number;
  hasSharePassword?: boolean;
  deletedAt?: number | null;
};

type SearchHit = {
  slug: string;
  updatedAt: number;
  snippet: string;
};

const examples = ['engj', 'ideas', 'todo', 'links'];

export default function PathPicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, authed, hasKey, masterKey, logout } = useVault();

  const [path, setPath] = useState('');
  const [localRecents, setLocalRecents] = useState<RecentNote[]>([]);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [trash, setTrash] = useState<NoteMeta[]>([]);
  const [showTrash, setShowTrash] = useState(searchParams.get('trash') === '1');
  const [query, setQuery] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLocalRecents(readLocalRecents());
  }, []);

  const loadLists = useCallback(async () => {
    if (!authed) return;
    try {
      const [liveRes, trashRes] = await Promise.all([
        fetch('/api/notes', { cache: 'no-store' }),
        fetch('/api/notes?trash=1', { cache: 'no-store' }),
      ]);
      if (liveRes.ok) {
        const data = await liveRes.json();
        setNotes(Array.isArray(data.notes) ? data.notes : []);
      }
      if (trashRes.ok) {
        const data = await trashRes.json();
        setTrash(Array.isArray(data.notes) ? data.notes : []);
      }
    } catch {
      // ignore
    }
  }, [authed]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  function goToNote(event: React.FormEvent) {
    event.preventDefault();
    const slug = safeSlug(path.trim().replace(/^\/+/, ''));
    if (!slug) return;
    pushLocalRecent(slug);
    router.push(`/${slug}`);
  }

  async function runSearch(nextQuery: string) {
    setQuery(nextQuery);
    if (!authed || !hasKey || !masterKey) {
      setSearchHits(null);
      return;
    }
    if (!nextQuery.trim()) {
      setSearchHits(null);
      return;
    }

    setSearching(true);
    setError('');
    try {
      const res = await fetch(`/api/notes/search?q=${encodeURIComponent(nextQuery.trim())}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Search failed.');
      const data = await res.json();
      const items = Array.isArray(data.notes) ? data.notes : [];
      const q = nextQuery.trim().toLowerCase();
      const hits: SearchHit[] = [];

      for (const item of items) {
        let plain = '';
        try {
          plain = await decryptText(item.content || '', masterKey);
        } catch {
          continue;
        }
        const hay = `${item.slug}\n${plain}`.toLowerCase();
        if (!hay.includes(q)) continue;
        const idx = plain.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 40);
        const snippet =
          idx >= 0
            ? `${start > 0 ? '…' : ''}${plain.slice(start, start + 100).replace(/\s+/g, ' ')}…`
            : plain.slice(0, 100).replace(/\s+/g, ' ');
        hits.push({ slug: item.slug, updatedAt: item.updatedAt || 0, snippet });
      }

      setSearchHits(hits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
      setSearchHits([]);
    } finally {
      setSearching(false);
    }
  }

  async function restore(slug: string) {
    setBusy(slug);
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(slug)}/restore`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Restore failed.');
      await loadLists();
      setShowTrash(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setBusy('');
    }
  }

  async function emptyTrash() {
    if (!window.confirm('Permanently delete all trashed notes?')) return;
    setBusy('empty');
    try {
      const res = await fetch('/api/notes?trash=1', { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not empty trash.');
      await loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not empty trash.');
    } finally {
      setBusy('');
    }
  }

  const list = showTrash ? trash : notes;
  const headerLabel = showTrash ? 'Trash' : 'Your notes';

  const filteredLocal = useMemo(() => {
    if (authed && notes.length) return [];
    return localRecents;
  }, [authed, notes.length, localRecents]);

  if (!ready) {
    return (
      <div className="path-picker">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="path-picker locked-home">
        <div className="home-actions">
          <ThemeToggle />
        </div>
        <UnlockForm />
        <div className="examples" style={{ marginTop: 22 }}>
          <span className="examples-label">Or jump to a path after unlock</span>
          {examples.map((example) => (
            <Link key={example} className="example-chip" href={`/${example}`}>
              /{example}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (!hasKey) {
    return (
      <div className="path-picker locked-home">
        <UnlockForm
          mode="vault"
          title="Unlock encryption vault"
          subtitle="Session is active. Enter your master password once per tab to decrypt notes."
        />
      </div>
    );
  }

  return (
    <div className="path-picker">
      <div className="home-actions">
        <ThemeToggle />
        <button className="ghost" type="button" onClick={() => void logout()}>
          Lock
        </button>
      </div>

      <form className="path-form" onSubmit={goToNote}>
        <span className="path-prefix">/</span>
        <input
          autoFocus
          type="text"
          placeholder="your-note"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit">Open</button>
      </form>

      <div className="search-row">
        <input
          type="search"
          placeholder="Search notes (decrypted on this device)…"
          value={query}
          onChange={(e) => void runSearch(e.target.value)}
        />
        {searching ? <span className="examples-label">Searching…</span> : null}
      </div>

      {searchHits ? (
        <div className="note-list">
          <div className="recents-header">
            <span className="examples-label">
              Search results ({searchHits.length})
            </span>
            <button className="text-btn" type="button" onClick={() => { setQuery(''); setSearchHits(null); }}>
              Clear
            </button>
          </div>
          {searchHits.length === 0 ? (
            <p className="muted small">No matches.</p>
          ) : (
            <ul className="note-items">
              {searchHits.map((hit) => (
                <li key={hit.slug}>
                  <Link href={`/${hit.slug}`} className="note-item">
                    <span className="note-slug">/{hit.slug}</span>
                    <span className="note-meta">{hit.snippet}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="list-tabs">
            <button
              className={!showTrash ? 'tab active' : 'tab'}
              type="button"
              onClick={() => setShowTrash(false)}
            >
              Notes {notes.length ? `(${notes.length})` : ''}
            </button>
            <button
              className={showTrash ? 'tab active' : 'tab'}
              type="button"
              onClick={() => setShowTrash(true)}
            >
              Trash {trash.length ? `(${trash.length})` : ''}
            </button>
          </div>

          <div className="note-list">
            <div className="recents-header">
              <span className="examples-label">{headerLabel}</span>
              {showTrash && trash.length > 0 ? (
                <button
                  className="text-btn"
                  type="button"
                  disabled={busy === 'empty'}
                  onClick={() => void emptyTrash()}
                >
                  Empty trash
                </button>
              ) : null}
              {!showTrash && filteredLocal.length > 0 && notes.length === 0 ? (
                <button
                  className="text-btn"
                  type="button"
                  onClick={() => {
                    clearLocalRecents();
                    setLocalRecents([]);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>

            {list.length > 0 ? (
              <ul className="note-items">
                {list.map((note) => (
                  <li key={note.slug}>
                    {showTrash ? (
                      <div className="note-item row">
                        <div>
                          <span className="note-slug">/{note.slug}</span>
                          <span className="note-meta">
                            {note.deletedAt
                              ? `Deleted ${formatRelativeTime(note.deletedAt)}`
                              : 'In trash'}
                          </span>
                        </div>
                        <button
                          className="ghost"
                          type="button"
                          disabled={busy === note.slug}
                          onClick={() => void restore(note.slug)}
                        >
                          Restore
                        </button>
                      </div>
                    ) : (
                      <Link href={`/${note.slug}`} className="note-item">
                        <span className="note-slug">
                          /{note.slug}
                          {note.hasSharePassword ? (
                            <span className="badge">shared</span>
                          ) : null}
                        </span>
                        <span className="note-meta">
                          {note.updatedAt ? formatRelativeTime(note.updatedAt) : '—'}
                        </span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : filteredLocal.length > 0 && !showTrash ? (
              <div className="examples">
                <span className="examples-label">Recent on this device</span>
                {filteredLocal.map((item) => (
                  <Link key={item.slug} className="example-chip recent-chip" href={`/${item.slug}`}>
                    /{item.slug}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="examples">
                <span className="examples-label">{showTrash ? 'Trash is empty' : 'Try'}</span>
                {!showTrash &&
                  examples.map((example) => (
                    <Link key={example} className="example-chip" href={`/${example}`}>
                      /{example}
                    </Link>
                  ))}
              </div>
            )}
          </div>
        </>
      )}

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
