import type { NextRequest, NextResponse } from 'next/server';
import { completeLogin } from '../../../session/keycloak-login.adapter.ts';

export function GET(request: NextRequest): Promise<NextResponse> {
  return completeLogin(request);
}
