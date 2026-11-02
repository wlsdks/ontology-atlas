'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { CircleHelp, FileImage, FileText, FolderOpen, LockKeyhole } from 'lucide-react';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION, OVERLAY_RISE, OVERLAY_SETTLED } from '@/shared/motion';
import { Button, IconButton } from '@/shared/ui';
import { Tooltip } from '@/shared/ui/hints/tooltip';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

export function PlanningFolderStage({ onChoose, unavailable }: { onChoose: () => void; unavailable: boolean }) {
  const t = useTranslations('planning');
  const reduced = usePrefersReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const engaged = !reduced && (hovered || focused);
  const transition = reduced ? { duration: 0 } : MOTION.settle;

  return <motion.section
    data-planning-state="no-folder"
    data-reduced-motion={reduced}
    initial={reduced ? false : OVERLAY_RISE}
    animate={OVERLAY_SETTLED}
    transition={reduced ? MOTION.fast : MOTION.expressive}
    className="my-auto grid w-full items-center gap-6 py-6 md:grid-cols-[minmax(0,1fr)_20rem] md:gap-10"
  >
    <div className="min-w-0">
      <h2 className="max-w-sm break-keep text-hero leading-hero font-[var(--font-weight-signature)] tracking-[var(--tracking-display)]">{t('startTitle')}</h2>
      <p className="mt-4 max-w-sm break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">{t('startBody')}</p>
      {unavailable && <p role="alert" className="mt-4 text-body text-[color:var(--color-text-primary)]">{t('folderUnavailable')}</p>}
      <Button size="lg" data-planning-choose className="mt-7"
        onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onClick={onChoose}
      ><FolderOpen size={ICON_SIZE.lg} aria-hidden />{t('chooseFolder')}</Button>
      <div className="mt-3 flex items-center gap-2 text-body text-[color:var(--color-text-secondary)]">
        <LockKeyhole size={ICON_SIZE.sm} aria-hidden /><span>{t('readOnly')}</span>
        <Tooltip side="bottom" align="start" toggleOnPress panelClassName="w-72 max-w-[calc(100vw-2rem)] whitespace-normal break-words"
          content={<div className="space-y-2 text-body"><p>{t('chooseBody')}</p><p>{t('limits')}</p></div>}
        ><IconButton label={t('details')} size="md" hoverInk="strong" className="atlas-touch-floor atlas-touch-floor-wide"><CircleHelp size={ICON_SIZE.lg} aria-hidden /></IconButton></Tooltip>
      </div>
    </div>
    <div className="order-first mx-auto w-full max-w-xs md:order-last">
      <svg data-planning-folder-scene aria-hidden viewBox="0 0 320 260" className="w-full overflow-visible">
        <path d="M40 92 Q40 80 52 80 H116 L136 102 H266 Q278 102 278 114 V214 Q278 226 266 226 H52 Q40 226 40 214 Z" fill="var(--color-indigo-a16)" stroke="var(--color-indigo-line-a35)" />
        <motion.g data-planning-paper="document" initial={false} animate={{ y: engaged ? -16 : 0, rotate: engaged ? -8 : -4 }} transition={transition} style={{ transformOrigin: '120px 160px' }}>
          <rect x="66" y="40" width="112" height="150" rx="8" fill="var(--color-panel)" stroke="var(--color-border-strong)" />
          <path d="M86 65 H128 M86 83 H156 M86 95 H156 M86 107 H139" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="3" strokeLinecap="round" />
          <rect x="86" y="126" width="70" height="36" rx="4" fill="var(--color-overlay-2)" />
        </motion.g>
        <motion.g data-planning-paper="image" initial={false} animate={{ y: engaged ? -12 : 0, rotate: engaged ? 8 : 4 }} transition={transition} style={{ transformOrigin: '212px 164px' }}>
          <rect x="154" y="62" width="108" height="132" rx="8" fill="var(--color-panel)" stroke="var(--color-border-strong)" />
          <rect x="170" y="78" width="76" height="66" rx="4" fill="var(--color-indigo-a10)" />
          <circle cx="227" cy="96" r="7" fill="var(--color-indigo-line-a35)" />
          <path d="M170 134 L192 109 L210 126 L222 115 L246 140 V144 H170 Z" fill="var(--color-indigo-a32)" />
          <path d="M171 161 H219 M171 173 H203" stroke="var(--color-text-tertiary)" strokeWidth="3" strokeLinecap="round" />
        </motion.g>
        <motion.path initial={false} animate={{ y: engaged ? 4 : 0 }} transition={transition}
          d="M34 143 Q32 132 44 132 H276 Q288 132 286 143 L272 218 Q270 230 258 230 H62 Q50 230 48 218 Z"
          fill="var(--color-panel)" stroke="var(--color-indigo-line-a54)" />
        <motion.path initial={false} animate={{ y: engaged ? 4 : 0 }} transition={transition}
          d="M34 143 Q32 132 44 132 H276 Q288 132 286 143 L272 218 Q270 230 258 230 H62 Q50 230 48 218 Z"
          fill="var(--color-indigo-a16)" />
      </svg>
      <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2 text-body text-[color:var(--color-text-secondary)]">
        <span className="inline-flex items-center gap-2"><FileText size={ICON_SIZE.sm} aria-hidden />Markdown</span>
        <span className="inline-flex items-center gap-2"><FileImage size={ICON_SIZE.sm} aria-hidden />{t('designImages')}</span>
      </div>
    </div>
  </motion.section>;
}
