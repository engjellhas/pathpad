import { clearSessionCookie, destroySession, readSessionTokenFromRequest } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const token = readSessionTokenFromRequest(request);
  await destroySession(token);
  const response = NextResponse.json({ ok: true });
  return clearSessionCookie(response);
}
