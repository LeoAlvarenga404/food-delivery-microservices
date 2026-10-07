import { Link, Outlet } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export function DisplayLayout({ signOutUrl }: { readonly signOutUrl: string }): ReactNode {
  return (
    <>
      <nav>
        <Link to="/">Your restaurants</Link> | <a href={signOutUrl}>Sign out</a>
      </nav>
      <Outlet />
    </>
  );
}
