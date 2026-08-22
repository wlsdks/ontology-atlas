'use client';

import { Dispatch, SetStateAction, useCallback, useState } from 'react';

/**
 * The ⌘K palette state for `DocsVaultPage`.
 *
 * Encapsulates `paletteQuery` state (string | null), the derived `paletteOpen`, `togglePalette`
 * (with an optional seed), and `closePalette`. A `useTypingShortcuts` call site uses it as
 * `onFire: () => togglePalette()` or `onFire: () => togglePalette('> ')`. `setPaletteQuery` is
 * exposed too, preserving direct setter call sites such as `DocsVaultUnifiedPalette`'s `onClose`
 * and header clicks.
 *
 * The setters are `useCallback`-wrapped (the same pattern as `useAdvancedMenu`) so ESLint can track
 * the stability of a destructured method.
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
