import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Private Notes',
  description: 'Tiny private path-based notepad',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
