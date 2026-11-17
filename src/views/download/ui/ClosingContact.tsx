'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

import { MAKER_LINKEDIN_URL } from '@/shared/config/social-links';
import { cn } from '@/shared/lib/cn';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { useMotionPaused } from '@/shared/motion/motion-pause';
import { MOTION } from '@/shared/motion/tokens';
import { controlClass } from '@/shared/ui/control-class';
import { WORK_ROW_FRAMES } from '@/shared/ui/marks/moru-rows';

/** Moru's acted `write` row at its native 128px cell, the catalogue clip `pnpm brand:sprites` copies. */
const CELL = 128;
const FRAMES = WORK_ROW_FRAMES.write;
const ROW_SRC = '/brand/mascot-write-row-128.png';
/** The work rows' pace (`.atlas-waiting-mark[data-moru-pace='work']`): sixteen base beats per row. */
const ROW_MS = MOTION.base.duration * 1000 * 16;
const VISIBLE_SHARE = 0.2;

/**
 * The maker's direct line, with Moru writing beside it. The row starts and ends on the neutral
 * pose, so one pass rests where it began: Moru writes once when the line comes into view and
 * again when the link is pointed at or focused, never cutting a pass short to start another.
 * Off screen or under the page's pause a pass holds where it is; under reduced motion Moru stands
 * still on the first cell. The way into Moru's game lives in the hero (`MoruPlayEntry`).
 */
export function ClosingContact({ className }: { className?: string }) {
  const t = useTranslations('footer.contact');
  const reducedMotion = usePrefersReducedMotion();
  const stopped = useMotionPaused();
  const row = useRef<HTMLDivElement>(null);
  const sprite = useRef<HTMLSpanElement>(null);
  const pass = useRef<Animation | null>(null);
  const state = useRef({ visible: false, stopped, played: false });

  const go = useCallback(() => !document.hidden && state.current.visible && !state.current.stopped, []);

  const hold = useCallback(() => {
    const current = pass.current;
    if (!current || current.playState === 'finished') return;
    if (go()) current.play();
    else current.pause();
  }, [go]);

  const write = useCallback(() => {
    const node = sprite.current;
    if (reducedMotion || !node || typeof node.animate !== 'function' || !go()) return;
    if (pass.current && pass.current.playState !== 'finished') return;
    state.current.played = true;
    pass.current = node.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(${-CELL * FRAMES}px)` }],
      { duration: ROW_MS, easing: `steps(${FRAMES}, end)` },
    );
  }, [go, reducedMotion]);

  useEffect(() => {
    state.current.stopped = stopped;
    hold();
  }, [stopped, hold]);

  useEffect(() => {
    const node = row.current;
    if (reducedMotion || !node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        state.current.visible = entries[entries.length - 1].intersectionRatio >= VISIBLE_SHARE;
        if (!state.current.played) write();
        else hold();
      },
      { threshold: [0, VISIBLE_SHARE] },
    );
    observer.observe(node);
    const update = () => (state.current.played ? hold() : write());
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      pass.current?.cancel();
    };
  }, [reducedMotion, write, hold]);

  return (
    <div ref={row} data-testid="gateway-closing-contact" className={cn('flex min-w-0 flex-wrap items-center gap-x-6 gap-y-4', className)}>
      <div className="flex min-w-0 flex-1 basis-80 items-center gap-6">
        <span aria-hidden className="relative block size-32 shrink-0 overflow-hidden">
          <span
            ref={sprite}
            data-moru-motion="write"
            className="absolute top-0 left-0 block h-32"
            style={{
              width: CELL * FRAMES,
              backgroundImage: `url(${withBasePath(ROW_SRC)})`,
              backgroundSize: `${CELL * FRAMES}px ${CELL}px`,
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
            }}
          />
        </span>
        <p className="min-w-0 text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
          {t('lead')}{' '}
          <a
            href={MAKER_LINKEDIN_URL}
            target="_blank"
            rel="noreferrer noopener me"
            data-testid="gateway-closing-contact-link"
            onPointerEnter={write}
            onFocus={write}
            className={controlClass({
              shape: 'link',
              tone: 'accent',
              hoverInk: 'strong',
              className: 'touch-hit-expand gap-1.5 whitespace-nowrap text-body-lg leading-body-lg',
            })}
          >
            <span aria-hidden data-external-link-marker>
              ↗
            </span>
            {t('link')}
          </a>
        </p>
      </div>
    </div>
  );
}
