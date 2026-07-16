'use client';

import { useTheme } from '@/lib/theme';

export default function ThemeToggle({ className = 'ghost' }: { className?: string }) {
  const { mode, cycle } = useTheme();
  const label = mode === 'system' ? 'Theme: Auto' : mode === 'dark' ? 'Theme: Dark' : 'Theme: Light';

  return (
    <button className={className} type="button" onClick={cycle} title="Cycle theme">
      {label}
    </button>
  );
}
