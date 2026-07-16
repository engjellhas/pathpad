import { requireMaster } from '@/lib/auth';
import { restoreNote } from '@/lib/note-store';
import { safeSlug } from '@/lib/notes';
import { getRedis, storageNotConfiguredResponse } from '@/lib/redis';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
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

  const meta = await restoreNote(redis, slug);
  return NextResponse.json({ ok: true, meta });
}
