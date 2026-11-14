'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { FileCode2, FolderGit2, GitCommitHorizontal, GitPullRequest } from 'lucide-react';
import { MOTION, STAGGER } from '@/shared/motion';
import { Button, FeatureStage, FeatureStagePulse, GetAppLink, type FeatureStageMotion } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

const BRANCH_YS = [76, 160, 244];

/** One history line that forks into the three ways the briefing reads it; the line draws first, then each reading lands on its commit. */
function BriefingArtwork({ arriving, engaged, reduced, labels }: FeatureStageMotion & { labels: { icon: typeof GitPullRequest; label: string }[] }) {
  const lineDraw = reduced ? MOTION.fast : MOTION.choreography;
  return <div className="relative aspect-square">
    <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full text-[color:var(--color-indigo-line-a32)]" fill="none">
      <motion.path d="M52 44v232M52 76c0 50 54 4 54 58v112M52 244c0-50 54-4 54-58V76" stroke="currentColor" strokeWidth="2"
        initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={lineDraw} />
      <FeatureStagePulse d="M52 44v232" delay={MOTION.choreography.duration} engaged={engaged} reduced={reduced} />
      {BRANCH_YS.map((y, index) => <motion.circle key={y} cx="52" cy={y} r="6" fill="var(--color-canvas)" stroke="currentColor" strokeWidth="2"
        initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }}
        transition={reduced ? MOTION.fast : { ...MOTION.base, delay: MOTION.slow.duration * (index + 1) }} />)}
    </svg>
    <div className="absolute inset-y-6 right-0 left-20 flex flex-col justify-around gap-4 text-left">
      {labels.map(({ icon: Icon, label }, index) => <motion.div key={label}
        initial={reduced ? false : { opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: engaged ? (index === 1 ? -6 : 6) : 0 }}
        transition={reduced ? MOTION.fast : arriving ? { ...MOTION.expressive, delay: MOTION.slow.duration * (index + 1) + STAGGER } : MOTION.settle}
        className="flex items-center gap-3 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] bg-[linear-gradient(180deg,var(--color-overlay-2),transparent_60%)] px-4 py-5 shadow-[var(--shadow-elevation-1)]">
        <Icon size={ICON_SIZE.lg} className="text-[color:var(--color-indigo-accent)]" />
        <span className="text-body-lg font-[var(--font-weight-strong)]">{label}</span>
      </motion.div>)}
    </div>
  </div>;
}

export function BriefingRepositoryStage({ onChoose }: { onChoose?: () => void }) {
  const t = useTranslations('gitBriefing');
  const nav = useTranslations('navRail');
  const review = useTranslations('prBriefing');
  const labels = [
    { icon: GitPullRequest, label: review('prTab') },
    { icon: GitCommitHorizontal, label: review('commitsTab') },
    { icon: FileCode2, label: review('filesTab') },
  ];
  return <FeatureStage
    data-testid="briefing-stage"
    data-briefing-state={onChoose ? 'no-repository' : 'app-required'}
    art={state => <BriefingArtwork {...state} labels={labels} />}
    title={t('startTitle')}
    body={t(onChoose ? 'startBody' : 'webBody')}
    action={onChoose
      ? <Button size="lg" data-briefing-choose onClick={onChoose}><FolderGit2 size={ICON_SIZE.lg} aria-hidden />{t('chooseRepository')}</Button>
      : <GetAppLink data-testid="briefing-get-app">{nav('getApp')}</GetAppLink>}
    note={onChoose ? t('startHint') : undefined}
  />;
}
