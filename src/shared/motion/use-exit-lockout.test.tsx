import { render } from '@testing-library/react';
import { AnimatePresence, motion } from 'framer-motion';
import { act, useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { EXIT_TRANSITION, MOTION } from './index';
import { useExitLockout } from './use-exit-lockout';

/**
 * `EXIT_TRANSITION` no longer carries `pointerEvents` (moved here after the CI finding
 * documented in this hook's doc-block), so these tests are the replacement coverage for
 * "a leaving surface stops taking input from its first exit frame."
 */

function Surface({ open }: { open: boolean }) {
  const { ref, onAnimationStart } = useExitLockout<HTMLDivElement>();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          data-testid="surface"
          onAnimationStart={onAnimationStart}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: EXIT_TRANSITION }}
        />
      )}
    </AnimatePresence>
  );
}

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(false)}>
        close
      </button>
      <Surface open={open} />
    </>
  );
}

describe('useExitLockout', () => {
  it('sets pointerEvents: none on the ref node when the exit transition fires', async () => {
    const { getByText, getByTestId } = render(<Harness />);
    const el = getByTestId('surface') as HTMLDivElement;
    expect(el.style.pointerEvents).not.toBe('none');

    await act(async () => {
      getByText('close').click();
      // AnimatePresence dispatches onAnimationStart synchronously with React's commit,
      // but flush a frame the same way the probe measurement did.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(el.style.pointerEvents).toBe('none');
  });

  it('does not lock out a definition whose transition is not EXIT_TRANSITION', () => {
    function EntryOnly() {
      const { ref, onAnimationStart } = useExitLockout<HTMLDivElement>();
      useEffect(() => {
        // An entry's transition is `MOTION.base`, never the shared EXIT_TRANSITION
        // instance — the hook must leave pointer-events alone here.
        onAnimationStart({ opacity: 1, transition: MOTION.base });
      }, [onAnimationStart]);
      return <div ref={ref} data-testid="entry" />;
    }
    const { getByTestId } = render(<EntryOnly />);
    const el = getByTestId('entry') as HTMLDivElement;
    expect(el.style.pointerEvents).not.toBe('none');
  });

  it('ignores a non-object or transition-less definition without throwing', () => {
    function Direct() {
      const { ref, onAnimationStart } = useExitLockout<HTMLDivElement>();
      useEffect(() => {
        onAnimationStart('visible');
        onAnimationStart({ opacity: 0 });
      }, [onAnimationStart]);
      return <div ref={ref} />;
    }
    expect(() => render(<Direct />)).not.toThrow();
  });
});
