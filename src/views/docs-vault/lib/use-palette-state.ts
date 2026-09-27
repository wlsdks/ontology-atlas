'use client';

import { Dispatch, SetStateAction, useCallback, useState } from 'react';

/**
 * The ⌘K palette state for `DocsVaultPage`. Setters are `useCallback`-wrapped so ESLint can
 * track a destructured method's stability.
 */
export function usePaletteState() {
  const [paletteQuery, setPaletteQueryInternal] = useState<string | null>(null);
  const paletteOpen = paletteQuery !== null;

  const setPaletteQuery = useCallback<Dispatch<SetStateAction<string | null>>>(
    (next) => setPaletteQueryInternal(next),
    [],
  );

  const togglePalette = useCallback((seed: string = '') => {
    setPaletteQueryInternal((q) => (q === null ? seed : null));
  }, []);

  const closePalette = useCallback(() => {
    setPaletteQueryInternal(null);
  }, []);

  return {
    paletteQuery,
    setPaletteQuery,
    paletteOpen,
    togglePalette,
    closePalette,
  };
}
