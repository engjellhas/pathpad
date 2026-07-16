import { createHash, randomBytes, timingSafeEqual as nodeTimingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  LOGIN_RATE_LIMIT,
  LOGIN_RATE_WINDOW_SECONDS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from '@/lib/constants';
import { getRedis } from '@/lib/redis';

export function timingSafeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still perform a compare against self to keep runtime flatter.
    nodeTimingSafeEqual(bufA, bufA);
    return false;
  }
  return nodeTimingSafeEqual(bufA, bufB);
}

export function masterPasswordValid(received: string | null | undefined) {
  const expected = process.env.NOTE_PASSWORD;
  if (!expected || !received) return false;
  return timingSafeEqual(received, expected);
}

function sessionKey(token: string) {
  return `session:${token}`;
}

export async function createSession() {
  const redis = getRedis();
  if (!redis) return null;

  const token = randomBytes(32).toString('hex');
  await redis.set(
    sessionKey(token),
    JSON.stringify({ createdAt: Date.now() }),
    { ex: SESSION_TTL_SECONDS }
  );
  return token;
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  const redis = getRedis();
  if (!redis) return;
  await redis.del(sessionKey(token));
}

export async function sessionExists(token: string | undefined | null) {
  if (!token) return false;
  const redis = getRedis();
  if (!redis) return false;
  const value = await redis.get(sessionKey(token));
  return value != null;
}

export function readSessionTokenFromRequest(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

export async function isMasterAuthorized(request: NextRequest) {
  const token = readSessionTokenFromRequest(request);
  if (await sessionExists(token)) return true;

  // Backward-compatible header for scripts/tools.
  const headerPassword = request.headers.get('x-note-password');
  return masterPasswordValid(headerPassword);
}

export async function requireMaster(request: NextRequest) {
  if (await isMasterAuthorized(request)) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function applySessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export async function getSessionFromCookies() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return sessionExists(token);
}

/** Hash a share password for storage (not reversible). */
export function hashSharePassword(password: string, slug: string) {
  return createHash('sha256').update(`pathpad-share:${slug}:${password}`).digest('hex');
}

export function verifySharePassword(password: string, slug: string, hash: string | undefined | null) {
  if (!hash || !password) return false;
  const next = hashSharePassword(password, slug);
  return timingSafeEqual(next, hash);
}

export async function rateLimitLogin(ip: string) {
  const redis = getRedis();
  if (!redis) return { ok: true, remaining: LOGIN_RATE_LIMIT };

  const key = `ratelimit:login:${ip || 'unknown'}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, LOGIN_RATE_WINDOW_SECONDS);
  }

  if (count > LOGIN_RATE_LIMIT) {
    const ttl = await redis.ttl(key);
    return { ok: false, remaining: 0, retryAfter: Math.max(ttl, 1) };
  }

  return { ok: true, remaining: Math.max(LOGIN_RATE_LIMIT - count, 0) };
}

export function clientIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}
