import type { ReactNode } from 'react';

export const metadata = { title: 'Food Delivery' };

const pageStyle = {
  fontFamily: 'sans-serif',
  maxWidth: '48rem',
  margin: '0 auto',
  padding: '1rem',
};

export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body style={pageStyle}>
        <nav>
          <a href="/">Search</a> | <a href="/cart">Cart</a> | <a href="/profile">Profile</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
