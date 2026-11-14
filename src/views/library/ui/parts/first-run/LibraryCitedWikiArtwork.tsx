'use client';

import { motion } from 'framer-motion';
import { FileText, Presentation, Table2 } from 'lucide-react';

import { MOTION, STAGGER } from '@/shared/motion';
import type { FeatureStageMotion } from '@/shared/ui';

const SOURCES = [
  { icon: FileText, tileY: 52, citeY: 103 },
  { icon: Presentation, tileY: 132, citeY: 163 },
  { icon: Table2, tileY: 212, citeY: 223 },
];
const TILE = { x: 16, width: 64, height: 56 };
const PAGE = { x: 176, y: 40, width: 128, height: 240 };

/** Three source files on the left, one wiki page on the right; each paragraph's mark is tied back to the file it cites. */
export function LibraryCitedWikiArtwork({ arriving, engaged, reduced, sourcesLabel, wikiLabel }: FeatureStageMotion & { sourcesLabel: string; wikiLabel: string }) {
  const beat = MOTION.slow.duration;
  const after = (index: number, step: number) => reduced ? MOTION.fast : { ...MOTION.expressive, delay: beat * step + STAGGER * index };
  return <div data-library-artwork>
    <svg viewBox="0 0 320 300" className="w-full" fill="none">
      <motion.g initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={after(0, 1)}>
        <rect {...PAGE} rx="12" fill="var(--color-panel)" stroke="var(--color-border-strong)" />
        <rect x={PAGE.x + 20} y={PAGE.y + 22} width="60" height="8" rx="4" fill="var(--color-text-tertiary)" />
      </motion.g>
      {SOURCES.map(({ icon: Icon, tileY, citeY }, index) => {
        const tileMidY = tileY + TILE.height / 2;
        const tileEdge = TILE.x + TILE.width;
        return <g key={tileY}>
          <motion.g
            initial={reduced ? false : { opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: engaged ? 6 : 0 }}
            transition={reduced ? MOTION.fast : arriving ? { ...MOTION.expressive, delay: STAGGER * index } : MOTION.settle}
          >
            <rect {...TILE} y={tileY} rx="10" fill="var(--color-overlay-1)" stroke="var(--color-border-soft)" />
            <Icon x={TILE.x + 20} y={tileY + 16} width="24" height="24" className="text-[color:var(--color-text-secondary)]" />
          </motion.g>
          <motion.path
            d={`M${tileEdge + 6} ${tileMidY}C${tileEdge + 54} ${tileMidY} ${PAGE.x - 48} ${citeY} ${PAGE.x} ${citeY}`}
            stroke={engaged ? 'var(--color-indigo-line-a54)' : 'var(--color-indigo-line-a35)'} strokeWidth="2"
            initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={after(index, 2)}
          />
          <motion.circle cx={PAGE.x} cy={citeY} r="5" fill="var(--color-indigo-accent)"
            initial={reduced ? false : { opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={after(index, 3)} />
          {[0, 1].map(line => <motion.rect key={line} x={PAGE.x + 20} y={citeY - 3 + line * 14} width={line === 0 ? 88 : 60} height="6" rx="3"
            fill="var(--color-overlay-3)" style={{ transformBox: 'fill-box', originX: 0 }}
            initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={after(index, 3 + line * 0.5)} />)}
        </g>;
      })}
    </svg>
    <div className="relative mt-2 h-5 text-label text-[color:var(--color-text-tertiary)]">
      <span className="absolute left-[15%] -translate-x-1/2">{sourcesLabel}</span>
      <span className="absolute left-[75%] -translate-x-1/2">{wikiLabel}</span>
    </div>
  </div>;
}
