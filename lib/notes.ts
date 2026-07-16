import {
  DRAFT_PREFIX,
  LOCAL_RECENTS_KEY,
  MAX_NOTE_BYTES,
  MAX_RECENTS,
} from '@/lib/constants';

export { AUTOSAVE_MS, MAX_NOTE_BYTES, MAX_RECENTS } from '@/lib/constants';

export function safeSlug(slug: string) {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Short path for quick PC ↔ phone sharing. */
export function randomSlug(length = 6) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export function draftKey(slug: string) {
  return `${DRAFT_PREFIX}${safeSlug(slug)}`;
}

export function byteLength(text: string) {
  return new TextEncoder().encode(text).length;
}

export function formatRelativeTime(ts: number) {
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export type RecentNote = {
  slug: string;
  visitedAt: number;
};

export function readLocalRecents(): RecentNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentNote[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.slug === 'string' && typeof item.visitedAt === 'number')
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function pushLocalRecent(slug: string) {
  const clean = safeSlug(slug);
  if (!clean) return;
  const next: RecentNote[] = [
    { slug: clean, visitedAt: Date.now() },
    ...readLocalRecents().filter((item) => item.slug !== clean),
  ].slice(0, MAX_RECENTS);
  window.localStorage.setItem(LOCAL_RECENTS_KEY, JSON.stringify(next));
}

export function clearLocalRecents() {
  window.localStorage.removeItem(LOCAL_RECENTS_KEY);
}

export function readDraft(slug: string): string | null {
  try {
    return window.localStorage.getItem(draftKey(slug));
  } catch {
    return null;
  }
}

export function writeDraft(slug: string, content: string) {
  try {
    window.localStorage.setItem(draftKey(slug), content);
  } catch {
    // ignore
  }
}

export function clearDraft(slug: string) {
  try {
    window.localStorage.removeItem(draftKey(slug));
  } catch {
    // ignore
  }
}

export function isOversize(text: string) {
  return byteLength(text) > MAX_NOTE_BYTES;
}
