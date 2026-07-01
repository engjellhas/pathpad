import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = Redis.fromEnv();

function isAuthorized(request: NextRequest) {
  const expected = process.env.NOTE_PASSWORD;
  const received = request.headers.get('x-note-password');

  if (!expected) return false;
  return received === expected;
}

function safeSlug(slug: string) {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;
  const key = `note:${safeSlug(slug)}`;
  const content = (await redis.get<string>(key)) ?? '';

  return NextResponse.json({ content });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { slug } = await params;
  const key = `note:${safeSlug(slug)}`;

  await redis.set(key, body.content);

  return NextResponse.json({ ok: true });
}
