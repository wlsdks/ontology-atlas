'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';

import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION, OVERLAY_RISE, OVERLAY_SETTLED } from '@/shared/motion';

const ARRIVAL_MS = MOTION.choreography.duration * 1000;

/** What the stage tells its artwork: `arriving` for one choreography after mount, `engaged` while the action is hovered or focused. */
export interface FeatureStageMotion {
  arriving: boolean;
  engaged: boolean;
  reduced: boolean;
}

/**
 * A destination with nothing in it yet: one centred column that draws what the feature does, names
 * it, says it in a sentence and offers the one way in. The parent wears `PAGE_STAGE_FILL`.
 */
export function FeatureStage({
  art,
  title,
  body,
  alert,
  action,
  note,
  className,
  ...rest
}: {
  art: (state: FeatureStageMotion) => ReactNode;
  title: ReactNode;
  body: ReactNode;
  alert?: ReactNode;
  action?: ReactNode;
  note?: ReactNode;
  className?: string;
  [data: `data-${string}`]: string | boolean | undefined;
}) {
  const reduced = usePrefersReducedMotion();
  const [arriving, setArriving] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setArriving(false), ARRIVAL_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <motion.section
      {...rest}
      data-feature-stage
      data-reduced-motion={reduced}
      initial={reduced ? false : OVERLAY_RISE}
      animate={OVERLAY_SETTLED}
      transition={reduced ? MOTION.fast : MOTION.expressive}
      className={cn('mx-auto my-auto flex w-full max-w-[var(--measure-stage-column)] flex-col items-center py-6 text-center', className)}
    >
      <div data-feature-stage-art aria-hidden className="w-full max-w-72">
        {art({ arriving: !reduced && arriving, engaged: !reduced && (hovered || focused), reduced })}
      </div>
      <h2 className="mt-8 text-hero leading-hero font-[var(--font-weight-signature)] tracking-[var(--tracking-display)]">{title}</h2>
      <p className="mt-4 max-w-md text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">{body}</p>
      {alert}
      {action ? (
        <div
          className="mt-7 flex justify-center"
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          {action}
        </div>
      ) : null}
      {note ? <div className="mt-3 flex max-w-md items-center justify-center gap-2 text-body text-[color:var(--color-text-secondary)]">{note}</div> : null}
    </motion.section>
  );
}
