import {
  NOTES_INDEX_KEY,
  NOTES_TRASH_KEY,
  TRASH_TTL_SECONDS,
} from '@/lib/constants';
import type { Redis } from '@upstash/redis';
import { safeSlug } from '@/lib/notes';

export type NoteMeta = {
  slug: string;
  updatedAt: number;
  deletedAt?: number | null;
  hasSharePassword?: boolean;
  sharePasswordHash?: string | null;
  /** True when payload is client-encrypted (v1:...). */
  encrypted?: boolean;
  /** Optional preview snippet stored only for non-shared notes when client sends it — not used with full encryption. */
  title?: string;
};

function contentKey(slug: string) {
  return `note:${slug}`;
}

function metaKey(slug: string) {
  return `note:${slug}:meta`;
}

function shareContentKey(slug: string) {
  return `note:${slug}:share`;
}

function trashContentKey(slug: string) {
  return `note:trash:${slug}`;
}

function trashMetaKey(slug: string) {
  return `note:trash:${slug}:meta`;
}

export async function getMeta(redis: Redis, slug: string): Promise<NoteMeta | null> {
  const raw = await redis.get<string | NoteMeta>(metaKey(slug));
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as NoteMeta;
    } catch {
      return null;
    }
  }
  return raw;
}

export async function setMeta(redis: Redis, meta: NoteMeta) {
  await redis.set(metaKey(meta.slug), JSON.stringify(meta));
}

export async function getContent(redis: Redis, slug: string) {
  const value = await redis.get<string>(contentKey(slug));
  return value ?? '';
}

export async function setContent(redis: Redis, slug: string, content: string) {
  await redis.set(contentKey(slug), content);
}

export async function getShareContent(redis: Redis, slug: string) {
  const value = await redis.get<string>(shareContentKey(slug));
  return value ?? '';
}

export async function setShareContent(redis: Redis, slug: string, content: string) {
  await redis.set(shareContentKey(slug), content);
}

export async function clearShareContent(redis: Redis, slug: string) {
  await redis.del(shareContentKey(slug));
}

export async function indexAdd(redis: Redis, slug: string) {
  await redis.sadd(NOTES_INDEX_KEY, slug);
  await redis.srem(NOTES_TRASH_KEY, slug);
}

export async function indexRemove(redis: Redis, slug: string) {
  await redis.srem(NOTES_INDEX_KEY, slug);
}

export async function listIndex(redis: Redis) {
  const members = await redis.smembers(NOTES_INDEX_KEY);
  return (members as string[]).filter(Boolean).map((s) => safeSlug(s)).filter(Boolean);
}

export async function listTrash(redis: Redis) {
  const members = await redis.smembers(NOTES_TRASH_KEY);
  return (members as string[]).filter(Boolean).map((s) => safeSlug(s)).filter(Boolean);
}

export async function softDelete(redis: Redis, slug: string) {
  const content = await getContent(redis, slug);
  const meta = (await getMeta(redis, slug)) ?? {
    slug,
    updatedAt: Date.now(),
  };
  const share = await getShareContent(redis, slug);
  const deletedAt = Date.now();
  const trashMeta: NoteMeta = { ...meta, slug, deletedAt };

  await redis.set(trashContentKey(slug), content, { ex: TRASH_TTL_SECONDS });
  await redis.set(trashMetaKey(slug), JSON.stringify(trashMeta), { ex: TRASH_TTL_SECONDS });
  if (share) {
    await redis.set(`${trashContentKey(slug)}:share`, share, { ex: TRASH_TTL_SECONDS });
  }

  await redis.del(contentKey(slug), metaKey(slug), shareContentKey(slug));
  await redis.srem(NOTES_INDEX_KEY, slug);
  await redis.sadd(NOTES_TRASH_KEY, slug);
  await redis.expire(NOTES_TRASH_KEY, TRASH_TTL_SECONDS);

  return trashMeta;
}

export async function restoreNote(redis: Redis, slug: string) {
  const content = (await redis.get<string>(trashContentKey(slug))) ?? '';
  const rawMeta = await redis.get<string | NoteMeta>(trashMetaKey(slug));
  let meta: NoteMeta = { slug, updatedAt: Date.now() };
  if (rawMeta) {
    meta =
      typeof rawMeta === 'string'
        ? (JSON.parse(rawMeta) as NoteMeta)
        : rawMeta;
  }
  const share = await redis.get<string>(`${trashContentKey(slug)}:share`);

  meta = { ...meta, slug, deletedAt: null, updatedAt: Date.now() };

  await setContent(redis, slug, content);
  await setMeta(redis, meta);
  if (share) await setShareContent(redis, slug, share);

  await redis.del(
    trashContentKey(slug),
    trashMetaKey(slug),
    `${trashContentKey(slug)}:share`
  );
  await redis.srem(NOTES_TRASH_KEY, slug);
  await indexAdd(redis, slug);

  return meta;
}

export async function purgeTrash(redis: Redis) {
  const slugs = await listTrash(redis);
  for (const slug of slugs) {
    await redis.del(
      trashContentKey(slug),
      trashMetaKey(slug),
      `${trashContentKey(slug)}:share`,
      contentKey(slug),
      metaKey(slug),
      shareContentKey(slug)
    );
  }
  await redis.del(NOTES_TRASH_KEY);
  return slugs.length;
}

export async function getTrashMeta(redis: Redis, slug: string): Promise<NoteMeta | null> {
  const raw = await redis.get<string | NoteMeta>(trashMetaKey(slug));
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as NoteMeta;
    } catch {
      return null;
    }
  }
  return raw;
}

export async function listNotesWithMeta(redis: Redis, trash = false) {
  const slugs = trash ? await listTrash(redis) : await listIndex(redis);
  const notes: NoteMeta[] = [];

  for (const slug of slugs) {
    const meta = trash ? await getTrashMeta(redis, slug) : await getMeta(redis, slug);
    if (meta) {
      notes.push({
        slug,
        updatedAt: meta.updatedAt ?? 0,
        deletedAt: meta.deletedAt ?? null,
        hasSharePassword: Boolean(meta.hasSharePassword || meta.sharePasswordHash),
        encrypted: meta.encrypted,
        title: meta.title,
      });
    } else {
      notes.push({
        slug,
        updatedAt: 0,
        hasSharePassword: false,
      });
    }
  }

  notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return notes;
}
