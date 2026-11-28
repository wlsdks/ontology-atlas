import { type Dispatch, type SetStateAction, useCallback, useState } from 'react';

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
