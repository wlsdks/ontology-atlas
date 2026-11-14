'use client';

import { motion } from 'framer-motion';

import { MOTION, STAGGER } from '@/shared/motion';
import { FeatureStagePulse, type FeatureStageMotion } from '@/shared/ui';

import type { AppCodingTool } from '../model/app-coding-tools';
import { ProductMark } from './settings-primitives';

const VIEW = { width: 320, height: 240 };
const TOOL_X = 44;
const TOOL_YS = [48, 120, 192];
const PANEL = { x: 168, y: 24, width: 136, height: 192 };
const JOIN_Y = PANEL.y + PANEL.height / 2;
const REPLY_WIDTHS = [96, 80, 56];

/** Three coding tools on the left joining one conversation panel on the right: the tools the app finds, talked to in one place. */
export function AgentConversationArtwork({ arriving, engaged, reduced, tools }: FeatureStageMotion & { tools: readonly AppCodingTool[] }) {
  const beat = MOTION.slow.duration;
  const after = (index: number, step: number) => reduced ? MOTION.fast : { ...MOTION.expressive, delay: beat * step + STAGGER * index };
  return <div data-agent-artwork className="relative aspect-[4/3] w-full">
    <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} className="absolute inset-0 size-full" fill="none">
      <motion.g initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={after(0, 1)}>
        <rect {...PANEL} rx="12" fill="var(--color-panel)" stroke="var(--color-border-strong)" />
        <rect x={PANEL.x + 16} y={PANEL.y + 18} width="48" height="8" rx="4" fill="var(--color-text-tertiary)" />
      </motion.g>
      {TOOL_YS.map((toolY, index) => {
        const wire = `M${TOOL_X + 22} ${toolY}C${TOOL_X + 70} ${toolY} ${PANEL.x - 48} ${JOIN_Y} ${PANEL.x} ${JOIN_Y}`;
        return <g key={toolY}>
          <motion.path d={wire} stroke={engaged ? 'var(--color-indigo-line-a54)' : 'var(--color-indigo-line-a35)'} strokeWidth="2"
            initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={after(index, 2)} />
          <FeatureStagePulse d={wire} delay={beat * 4 + STAGGER * index} engaged={engaged} reduced={reduced} />
        </g>;
      })}
      <motion.circle cx={PANEL.x} cy={JOIN_Y} r="5" fill="var(--color-indigo-accent)"
        initial={reduced ? false : { opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={after(0, 3)} />
      <motion.rect x={PANEL.x + PANEL.width - 88} y={PANEL.y + 44} width="72" height="24" rx="12" fill="var(--color-indigo-a24)"
        style={{ transformBox: 'fill-box', originX: 1 }}
        initial={reduced ? false : { opacity: 0, scaleX: 0.6 }} animate={{ opacity: 1, scaleX: 1 }} transition={after(0, 3)} />
      {REPLY_WIDTHS.map((width, line) => <motion.rect key={width} x={PANEL.x + 16} y={PANEL.y + 92 + line * 16} width={width} height="6" rx="3"
        fill="var(--color-overlay-3)" style={{ transformBox: 'fill-box', originX: 0 }}
        initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={after(line, 4)} />)}
    </svg>
    {tools.slice(0, TOOL_YS.length).map((tool, index) => <motion.span key={tool.id}
      className="absolute flex -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${(TOOL_X / VIEW.width) * 100}%`, top: `${(TOOL_YS[index] / VIEW.height) * 100}%` }}
      initial={reduced ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: engaged ? 6 : 0 }}
      transition={reduced ? MOTION.fast : arriving ? { ...MOTION.expressive, delay: STAGGER * index } : MOTION.settle}>
      <ProductMark icon={tool.icon} ink={tool.brandInk} monogram={tool.name} />
    </motion.span>)}
  </div>;
}
