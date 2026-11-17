'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { isMotionPaused } from '@/shared/motion/motion-pause';
import { controlClass } from '@/shared/ui/control-class';
import companionSheet from '@/shared/ui/marks/moru-companion.json';
import { moruFrame } from '@/shared/ui/marks/moru-frame';

import { registerGatedFrameClient } from '../lib/gateway-frame-loop';
import { ENTRY_NEUTRAL_FRAME, ENTRY_START, requestReaction, stepEntry } from '../lib/moru-entry';
import { MoruPlayground } from './MoruPlayground';

const SHEET = { ...companionSheet, src: `/brand/moru-companion.png?v=${companionSheet.digest}` };
/**
 * The native cell, unscaled, so every drawn pixel stays square. The window shows the cell's
 * drawn band (columns 12–116, rows 38–102); the hop's lift rises above it unclipped.
 */
const VIEW = { left: 12, top: 38, width: 104, height: 64 };

/**
 * The hero's way into the game: a tiny Moru beside a speech bubble saying who it is. Moru idles on
 * its blink and wave clips through the page's gated frame loop, so it holds under the page's pause,
 * off screen and in a background tab; a pointer or focus asks for one hop, which starts on the next
 * neutral pose. Under reduced motion Moru stands on the neutral cell.
 */
export function MoruPlayEntry({ className }: { className?: string }) {
  const t = useTranslations('download.playground');
  const [playing, setPlaying] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const image = useRef<HTMLImageElement>(null);
  const state = useRef(ENTRY_START);

  useEffect(() => {
    const node = image.current;
    if (reducedMotion || !node) return;
    let shown = ENTRY_NEUTRAL_FRAME;
    return registerGatedFrameClient(node, ({ dtMs }) => {
      const step = stepEntry(state.current, dtMs);
      state.current = step.state;
      if (step.frame === shown) return;
      shown = step.frame;
      node.style.transform = moruFrame(step.frame, SHEET);
    });
  }, [reducedMotion]);

  const react = () => {
    if (!reducedMotion && !isMotionPaused()) state.current = requestReaction(state.current);
  };

  return (
    <>
      <button
        type="button"
        data-testid="gateway-hero-play"
        aria-haspopup="dialog"
        onPointerEnter={react}
        onFocus={react}
        onClick={() => setPlaying(true)}
        className={controlClass({
          shape: 'link',
          tone: 'secondary',
          className: cn('group gap-1 rounded-card p-1.5 pr-2 text-left', className),
        })}
      >
        <span aria-hidden className="relative block shrink-0" style={{ width: VIEW.width, height: VIEW.height }}>
          <span
            className="absolute block overflow-hidden"
            style={{ left: -VIEW.left, top: -VIEW.top, width: SHEET.cell, height: SHEET.cell }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={image}
              data-moru-entry=""
              src={withBasePath(SHEET.src)}
              alt=""
              draggable={false}
              width={SHEET.cell * SHEET.columns}
              height={SHEET.cell * SHEET.rows}
              className="absolute top-0 left-0 max-w-none"
              style={{
                width: SHEET.cell * SHEET.columns,
                height: SHEET.cell * SHEET.rows,
                imageRendering: 'pixelated',
                transform: moruFrame(ENTRY_NEUTRAL_FRAME, SHEET),
              }}
            />
          </span>
        </span>
        {/* A speech bubble whose tail points back at Moru. */}
        <span className="relative flex min-w-0 flex-col rounded-card border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] px-3.5 py-2 transition-[border-color,background-color] duration-[var(--motion-fast)] ease-[var(--motion-ease)] group-hover:border-[color:var(--color-indigo-line-a54)] group-hover:bg-[color:var(--color-elevated)] group-focus-visible:border-[color:var(--color-indigo-line-a54)] group-focus-visible:bg-[color:var(--color-elevated)]">
          <span
            aria-hidden
            className="absolute top-1/2 -left-[5px] block size-2 -translate-y-1/2 rotate-45 border-b border-l border-[color:inherit] bg-[color:inherit]"
          />
          <span className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('entryIntro')}</span>
          {' '}
          <span className="text-body leading-body text-[color:var(--color-text-primary)]">{t('entryAction')}</span>
        </span>
      </button>
      <MoruPlayground open={playing} onClose={() => setPlaying(false)} />
    </>
  );
}
