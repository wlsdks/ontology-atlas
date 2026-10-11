'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Open/close state for a dropdown or popover: a ref for its own region, close on an
 * outside pointerdown, close on Escape, and listener cleanup.
 *
 * **Why it lives in `shared/lib`.** It was written inside `views/docs-vault` as
 * `useAdvancedMenu`, whose own comment set the condition for promotion: *"Promote it to
 * `shared/lib` once a second view with a dropdown or popover can reuse it."* The rail's
 * vault switcher (`features/vault-switch`) is that second consumer, and a feature cannot
 * import a view, so the condition is met and the move is the one the note asked for.
 * `views/docs-vault/lib/use-advanced-menu.ts` now re-exports this under the old name,
 * leaving its existing call sites untouched.
 *
 * Reimplementing the same 25 lines in the second consumer is the alternative this avoids,
 * and it is the worse one: the two copies would drift on exactly the properties
 * `shared/ui/transient-surface.ts` exists to keep uniform - whether Escape closes, and
 * whether a press inside the surface counts as outside.
 */
export function useDismissibleMenu() {
  const [open, setOpenInternal] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  /**
   * A second region that counts as inside, for a surface that is not a DOM descendant of its trigger:
   * a portalled popover (needed to escape the rail's stacking context) would otherwise dismiss on the
   * first press inside it. Null for callers that do not portal.
   */
  const surfaceRef = useRef<HTMLElement | null>(null);
  // ESLint's react-hooks/exhaustive-deps cannot track the stability of a useState setter
  // returned as an object method, so the `useCallback` wrapper states it is ref-stable. A
  // setState setter is stable by construction, so there is no functional effect.
  const setOpen = useCallback<typeof setOpenInternal>(
    (next) => setOpenInternal(next),
    [],
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (ref.current?.contains(target) || surfaceRef.current?.contains(target)) {
        return;
      }
      setOpenInternal(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenInternal(false);
    };
    /*
     * A resize closes it: a portalled surface is placed from its trigger's rect measured once at open,
     * and below `lg` the rail hides, which would leave an orphan popover with no trigger.
     */
    const handleResize = () => setOpenInternal(false);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [open]);

  return { open, setOpen, ref, surfaceRef };
}
