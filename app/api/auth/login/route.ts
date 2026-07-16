import {
  applySessionCookie,
  clientIp,
  createSession,
  masterPasswordValid,
  rateLimitLogin,
} from '@/lib/auth';
import { getRedis, storageNotConfiguredResponse } from '@/lib/redis';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  if (!getRedis()) return storageNotConfiguredResponse();

  const limited = await rateLimitLogin(clientIp(request));
  if (!limited.ok) {
    return NextResponse.json(
      {
        error: `Too many login attempts. Try again in ${limited.retryAfter}s.`,
        retryAfter: limited.retryAfter,
      },
      {
        status: 429,
        headers: limited.retryAfter
          ? { 'Retry-After': String(limited.retryAfter) }
          : undefined,
      }
    );
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!masterPasswordValid(password)) {
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
  }

  const token = await createSession();
  if (!token) return storageNotConfiguredResponse();

  const response = NextResponse.json({ ok: true });
  return applySessionCookie(response, token);
}
