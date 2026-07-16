'use client';

import { ThemeProvider } from '@/lib/theme';
import { VaultProvider } from '@/lib/vault';
import type { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <VaultProvider>{children}</VaultProvider>
    </ThemeProvider>
  );
}
