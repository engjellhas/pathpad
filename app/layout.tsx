import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pathpad',
  description: 'Private path-based notepad with autosave',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
