'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { FolderGit2 } from 'lucide-react';
import { MOTION, STAGGER } from '@/shared/motion';
import { Button, FeatureStage, FeatureStagePulse, GetAppLink, type FeatureStageMotion } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

const HISTORY_X = 52;
const BAR_X = 132;
const COMMIT_YS = [64, 96, 128, 160, 192, 224, 256];
/** Which bar each commit joins; bar length is its commit count, so the largest group leads. */
const COMMIT_GROUP = [0, 0, 0, 0, 1, 1, 2];
const BARS = [{ y: 112, width: 168 }, { y: 184, width: 84 }, { y: 248, width: 42 }];

/** History on the left, each change drawn into the group it joins, the groups measured as bars: what Changes does with merged work. */
function DigestArtwork({ arriving, engaged, reduced }: FeatureStageMotion) {
  const draw = reduced ? MOTION.fast : MOTION.choreography;
  return <div className="relative aspect-square">
    <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full text-[color:var(--color-indigo-line-a32)]" fill="none">
      <motion.path d={`M${HISTORY_X} 40v248`} stroke="currentColor" strokeWidth="2" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={draw} />
      <FeatureStagePulse d={`M${HISTORY_X} 40v248`} delay={MOTION.choreography.duration} engaged={engaged} reduced={reduced} />
      {COMMIT_YS.map((y, index) => {
        const bar = BARS[COMMIT_GROUP[index]];
        return <motion.path key={`link-${y}`} d={`M${HISTORY_X + 6} ${y}C${HISTORY_X + 44} ${y} ${BAR_X - 40} ${bar.y} ${BAR_X - 8} ${bar.y}`} stroke="currentColor" strokeWidth="1" strokeOpacity="0.6"
          initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={reduced ? MOTION.fast : { ...MOTION.slow, delay: MOTION.base.duration + index * STAGGER }} />;
      })}
      {COMMIT_YS.map((y, index) => <motion.circle key={y} cx={HISTORY_X} cy={y} r="5" fill="var(--color-canvas)" stroke="currentColor" strokeWidth="2"
        initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }}
        transition={reduced ? MOTION.fast : { ...MOTION.base, delay: index * STAGGER }} />)}
      {BARS.map((bar, index) => <motion.rect key={bar.y} x={BAR_X} y={bar.y - 9} height="18" rx="3" width={bar.width}
        fill={index === 0 ? 'var(--color-indigo-accent)' : 'var(--color-text-quaternary)'}
        style={{ originX: 0 }}
        initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: engaged && index === 0 ? 1.08 : 1 }}
        transition={reduced ? MOTION.fast : arriving ? { ...MOTION.expressive, delay: MOTION.slow.duration + index * STAGGER * 2 } : MOTION.settle} />)}
    </svg>
  </div>;
}

export function BriefingRepositoryStage({ onChoose }: { onChoose?: () => void }) {
  const t = useTranslations('gitBriefing');
  const nav = useTranslations('navRail');
  return <FeatureStage
    data-testid="briefing-stage"
    data-briefing-state={onChoose ? 'no-repository' : 'app-required'}
    art={state => <DigestArtwork {...state} />}
    title={t('startTitle')}
    body={t(onChoose ? 'startBody' : 'webBody')}
    action={onChoose
      ? <Button size="lg" data-briefing-choose onClick={onChoose}><FolderGit2 size={ICON_SIZE.lg} aria-hidden />{t('chooseRepository')}</Button>
      : <GetAppLink data-testid="briefing-get-app">{nav('getApp')}</GetAppLink>}
  />;
}
