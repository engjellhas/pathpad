import { requireMaster } from '@/lib/auth';
import { listNotesWithMeta, purgeTrash } from '@/lib/note-store';
import { getRedis, storageNotConfiguredResponse } from '@/lib/redis';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const denied = await requireMaster(request);
  if (denied) return denied;

  const redis = getRedis();
  if (!redis) return storageNotConfiguredResponse();

  const trash = request.nextUrl.searchParams.get('trash') === '1';
  const notes = await listNotesWithMeta(redis, trash);

  return NextResponse.json({ notes });
}

/** Empty trash permanently. */
export async function DELETE(request: NextRequest) {
  const denied = await requireMaster(request);
  if (denied) return denied;

  const redis = getRedis();
  if (!redis) return storageNotConfiguredResponse();

  const emptied = request.nextUrl.searchParams.get('trash') === '1';
  if (!emptied) {
    return NextResponse.json({ error: 'Pass ?trash=1 to empty trash.' }, { status: 400 });
  }

  const count = await purgeTrash(redis);
  return NextResponse.json({ ok: true, count });
}
