import type { NextRequest, NextResponse } from 'next/server';
import { logout } from '../../../session/keycloak-login.adapter.ts';

export function POST(request: NextRequest): NextResponse {
  return logout(request);
}
