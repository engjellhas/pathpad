import { isMasterAuthorized } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const ok = await isMasterAuthorized(request);
  return NextResponse.json({ ok });
}
