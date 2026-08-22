'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The advanced dropdown menu state machine for `DocsVaultPage`: open/setOpen state, a ref for the
 * outer region (for the containment check), close on outside pointerdown (a click inside its own
 * region is ignored), close on Escape, and listener cleanup.
 *
 * It was 25 lines of cross-cutting effect, state, and ref scattered inside the view. Promote it to
 * `shared/lib` once a second view with a dropdown or popover can reuse it — there is one consumer
 * today.
 */
export function useAdvancedMenu() {
  const [open, setOpenInternal] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  // ESLint's react-hooks/exhaustive-deps cannot track the stability of a useState setter returned
  // as an object method, so the `useCallback` wrapper states it is ref-stable. A setState setter is
  // stable by construction, so there is no functional effect.
  const setOpen = useCallback<typeof setOpenInternal>(
    (next) => setOpenInternal(next),
    [],
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && ref.current?.contains(target)) {
        return;
      }
      setOpenInternal(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenInternal(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return { open, setOpen, ref };
}
