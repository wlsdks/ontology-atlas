'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { CircleHelp, FileImage, FileText, FolderOpen, LockKeyhole } from 'lucide-react';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION, OVERLAY_RISE, OVERLAY_SETTLED } from '@/shared/motion';
import { Button, GetAppLink, IconButton } from '@/shared/ui';
import { Tooltip } from '@/shared/ui/hints/tooltip';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { PlanningSourceArtwork } from './PlanningSourceArtwork';

type PlanningDoor =
  | { kind: 'choose'; onChoose: () => void; unavailable: boolean }
  | { kind: 'unsupported'; offersApp: boolean };

export function PlanningFolderStage({ door }: { door: PlanningDoor }) {
  const nav = useTranslations('navRail');
  const t = useTranslations('planning');
  const reduced = usePrefersReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const engaged = !reduced && (hovered || focused);

  return <motion.section
    data-testid="planning-stage"
    data-planning-state={door.kind === 'choose' ? 'no-folder' : 'unsupported'}
    data-reduced-motion={reduced}
    initial={reduced ? false : OVERLAY_RISE}
    animate={OVERLAY_SETTLED}
    transition={reduced ? MOTION.fast : MOTION.expressive}
    className="my-auto grid w-full items-center gap-8 py-6 md:grid-cols-[minmax(0,1fr)_22rem] md:gap-10"
  >
    <div className="min-w-0">
      <h2 className="max-w-sm text-hero leading-hero font-[var(--font-weight-signature)] tracking-[var(--tracking-display)]">{t('startTitle')}</h2>
      <p className="mt-4 max-w-sm text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">{t(door.kind === 'choose' ? 'startBody' : 'browserUnavailable')}</p>
      {door.kind === 'choose' && door.unavailable && <p role="alert" className="mt-4 text-body text-[color:var(--color-text-primary)]">{t('folderUnavailable')}</p>}
      {(door.kind === 'choose' || door.offersApp) && <div className="mt-7 flex"
        onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
        {door.kind === 'choose'
          ? <Button size="lg" data-planning-choose onClick={door.onChoose}><FolderOpen size={ICON_SIZE.lg} aria-hidden />{t('chooseFolder')}</Button>
          : <GetAppLink data-testid="planning-get-app">{nav('getApp')}</GetAppLink>}
      </div>}
      <div className="mt-3 flex items-center gap-2 text-body text-[color:var(--color-text-secondary)]">
        <LockKeyhole size={ICON_SIZE.sm} aria-hidden /><span>{t('readOnly')}</span>
        <Tooltip side="bottom" align="start" toggleOnPress panelClassName="w-72 max-w-[calc(100vw-2rem)] whitespace-normal break-words"
          content={<div className="space-y-2 text-body"><p>{t('chooseBody')}</p><p>{t('limits')}</p></div>}
        ><IconButton label={t('details')} size="md" hoverInk="strong" className="atlas-touch-floor atlas-touch-floor-wide"><CircleHelp size={ICON_SIZE.lg} aria-hidden /></IconButton></Tooltip>
      </div>
    </div>
    <div className="order-first mx-auto w-full max-w-xs md:order-last md:max-w-sm">
      <PlanningSourceArtwork active={engaged} reduced={reduced} imageLabel={t('designImages')} />
      <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-body text-[color:var(--color-text-secondary)]">
        <span className="inline-flex items-center gap-2"><FileText size={ICON_SIZE.sm} aria-hidden />Markdown</span>
        <span className="inline-flex items-center gap-2"><FileImage size={ICON_SIZE.sm} aria-hidden />{t('designImages')}</span>
      </div>
    </div>
  </motion.section>;
}
