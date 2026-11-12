'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { FileCode2, FolderGit2, GitCommitHorizontal, GitPullRequest } from 'lucide-react';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION, OVERLAY_RISE, OVERLAY_SETTLED } from '@/shared/motion';
import { Button, GetAppLink } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

export function BriefingRepositoryStage({ onChoose }: { onChoose?: () => void }) {
  const t = useTranslations('gitBriefing');
  const nav = useTranslations('navRail');
  const review = useTranslations('prBriefing');
  const reduced = usePrefersReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const engaged = !reduced && (hovered || focused);
  const modes = [
    { icon: GitPullRequest, label: review('prTab') },
    { icon: GitCommitHorizontal, label: review('commitsTab') },
    { icon: FileCode2, label: review('filesTab') },
  ];
  return <motion.section data-testid="briefing-stage" data-briefing-state={onChoose ? 'no-repository' : 'app-required'}
    initial={reduced ? false : OVERLAY_RISE} animate={OVERLAY_SETTLED}
    transition={reduced ? MOTION.fast : MOTION.expressive}
    className="my-auto grid w-full items-center gap-8 py-6 md:grid-cols-[minmax(0,1fr)_20rem] md:gap-10">
    <div className="min-w-0">
      <h2 className={onChoose ? 'max-w-sm text-hero leading-hero font-[var(--font-weight-signature)] tracking-[var(--tracking-display)]' : 'max-w-sm text-title font-[var(--font-weight-signature)]'}>{t('startTitle')}</h2>
      <p className={`${onChoose ? 'mt-4' : 'mt-2'} max-w-sm text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]`}>{t(onChoose ? 'startBody' : 'webBody')}</p>
      <div className={`${onChoose ? 'mt-7' : 'mt-5'} flex`}
        onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
        {onChoose
          ? <Button size="lg" data-briefing-choose onClick={onChoose}><FolderGit2 size={ICON_SIZE.lg} aria-hidden />{t('chooseRepository')}</Button>
          : <GetAppLink data-testid="briefing-get-app">{nav('getApp')}</GetAppLink>}
      </div>
      {onChoose && <p className="mt-3 max-w-sm text-body text-[color:var(--color-text-secondary)]">{t('startHint')}</p>}
    </div>
    <div className="order-first mx-auto w-full max-w-xs md:order-last" aria-hidden>
      <div className="relative aspect-square">
        <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full text-[color:var(--color-indigo-line-a32)]" fill="none">
          <path d="M52 44v232M52 76c0 50 54 4 54 58v112M52 244c0-50 54-4 54-58V76" stroke="currentColor" strokeWidth="2" />
          {[76, 160, 244].map(y => <circle key={y} cx="52" cy={y} r="6" fill="var(--color-canvas)" stroke="currentColor" strokeWidth="2" />)}
        </svg>
        <div className="absolute inset-y-6 right-0 left-20 flex flex-col justify-around gap-4">
          {modes.map(({ icon: Icon, label }, index) => <motion.div key={label}
            initial={false} animate={{ x: engaged ? (index === 1 ? -6 : 6) : 0 }}
            transition={reduced ? MOTION.fast : MOTION.settle}
            className="flex items-center gap-3 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-5 shadow-[var(--shadow-elevation-1)]">
            <Icon size={ICON_SIZE.lg} className="text-[color:var(--color-indigo-accent)]" />
            <span className="text-body-lg font-[var(--font-weight-strong)]">{label}</span>
          </motion.div>)}
        </div>
      </div>
    </div>
  </motion.section>;
}
