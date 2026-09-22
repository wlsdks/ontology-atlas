'use client';

import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { EXIT_TRANSITION, MOTION, useExitLockout } from '@/shared/motion';

/** Only changed facts crossfade. The enclosing control and its focus stay put. */
export function AgentWorkFact({ text }: { text: string }) {
  return (
    <span className="relative grid min-w-0">
      <AnimatePresence initial={false}>
        <Fact key={text} text={text} />
      </AnimatePresence>
    </span>
  );
}

function Fact({ text }: { text: string }) {
  const present = useIsPresent();
  const { ref, onAnimationStart } = useExitLockout<HTMLSpanElement>();
  return (
    <motion.span
      ref={ref}
      onAnimationStart={onAnimationStart}
      aria-hidden={present ? undefined : true}
      className={present ? 'col-start-1 row-start-1 min-w-0 truncate' : 'pointer-events-none absolute inset-0 truncate'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: EXIT_TRANSITION }}
      transition={MOTION.fast}
    >
      {text}
    </motion.span>
  );
}
