'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ThemeToggle from '@/app/components/theme-toggle';
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
type AccessMode = 'master' | 'share';

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
      return 'Could not save';
    default:
      return '';
  }
}

export default function NoteEditor({ slug }: { slug: string }) {
  const { ready, authed, hasKey, masterKey, logout } = useVault();

  const [access, setAccess] = useState<AccessMode>('master');
  const [sharePassword, setSharePassword] = useState('');
  const [shareKey, setShareKey] = useState<CryptoKey | null>(null);
  const [showShareUnlock, setShowShareUnlock] = useState(false);
  const [shareInput, setShareInput] = useState('');
  const [shareBusy, setShareBusy] = useState(false);

  const [content, setContent] = useState('');
  const [status, setStatus] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'link' | 'text' | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [preview, setPreview] = useState(false);
  const [hasSharePassword, setHasSharePassword] = useState(false);
  const [sharePanel, setSharePanel] = useState(false);
  const [newSharePassword, setNewSharePassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadedRef = useRef(false);
  const lastSavedRef = useRef('');
  const saveSeqRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSharePasswordRef = useRef('');

  const canEdit = access === 'master' && hasKey;

  // Load when vault unlocks.
  useEffect(() => {
    if (!ready) return;
    if (authed && hasKey && masterKey) {
      void loadAsMaster();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authed, hasKey, masterKey, slug]);

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

  const saveNote = useCallback(
    async (nextContent: string) => {
      if (!masterKey || access !== 'master') return false;
      if (isOversize(nextContent)) {
        setStatus('error');
        setError(`Note is too large (max ~${Math.floor(MAX_NOTE_BYTES / 1000)} KB).`);
        return false;
      }

      const seq = ++saveSeqRef.current;
      setStatus('saving');

      try {
        const encrypted = await encryptText(nextContent, masterKey);
        const body: Record<string, unknown> = { content: encrypted };

        // Keep share ciphertext in sync when a share password is active.
        const sharePw = activeSharePasswordRef.current || sharePassword;
        if (hasSharePassword && sharePw) {
          const sKey = await deriveShareKey(sharePw, slug);
          body.shareContent = await encryptText(nextContent, sKey);
        }

        const response = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (seq !== saveSeqRef.current) return false;

        if (!response.ok) {
          if (response.status === 401) throw new Error('Session expired. Lock and unlock again.');
          if (response.status === 413) {
            throw new Error(`Note is too large (max ~${Math.floor(MAX_NOTE_BYTES / 1000)} KB).`);
          }
          throw new Error('Could not save note.');
        }

        const data = (await response.json().catch(() => null)) as {
          updatedAt?: number;
          hasSharePassword?: boolean;
        } | null;

        lastSavedRef.current = nextContent;
        clearDraft(slug);
        setSavedAt(data?.updatedAt ?? Date.now());
        if (typeof data?.hasSharePassword === 'boolean') {
          setHasSharePassword(data.hasSharePassword);
        }
        setStatus('saved');
        setError('');
        return true;
      } catch (err) {
        if (seq !== saveSeqRef.current) return false;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Could not save your changes.');
        return false;
      }
    },
    [masterKey, access, slug, hasSharePassword, sharePassword]
  );

  async function loadAsMaster() {
    if (!masterKey) return;
    setStatus('loading');
    setError('');
    setAccess('master');

    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        if (response.status === 401) throw new Error('Session expired. Unlock again.');
        if (response.status === 503) {
          throw new Error('Notes storage is not set up yet. Check your server configuration.');
        }
        throw new Error('Could not open this note.');
      }

      const data = await response.json();
      const payload = typeof data.content === 'string' ? data.content : '';
      let serverContent = '';
      try {
        serverContent = await decryptText(payload, masterKey);
      } catch {
        throw new Error(
          'Could not decrypt this note. Use the same master password that encrypted it.'
        );
      }

      const draft = readDraft(slug);
      const useDraft = draft != null && draft !== serverContent;
      const initial = useDraft ? draft : serverContent;

      setContent(initial);
      lastSavedRef.current = serverContent;
      setHasSharePassword(Boolean(data.hasSharePassword));
      pushLocalRecent(slug);
      loadedRef.current = true;
      setSavedAt(typeof data.updatedAt === 'number' ? data.updatedAt : Date.now());

      if (useDraft) {
        setStatus('unsaved');
        setError('Restored a local draft that had not finished saving.');
        void saveNote(initial);
      } else {
        setStatus('saved');
        clearDraft(slug);
      }
    } catch (err) {
      loadedRef.current = false;
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function loadAsShare(password: string) {
    setShareBusy(true);
    setError('');
    setStatus('loading');

    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
        headers: { 'x-share-password': password },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Wrong share password or note is not shared.');
      }

      const data = await response.json();
      const payload = typeof data.content === 'string' ? data.content : '';
      const key = await deriveShareKey(password, slug);
      let plain = '';
      try {
        plain = await decryptText(payload, key);
      } catch {
        // Allow legacy plaintext share payloads.
        if (!isEncryptedPayload(payload)) plain = payload;
        else throw new Error('Could not decrypt shared note.');
      }

      setShareKey(key);
      setSharePassword(password);
      activeSharePasswordRef.current = password;
      setAccess('share');
      setContent(plain);
      lastSavedRef.current = plain;
      loadedRef.current = true;
      setHasSharePassword(true);
      setShowShareUnlock(false);
      setSavedAt(typeof data.updatedAt === 'number' ? data.updatedAt : Date.now());
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Could not open shared note.');
    } finally {
      setShareBusy(false);
    }
  }

  // Autosave (master only).
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

  // Keyboard shortcuts.
  useEffect(() => {
    if (!canEdit) return;

    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveNote(content);
        return;
      }
      if (meta && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        setPreview((v) => !v);
        return;
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

  async function enableSharePassword() {
    if (!masterKey || !newSharePassword.trim()) return;
    setStatus('saving');
    try {
      const encrypted = await encryptText(content, masterKey);
      const sKey = await deriveShareKey(newSharePassword, slug);
      const shareContent = await encryptText(content, sKey);

      const response = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: encrypted,
          shareContent,
          sharePassword: newSharePassword,
        }),
      });
      if (!response.ok) throw new Error('Could not set share password.');

      activeSharePasswordRef.current = newSharePassword;
      setSharePassword(newSharePassword);
      setHasSharePassword(true);
      setNewSharePassword('');
      setSharePanel(false);
      setStatus('saved');
      setError('');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Could not set share password.');
    }
  }

  async function clearSharePassword() {
    if (!masterKey) return;
    setStatus('saving');
    try {
      const encrypted = await encryptText(content, masterKey);
      const response = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: encrypted,
          clearSharePassword: true,
        }),
      });
      if (!response.ok) throw new Error('Could not remove share password.');
      activeSharePasswordRef.current = '';
      setSharePassword('');
      setHasSharePassword(false);
      setSharePanel(false);
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Could not remove share password.');
    }
  }

  async function moveToTrash() {
    const response = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setError('Could not move note to trash.');
      return;
    }
    window.location.href = '/?trash=1';
  }

  async function lockNote() {
    await logout();
    setContent('');
    setAccess('master');
    setShareKey(null);
    setSharePassword('');
    activeSharePasswordRef.current = '';
    loadedRef.current = false;
    lastSavedRef.current = '';
    setStatus('idle');
    setSavedAt(null);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${slug}`);
      setCopied('link');
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Could not copy link.');
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied('text');
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Could not copy note.');
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
  }

  const previewHtml = useMemo(() => renderMarkdown(content), [content]);

  if (!ready) {
    return (
      <main className="wrap">
        <section className="card">
          <p className="muted">Loading…</p>
        </section>
      </main>
    );
  }

  // Not unlocked: master login or share password.
  if (!(authed && hasKey) && access !== 'share') {
    return (
      <main className="wrap">
        <section className="card login">
          <div className="card-top-actions">
            <Link className="back-link" href="/">
              ← Home
            </Link>
            <ThemeToggle />
          </div>

          {!showShareUnlock ? (
            <>
              <UnlockForm
                title={`Unlock /${slug}`}
                subtitle="Enter your master password. Prefer a shared link? Open with a note share password instead."
              />
              <button
                className="ghost"
                type="button"
                style={{ marginTop: 14, width: '100%' }}
                onClick={() => setShowShareUnlock(true)}
              >
                Open with share password
              </button>
            </>
          ) : (
            <>
              <p className="eyebrow">/{slug}</p>
              <h1>Share access</h1>
              <p className="muted">
                This only unlocks this single path — not your full notepad.
              </p>
              <form
                className="login"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadAsShare(shareInput);
                }}
              >
                <div className="password-field">
                  <input
                    autoFocus
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
              <button
                className="ghost"
                type="button"
                style={{ marginTop: 14, width: '100%' }}
                onClick={() => setShowShareUnlock(false)}
              >
                Back to master unlock
              </button>
            </>
          )}

          {error ? <p className="error">{error}</p> : null}
        </section>
      </main>
    );
  }

  // Session yes, vault key no.
  if (authed && !hasKey && access !== 'share') {
    return (
      <main className="wrap">
        <section className="card login">
          <Link className="back-link" href="/">
            ← Home
          </Link>
          <UnlockForm
            mode="vault"
            title="Unlock encryption vault"
            subtitle="You are signed in, but this browser tab still needs the master password to decrypt notes."
          />
          {error ? <p className="error">{error}</p> : null}
        </section>
      </main>
    );
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const lineCount = content ? content.split('\n').length : 0;
  const sizeLabel =
    savedAt != null && status === 'saved'
      ? `Saved ${formatRelativeTime(savedAt)}`
      : statusLabel(status);
  void now;

  return (
    <main className="editor">
      <header className="editor-header">
        <div>
          <p className="eyebrow">
            {access === 'share' ? 'Shared note (read-only)' : 'Private note · encrypted'}
          </p>
          <h1>/{slug}</h1>
        </div>

        <div className="toolbar">
          <ThemeToggle />
          <button className="ghost" type="button" onClick={() => setPreview((v) => !v)}>
            {preview ? 'Edit' : 'Preview'}
          </button>
          <button className="ghost" type="button" onClick={() => void copyLink()}>
            {copied === 'link' ? 'Copied!' : 'Copy link'}
          </button>
          <button className="ghost" type="button" onClick={() => void copyText()}>
            {copied === 'text' ? 'Copied!' : 'Copy text'}
          </button>
          <button className="ghost" type="button" onClick={downloadNote}>
            Download
          </button>
          {canEdit ? (
            <button className="ghost" type="button" onClick={() => setSharePanel((v) => !v)}>
              {hasSharePassword ? 'Share · on' : 'Share'}
            </button>
          ) : null}
          {canEdit ? (
            <button
              className="ghost danger"
              type="button"
              onClick={() => setConfirmDelete(true)}
            >
              Trash
            </button>
          ) : null}
          {access === 'master' ? (
            <button className="ghost" type="button" onClick={() => void lockNote()}>
              Lock
            </button>
          ) : (
            <Link className="ghost button-link" href="/">
              Home
            </Link>
          )}
          <div className={`status-pill ${status}`} aria-live="polite">
            <span className="status-dot" />
            {sizeLabel}
          </div>
        </div>
      </header>

      {sharePanel && canEdit ? (
        <section className="panel">
          <div>
            <strong>Per-note share password</strong>
            <p className="muted small">
              Anyone with this password can open <code>/{slug}</code> only — not your other notes.
              Content is encrypted with the share password.
            </p>
          </div>
          {hasSharePassword ? (
            <div className="panel-actions">
              <span className="status-pill saved">
                <span className="status-dot" /> Share password enabled
              </span>
              <button className="ghost danger" type="button" onClick={() => void clearSharePassword()}>
                Remove share password
              </button>
            </div>
          ) : (
            <div className="panel-actions">
              <input
                type="password"
                placeholder="New share password"
                value={newSharePassword}
                onChange={(e) => setNewSharePassword(e.target.value)}
              />
              <button
                type="button"
                disabled={!newSharePassword.trim()}
                onClick={() => void enableSharePassword()}
              >
                Enable sharing
              </button>
            </div>
          )}
        </section>
      ) : null}

      {confirmDelete && canEdit ? (
        <section className="panel danger-panel">
          <div>
            <strong>Move /{slug} to trash?</strong>
            <p className="muted small">Soft-deleted for 30 days. Restore from Trash on the home page.</p>
          </div>
          <div className="panel-actions">
            <button className="ghost" type="button" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button className="danger-solid" type="button" onClick={() => void moveToTrash()}>
              Move to trash
            </button>
          </div>
        </section>
      ) : null}

      {preview ? (
        <div
          className="markdown-preview"
          dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="muted">Nothing to preview.</p>' }}
        />
      ) : (
        <textarea
          ref={textareaRef}
          autoFocus
          spellCheck="false"
          readOnly={!canEdit}
          placeholder={
            canEdit
              ? 'Start typing — encrypted autosave… (⌘/Ctrl+S save · ⌘/Ctrl+E preview · Tab indent)'
              : 'Shared note is read-only'
          }
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={status === 'loading'}
        />
      )}

      <footer className="editor-footer">
        <span>
          {content.length.toLocaleString()} characters · {wordCount.toLocaleString()} words ·{' '}
          {lineCount.toLocaleString()} lines
        </span>
        <span className="footer-hint">
          {access === 'share'
            ? 'Share access · read-only'
            : 'Encrypted at rest · local draft · ⌘/Ctrl+S · ⌘/Ctrl+E'}
        </span>
      </footer>

      {error ? <p className="error bottom">{error}</p> : null}
    </main>
  );
}
