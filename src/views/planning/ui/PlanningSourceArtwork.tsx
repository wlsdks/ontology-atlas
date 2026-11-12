'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileImage, FileText } from 'lucide-react';
import { MOTION } from '@/shared/motion';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

export function PlanningSourceArtwork({ active, reduced, imageLabel }: { active: boolean; reduced: boolean; imageLabel: string }) {
  const [arrived, setArrived] = useState(false);
  const transition = reduced ? { duration: 0 } : active || arrived ? MOTION.settle : MOTION.expressive;
  return <div data-planning-folder-scene aria-hidden className="relative mx-auto aspect-[6/5] w-full max-w-sm">
    <div className="absolute inset-x-6 bottom-4 top-12 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]" />
    <motion.div data-planning-paper="document"
      initial={reduced ? false : { opacity: 0, x: 12, y: 28, rotate: -12 }}
      animate={{ opacity: 1, x: active ? -6 : 0, y: active ? -8 : 0, rotate: active ? -1 : -5 }}
      transition={transition} onAnimationComplete={() => setArrived(true)}
      className="absolute left-3 top-3 w-[62%] rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-2)]"
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--color-border-soft)] px-4 py-3 text-body text-[color:var(--color-text-secondary)]"><FileText size={ICON_SIZE.lg} /><span>Markdown</span></div>
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-2"><span className="text-body font-[var(--font-weight-strong)] text-[color:var(--color-indigo-text-soft)]">#</span><span className="h-2 w-3/4 rounded-micro bg-[color:var(--color-text-tertiary)]" /></div>
        <div className="space-y-2"><div className="h-1.5 rounded-micro bg-[color:var(--color-overlay-3)]" /><div className="h-1.5 rounded-micro bg-[color:var(--color-overlay-3)]" /><div className="h-1.5 w-2/3 rounded-micro bg-[color:var(--color-overlay-3)]" /></div>
        <div className="space-y-2 border-l border-[color:var(--color-indigo-line-a35)] py-1 pl-3"><div className="h-1.5 w-4/5 rounded-micro bg-[color:var(--color-indigo-a32)]" /><div className="h-1.5 w-3/5 rounded-micro bg-[color:var(--color-indigo-a32)]" /></div>
        <div className="text-caption text-[color:var(--color-text-tertiary)]">.md</div>
      </div>
    </motion.div>
    <motion.div data-planning-paper="image"
      initial={reduced ? false : { opacity: 0, x: -12, y: 42, rotate: -8 }}
      animate={{ opacity: 1, x: active ? 6 : 0, y: active ? -6 : 0, rotate: active ? 1 : 6 }}
      transition={transition}
      className="absolute bottom-3 right-0 w-[54%] rounded-panel border border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-2)]"
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--color-border-soft)] px-3 py-3 text-body text-[color:var(--color-text-secondary)]"><FileImage size={ICON_SIZE.lg} /><span>{imageLabel}</span></div>
      <div className="p-3">
        <svg viewBox="0 0 180 130" className="w-full rounded-card" fill="none">
          <rect width="180" height="130" rx="6" fill="var(--color-overlay-2)" />
          <rect x="12" y="12" width="74" height="8" rx="3" fill="var(--color-indigo-a40)" />
          <rect x="12" y="32" width="100" height="62" rx="4" fill="var(--color-indigo-a22)" />
          <rect x="122" y="32" width="46" height="26" rx="4" fill="var(--color-overlay-3)" />
          <rect x="122" y="68" width="46" height="26" rx="4" fill="var(--color-overlay-3)" />
          <rect x="12" y="104" width="92" height="5" rx="2" fill="var(--color-text-tertiary)" />
          <rect x="12" y="115" width="58" height="4" rx="2" fill="var(--color-overlay-3)" />
        </svg>
        <p className="mt-3 text-caption text-[color:var(--color-text-tertiary)]">PNG · JPG</p>
      </div>
    </motion.div>
  </div>;
}
