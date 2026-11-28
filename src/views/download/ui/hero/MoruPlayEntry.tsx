import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';

import { cn } from '@/shared/lib/cn';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { isMotionPaused } from '@/shared/motion/motion-pause';
import { controlClass } from '@/shared/ui/control-class';

import { registerGatedFrameClient } from '../../lib/page-motion/gateway-frame-loop';
import {
  ENTRY_CELL,
  ENTRY_NEUTRAL,
  ENTRY_ROWS,
  ENTRY_START,
  requestReaction,
  stepEntry,
  type EntryRow,
} from '../../lib/moru-play/moru-entry';
import { MoruPlayground } from './MoruPlayground';

const ROWS = Object.keys(ENTRY_ROWS) as EntryRow[];
const ROW_CELLS = 24;
/**
 * The 64px rows unscaled, so every drawn pixel stays square. The window shows the drawn band
 * (columns 6–62, rows 20–52); the dance's lift rises above it unclipped.
 */
const VIEW = { left: 6, top: 20, width: 56, height: 32 };
const cellShift = (cell: number) => `translateX(${-cell * ENTRY_CELL}px)`;

/**
 * The hero's way into the game: a very small Moru beside a speech bubble saying who it is. Moru
 * waves, then blinks, through the page's gated frame loop, so it holds under the page's pause, off
 * screen and in a background tab; a pointer or focus asks for one dance, which starts on the next
 * neutral pose. Under reduced motion Moru stands on the neutral cell.
 */
export function MoruPlayEntry({ className }: { className?: string }) {
  const t = useTranslations('download.playground');
  const [playing, setPlaying] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const stage = useRef<HTMLSpanElement>(null);
  const state = useRef(ENTRY_START);

  useEffect(() => {
    const node = stage.current;
    if (reducedMotion || !node) return;
    const images = new Map(ROWS.map((row) => [row, node.querySelector<HTMLImageElement>(`[data-moru-row="${row}"]`)]));
    let shown = ENTRY_NEUTRAL;
    return registerGatedFrameClient(node, ({ dtMs }) => {
      const { state: next, pose } = stepEntry(state.current, dtMs);
      state.current = next;
      if (pose.row === shown.row && pose.cell === shown.cell) return;
      const image = images.get(pose.row);
      if (!image) return;
      image.style.transform = cellShift(pose.cell);
      if (pose.row !== shown.row) {
        image.hidden = false;
        const previous = images.get(shown.row);
        if (previous) previous.hidden = true;
      }
      shown = pose;
      node.dataset.moruPose = `${pose.row}:${pose.cell}`;
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
          className: cn('group gap-2.5 rounded-card p-1.5 pr-2 text-left', className),
        })}
      >
        <span aria-hidden className="relative block shrink-0" style={{ width: VIEW.width, height: VIEW.height }}>
          <span
            ref={stage}
            data-moru-entry=""
            data-moru-pose={`${ENTRY_NEUTRAL.row}:${ENTRY_NEUTRAL.cell}`}
            className="absolute block overflow-hidden"
            style={{ left: -VIEW.left, top: -VIEW.top, width: ENTRY_CELL, height: ENTRY_CELL }}
          >
            {ROWS.map((row) => (
              <img
                key={row}
                data-moru-row={row}
                src={withBasePath(ENTRY_ROWS[row])}
                alt=""
                draggable={false}
                hidden={row !== ENTRY_NEUTRAL.row}
                width={ENTRY_CELL * ROW_CELLS}
                height={ENTRY_CELL}
                className="absolute top-0 left-0 max-w-none"
                style={{
                  width: ENTRY_CELL * ROW_CELLS,
                  height: ENTRY_CELL,
                  imageRendering: 'pixelated',
                  transform: cellShift(row === ENTRY_NEUTRAL.row ? ENTRY_NEUTRAL.cell : 0),
                }}
              />
            ))}
          </span>
        </span>
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
