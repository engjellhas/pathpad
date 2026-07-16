import { requireMaster } from '@/lib/auth';
import { getContent, listNotesWithMeta } from '@/lib/note-store';
import { getRedis, storageNotConfiguredResponse } from '@/lib/redis';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Returns note payloads for client-side decrypt + search.
 * Ciphertext-only — never decrypts on the server.
 */
export async function GET(request: NextRequest) {
  const denied = await requireMaster(request);
  if (denied) return denied;

  const redis = getRedis();
  if (!redis) return storageNotConfiguredResponse();

  const q = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  const notes = await listNotesWithMeta(redis, false);

  const items = [];
  for (const note of notes) {
    const content = await getContent(redis, note.slug);
    items.push({
      slug: note.slug,
      updatedAt: note.updatedAt,
      hasSharePassword: note.hasSharePassword,
      encrypted: note.encrypted || content.startsWith('v1:'),
      content,
    });
  }

  // If query empty, return all for client filter UI.
  // Server cannot filter encrypted bodies; client does the match after decrypt.
  return NextResponse.json({ q, notes: items });
}
