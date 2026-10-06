import { Link, Outlet } from '@tanstack/react-router';
import type { ReactNode } from 'react';

const pageStyle = {
  fontFamily: 'sans-serif',
  maxWidth: '48rem',
  margin: '0 auto',
  padding: '1rem',
};

export function PortalLayout({ signOutUrl }: { readonly signOutUrl: string }): ReactNode {
  return (
    <div style={pageStyle}>
      <nav>
        <Link to="/">Your restaurants</Link> |{' '}
        <Link to="/restaurants/new">Onboard a restaurant</Link> | <a href={signOutUrl}>Sign out</a>
      </nav>
      <Outlet />
    </div>
  );
}
