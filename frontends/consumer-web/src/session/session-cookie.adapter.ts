import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextResponse } from 'next/server';
import { z } from 'zod';
import { readConsumerWebConfiguration } from '../consumer-web.config.ts';
import { openCookieValue, sealCookieValue } from './encrypted-cookie.adapter.ts';

export const sessionCookieName = 'consumer-web-session';

const sessionSchema = z.object({
  accessToken: z.string().min(1),
  idToken: z.string().min(1),
  accessTokenExpiresAtInMilliseconds: z.int(),
  expiresAtInMilliseconds: z.int(),
});

export type Session = z.infer<typeof sessionSchema>;

const millisecondsPerSecond = 1000;

export function openSession(
  secret: string,
  sealed: string | undefined,
  nowInMilliseconds: number,
): Session | undefined {
  if (sealed === undefined) return undefined;
  const parsed = sessionSchema.safeParse(openCookieValue(secret, sessionCookieName, sealed));
  if (!parsed.success || parsed.data.expiresAtInMilliseconds <= nowInMilliseconds) return undefined;
  return parsed.data;
}

export function setSessionCookie(response: NextResponse, secret: string, session: Session): void {
  const lifetimeInMilliseconds = session.expiresAtInMilliseconds - Date.now();
  response.cookies.set({
    name: sessionCookieName,
    value: sealCookieValue(secret, sessionCookieName, session),
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(0, Math.floor(lifetimeInMilliseconds / millisecondsPerSecond)),
  });
}

export async function readSession(): Promise<Session | undefined> {
  const sealed = (await cookies()).get(sessionCookieName)?.value;
  const { sessionSecret } = readConsumerWebConfiguration(process.env);
  return openSession(sessionSecret, sealed, Date.now());
}

export async function readAccessToken(): Promise<string | undefined> {
  const session = await readSession();
  const hasValidAccessToken =
    session !== undefined && session.accessTokenExpiresAtInMilliseconds > Date.now();
  return hasValidAccessToken ? session.accessToken : undefined;
}

export function redirectToSignIn(returnPath: string): never {
  redirect(`/auth/login?${new URLSearchParams([['returnTo', returnPath]]).toString()}`);
}

export async function requireAccessToken(returnPath: string): Promise<string> {
  return (await readAccessToken()) ?? redirectToSignIn(returnPath);
}
