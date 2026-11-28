import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';

import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION } from '@/shared/motion';

import { CONSTELLATION_ARRIVAL_MS, MapConstellationArtwork } from './MapConstellationArtwork';

/**
 * The map before it has anything to draw: the constellation it will become, on the same lit plate
 * as `FeatureStage`, with the start card under it as one centred group. The card is the action, so
 * hovering or focusing it engages the artwork. The artwork steps aside on a short window.
 */
export function MapStartStage({ showArt = true, children, ...rest }: {
  showArt?: boolean;
  children: ReactNode;
  [data: `data-${string}`]: string | undefined;
}) {
  const reduced = usePrefersReducedMotion();
  const [arriving, setArriving] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setArriving(false), CONSTELLATION_ARRIVAL_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const engaged = !reduced && (hovered || focused);

  return (
    <div {...rest} className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-4">
      {showArt ? (
        <div
          // Hydration renders once before the preference is known; remounting draws the settled picture instead.
          key={reduced ? 'reduced' : 'moving'}
          data-map-start-art
          data-reduced-motion={reduced}
          aria-hidden
          className="relative mb-8 w-full max-w-[17rem] sm:max-w-[25rem] [@media(max-height:640px)]:hidden"
        >
          <div className="absolute -inset-x-24 -inset-y-12 bg-[radial-gradient(var(--color-overlay-3)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(closest-side,black,transparent)]" />
          <motion.div
            className="absolute -inset-x-16 -inset-y-8 bg-[radial-gradient(closest-side,var(--color-indigo-a24),transparent)]"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: engaged ? 1 : 0.6 }}
            transition={reduced ? MOTION.fast : arriving ? MOTION.choreography : MOTION.slow}
          />
          <div className="relative">
            <MapConstellationArtwork arriving={!reduced && arriving} engaged={engaged} reduced={reduced} />
          </div>
        </div>
      ) : null}
      <div
        className="flex w-full justify-center"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {children}
      </div>
    </div>
  );
}
