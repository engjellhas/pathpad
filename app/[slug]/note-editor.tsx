'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import UnlockForm from '@/app/components/unlock-form';
import {
  decryptText,
  deriveShareKey,
  encryptText,
  isEncryptedPayload,
} from '@/lib/crypto';
import { renderMarkdown } from '@/lib/markdown';
import {
  AUTOSAVE_MS,
  clearDraft,
  formatRelativeTime,
  isOversize,
  MAX_NOTE_BYTES,
  pushLocalRecent,
  readDraft,
  writeDraft,
} from '@/lib/notes';
import { useVault } from '@/lib/vault';

type SaveState = 'idle' | 'loading' | 'saving' | 'saved' | 'unsaved' | 'error';

function statusLabel(status: SaveState) {
  switch (status) {
    case 'loading':
      return 'Loading…';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'unsaved':
      return 'Unsaved';
    case 'error':
      return 'Error';
    default:
      return '';
  }
}

export default function NoteEditor({ slug }: { slug: string }) {
  const { ready, unlocked, masterKey, lock } = useVault();

  const [content, setContent] = useState('');
  const [status, setStatus] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [shareMode, setShareMode] = useState(false);
  const [shareInput, setShareInput] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [readOnlyShare, setReadOnlyShare] = useState(false);

  const loadedRef = useRef(false);
  const lastSavedRef = useRef('');
  const saveSeqRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const canEdit = unlocked && !readOnlyShare;

  useEffect(() => {
    if (!ready || !unlocked || !masterKey || readOnlyShare) return;
    void loadNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, unlocked, masterKey, slug]);

  useEffect(() => {
    if (!canEdit || savedAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [canEdit, savedAt]);

  useEffect(() => {
    if (!canEdit) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (content !== lastSavedRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [content, canEdit]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    window.addEventListener('mousedown', onPointer);
    return () => window.removeEventListener('mousedown', onPointer);
  }, [menuOpen]);

  const saveNote = useCallback(
    async (nextContent: string) => {
      if (!masterKey || !canEdit) return false;
      if (isOversize(nextContent)) {
        setStatus('error');
        setError(`Note is too large (max ~${Math.floor(MAX_NOTE_BYTES / 1000)} KB).`);
        return false;
      }

      const seq = ++saveSeqRef.current;
      setStatus('saving');

      try {
        const encrypted = await encryptText(nextContent, masterKey);
        const response = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: encrypted }),
        });

        if (seq !== saveSeqRef.current) return false;

        if (!response.ok) {
          if (response.status === 401) throw new Error('Session expired — lock and unlock again.');
          if (response.status === 413) {
            throw new Error(`Note is too large (max ~${Math.floor(MAX_NOTE_BYTES / 1000)} KB).`);
          }
          throw new Error('Could not save.');
        }

        const data = (await response.json().catch(() => null)) as { updatedAt?: number } | null;
        lastSavedRef.current = nextContent;
        clearDraft(slug);
        setSavedAt(data?.updatedAt ?? Date.now());
        setStatus('saved');
        setError('');
        return true;
      } catch (err) {
        if (seq !== saveSeqRef.current) return false;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Could not save.');
        return false;
      }
    },
    [masterKey, canEdit, slug]
  );

  async function loadNote() {
    if (!masterKey) return;
    setStatus('loading');
    setError('');
    setReadOnlyShare(false);

    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        if (response.status === 401) throw new Error('Session expired — enter password again.');
        if (response.status === 503) {
          throw new Error('Storage is not configured on the server.');
        }
        throw new Error('Could not open this note.');
      }

      const data = await response.json();
      const payload = typeof data.content === 'string' ? data.content : '';
      let serverContent = '';
      try {
        serverContent = await decryptText(payload, masterKey);
      } catch {
        throw new Error('Could not decrypt. Use the same password as on your other device.');
      }

      const draft = readDraft(slug);
      const useDraft = draft != null && draft !== serverContent;
      const initial = useDraft ? draft : serverContent;

      setContent(initial);
      lastSavedRef.current = serverContent;
      pushLocalRecent(slug);
      loadedRef.current = true;
      setSavedAt(typeof data.updatedAt === 'number' ? data.updatedAt : Date.now());

      if (useDraft) {
        setStatus('unsaved');
        void saveNote(initial);
      } else {
        setStatus('saved');
        clearDraft(slug);
      }

      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (err) {
      loadedRef.current = false;
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function openWithSharePassword(password: string) {
    setShareBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
        headers: { 'x-share-password': password },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Wrong share password.');

      const data = await response.json();
      const payload = typeof data.content === 'string' ? data.content : '';
      const key = await deriveShareKey(password, slug);
      let plain = '';
      try {
        plain = await decryptText(payload, key);
      } catch {
        if (!isEncryptedPayload(payload)) plain = payload;
        else throw new Error('Could not decrypt shared note.');
      }

      setContent(plain);
      lastSavedRef.current = plain;
      loadedRef.current = true;
      setReadOnlyShare(true);
      setShareMode(false);
      setSavedAt(typeof data.updatedAt === 'number' ? data.updatedAt : Date.now());
      setStatus('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open.');
    } finally {
      setShareBusy(false);
    }
  }

  useEffect(() => {
    if (!canEdit || !loadedRef.current) return;

    if (content === lastSavedRef.current) {
      setStatus((current) => (current === 'error' ? current : 'saved'));
      return;
    }

    writeDraft(slug, content);
    setStatus('unsaved');
    const timeout = window.setTimeout(() => {
      void saveNote(content);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timeout);
  }, [content, slug, canEdit, saveNote]);

  useEffect(() => {
    if (!canEdit) return;

    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveNote(content);
      }
      if (meta && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        setPreview((v) => !v);
      }
      if (event.key === 'Tab' && document.activeElement === textareaRef.current && !preview) {
        event.preventDefault();
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = content.slice(0, start) + '  ' + content.slice(end);
        setContent(next);
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = start + 2;
        });
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canEdit, content, saveNote, preview]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${slug}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy link.');
    }
  }

  function downloadNote() {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug || 'note'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  }

  async function trashNote() {
    if (!window.confirm(`Move /${slug} to trash?`)) return;
    const response = await fetch(`/api/notes/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    if (!response.ok) {
      setError('Could not trash note.');
      return;
    }
    window.location.href = '/';
  }

  const previewHtml = useMemo(() => renderMarkdown(content), [content]);
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  void now;

  const statusText =
    savedAt != null && status === 'saved'
      ? `Saved ${formatRelativeTime(savedAt)}`
      : statusLabel(status);

  if (!ready) {
    return (
      <main className="wrap">
        <section className="card">
          <p className="muted">Loading…</p>
        </section>
      </main>
    );
  }

  if (!unlocked && !readOnlyShare) {
    return (
      <main className="wrap">
        <section className="card login">
          <Link className="back-link" href="/">
            ← Home
          </Link>
          <UnlockForm
            title={`Open /${slug}`}
            subtitle="Enter once on this device. Then paste text and open the same link on your phone."
          />
          <button
            className="text-btn share-alt"
            type="button"
            onClick={() => setShareMode((v) => !v)}
          >
            {shareMode ? 'Hide share password' : 'Have a share password?'}
          </button>
          {shareMode ? (
            <form
              className="login compact"
              onSubmit={(event) => {
                event.preventDefault();
                void openWithSharePassword(shareInput);
              }}
            >
              <div className="password-field">
                <input
                  type="password"
                  placeholder="Share password"
                  value={shareInput}
                  onChange={(e) => setShareInput(e.target.value)}
                  disabled={shareBusy}
                />
              </div>
              <button type="submit" disabled={!shareInput.trim() || shareBusy}>
                {shareBusy ? 'Opening…' : 'Open shared note'}
              </button>
            </form>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="editor">
      <header className="editor-header simple">
        <div className="editor-title">
          <Link className="back-mini" href="/">
            Pathpad
          </Link>
          <h1>/{slug}</h1>
        </div>

        <div className="toolbar simple-toolbar">
          <div className={`status-pill ${status}`} aria-live="polite">
            <span className="status-dot" />
            {statusText}
          </div>

          <button className="button copy-primary" type="button" onClick={() => void copyLink()}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>

          <div className="menu-wrap" ref={menuRef}>
            <button
              className="ghost"
              type="button"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              More
            </button>
            {menuOpen ? (
              <div className="menu-pop">
                <button
                  type="button"
                  onClick={() => {
                    setPreview((v) => !v);
                    setMenuOpen(false);
                  }}
                >
                  {preview ? 'Edit text' : 'Preview Markdown'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(content);
                    setMenuOpen(false);
                  }}
                >
                  Copy text
                </button>
                <button type="button" onClick={downloadNote}>
                  Download .txt
                </button>
                {canEdit ? (
                  <button type="button" className="danger-item" onClick={() => void trashNote()}>
                    Move to trash
                  </button>
                ) : null}
                {!readOnlyShare ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void lock();
                    }}
                  >
                    Lock device
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {readOnlyShare ? (
        <p className="banner">Shared note · read-only</p>
      ) : null}

      {preview ? (
        <div
          className="markdown-preview"
          dangerouslySetInnerHTML={{
            __html: previewHtml || '<p class="muted">Nothing to preview.</p>',
          }}
        />
      ) : (
        <textarea
          ref={textareaRef}
          autoFocus
          spellCheck="false"
          readOnly={!canEdit}
          placeholder="Type or paste anything… it saves automatically. Copy the link to open on another device."
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={status === 'loading'}
        />
      )}

      <footer className="editor-footer">
        <span>
          {content.length.toLocaleString()} chars · {wordCount.toLocaleString()} words
        </span>
        <span className="footer-hint">Autosaves · open the same link on phone</span>
      </footer>

      {error ? <p className="error bottom">{error}</p> : null}
    </main>
  );
}
