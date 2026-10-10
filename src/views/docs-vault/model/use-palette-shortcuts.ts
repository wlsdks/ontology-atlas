'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTypingShortcuts } from '@/shared/lib/use-typing-shortcut';
import { useClaimShellKey } from '@/shared/lib/shell-key-claims';

export function usePaletteShortcuts({
  paletteOpen,
  setPaletteQuery,
}: {
  paletteOpen: boolean;
  setPaletteQuery: Dispatch<SetStateAction<string | null>>;
}) {
  // ⌘K is this workspace's palette, so the shell search stands aside.
  useClaimShellKey('search');
  useTypingShortcuts([
    {
      combo: { key: 'k', meta: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '' : null)),
    },
    {
      combo: { key: 'p', meta: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '' : null)),
    },
    {
      combo: { key: 'o', meta: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '' : null)),
    },
    {
      combo: { key: 'p', meta: true, shift: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '> ' : null)),
    },
    {
      combo: { key: '/' },
      disabled: paletteOpen,
      onFire: () => setPaletteQuery(''),
    },
  ]);
}
