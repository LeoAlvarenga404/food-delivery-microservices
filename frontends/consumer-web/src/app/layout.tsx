import type { ReactNode } from 'react';
import { readSession } from '../session/session-cookie.adapter.ts';

export const metadata = { title: 'Food Delivery' };

const pageStyle = {
  fontFamily: 'sans-serif',
  maxWidth: '48rem',
  margin: '0 auto',
  padding: '1rem',
};

function SessionLink({ isSignedIn }: { readonly isSignedIn: boolean }): ReactNode {
  if (!isSignedIn) return <a href="/auth/login">Sign in</a>;
  return (
    <form action="/auth/logout" method="post" style={{ display: 'inline' }}>
      <button type="submit">Sign out</button>
    </form>
  );
}

export default async function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactNode> {
  const session = await readSession();
  return (
    <html lang="en">
      <body style={pageStyle}>
        <nav>
          <a href="/">Search</a> | <a href="/cart">Cart</a> | <a href="/profile">Profile</a> |{' '}
          <SessionLink isSignedIn={session !== undefined} />
        </nav>
        {children}
      </body>
    </html>
  );
}
