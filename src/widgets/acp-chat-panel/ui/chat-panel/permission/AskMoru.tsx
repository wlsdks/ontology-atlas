'use client';

import { useEffect, useState } from 'react';

import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { BrandWaitingMark } from '@/shared/ui/marks/moru/brand-waiting-mark';
import { ASK_ROW_FRAMES, type AskMotion } from '@/shared/ui/marks/moru/moru-rows';

/**
 * Moru above a permission ask. A new clip fades in over the one it replaces, which keeps playing
 * until it is gone, so a change of clip never cuts a gesture short on screen. He leaves at the
 * window height where the slot halves the card, so the path keeps its room.
 */
export function AskMoru({ motion }: { motion: AskMotion }) {
  const reducedMotion = usePrefersReducedMotion();
  const [drawn, setDrawn] = useState<readonly AskMotion[]>([motion]);
  if (!drawn.includes(motion)) setDrawn([...drawn, motion]);

  useEffect(() => {
    // A row first loads when its clip first plays; warm them so a swap never fades in a blank.
    for (const row of Object.keys(ASK_ROW_FRAMES)) new Image().src = withBasePath(`/brand/mascot-${row}-row-128.png`);
  }, []);

  return (
    <span data-testid="acp-permission-moru" className="inline-grid [@media(max-height:800px)]:hidden">
      {(reducedMotion ? [motion] : drawn).map((clip) => (
        <span
          key={clip}
          data-ask-clip={clip === motion ? 'current' : 'leaving'}
          className={`col-start-1 row-start-1 inline-flex transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)] ${clip === motion ? 'opacity-100 starting:opacity-0' : 'opacity-0'}`}
          onTransitionEnd={(event) => {
            if (event.target !== event.currentTarget) return;
            setDrawn((current) => current.filter((kept) => kept === motion || kept !== clip));
          }}
        >
          <BrandWaitingMark active scale={2} motion={clip} />
        </span>
      ))}
    </span>
  );
}
