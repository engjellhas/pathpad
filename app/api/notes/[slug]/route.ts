import {
  hashSharePassword,
  isMasterAuthorized,
  requireMaster,
  verifySharePassword,
} from '@/lib/auth';
import { ENC_PREFIX, MAX_NOTE_BYTES } from '@/lib/constants';
import {
  clearShareContent,
  getContent,
  getMeta,
  getShareContent,
  indexAdd,
  setContent,
  setMeta,
  setShareContent,
  softDelete,
  type NoteMeta,
} from '@/lib/note-store';
import { byteLength, safeSlug } from '@/lib/notes';
import { getRedis, storageNotConfiguredResponse } from '@/lib/redis';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const redis = getRedis();
  if (!redis) return storageNotConfiguredResponse();

  const { slug: raw } = await params;
  const slug = safeSlug(raw);
  if (!slug) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });

  const master = await isMasterAuthorized(request);
  const sharePassword = request.headers.get('x-share-password') || '';
  const meta = await getMeta(redis, slug);

  if (!master) {
    if (!meta?.sharePasswordHash) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!verifySharePassword(sharePassword, slug, meta.sharePasswordHash)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shareContent = await getShareContent(redis, slug);
    return NextResponse.json({
      content: shareContent,
      updatedAt: meta.updatedAt ?? Date.now(),
      hasSharePassword: true,
      shareAccess: true,
      encrypted: shareContent.startsWith(ENC_PREFIX),
    });
  }

  const content = await getContent(redis, slug);
  return NextResponse.json({
    content,
    updatedAt: meta?.updatedAt ?? Date.now(),
    hasSharePassword: Boolean(meta?.hasSharePassword || meta?.sharePasswordHash),
    shareAccess: false,
    encrypted: content.startsWith(ENC_PREFIX),
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const denied = await requireMaster(request);
  if (denied) return denied;

  const redis = getRedis();
  if (!redis) return storageNotConfiguredResponse();

  const { slug: raw } = await params;
  const slug = safeSlug(raw);
  if (!slug) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (byteLength(body.content) > MAX_NOTE_BYTES) {
    return NextResponse.json(
      { error: `Note too large. Max size is ${Math.floor(MAX_NOTE_BYTES / 1000)} KB.` },
      { status: 413 }
    );
  }

  const updatedAt = Date.now();
  const existing = await getMeta(redis, slug);
  const meta: NoteMeta = {
    slug,
    updatedAt,
    deletedAt: null,
    encrypted: body.content.startsWith(ENC_PREFIX),
    hasSharePassword: existing?.hasSharePassword,
    sharePasswordHash: existing?.sharePasswordHash,
  };

  // Optional share payload (note-password encrypted ciphertext).
  if (typeof body.shareContent === 'string') {
    if (byteLength(body.shareContent) > MAX_NOTE_BYTES) {
      return NextResponse.json({ error: 'Share payload too large.' }, { status: 413 });
    }
    await setShareContent(redis, slug, body.shareContent);
  }

  // Set / clear share password (master only).
  if (body.clearSharePassword === true) {
    meta.hasSharePassword = false;
    meta.sharePasswordHash = null;
    await clearShareContent(redis, slug);
  } else if (typeof body.sharePassword === 'string' && body.sharePassword.length > 0) {
    meta.hasSharePassword = true;
    meta.sharePasswordHash = hashSharePassword(body.sharePassword, slug);
  }

  await setContent(redis, slug, body.content);
  await setMeta(redis, meta);
  await indexAdd(redis, slug);

  return NextResponse.json({
    ok: true,
    updatedAt,
    hasSharePassword: Boolean(meta.hasSharePassword),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const denied = await requireMaster(request);
  if (denied) return denied;

  const redis = getRedis();
  if (!redis) return storageNotConfiguredResponse();

  const { slug: raw } = await params;
  const slug = safeSlug(raw);
  if (!slug) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });

  const meta = await softDelete(redis, slug);
  return NextResponse.json({ ok: true, meta });
}
