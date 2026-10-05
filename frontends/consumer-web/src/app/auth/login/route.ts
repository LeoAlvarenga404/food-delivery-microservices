import type { NextRequest, NextResponse } from 'next/server';
import { startLogin } from '../../../session/keycloak-login.adapter.ts';

export function GET(request: NextRequest): Promise<NextResponse> {
  return startLogin(request.nextUrl.searchParams.get('returnTo'));
}
