'use client';

import { Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { cn } from '@/shared/lib/cn';
import { setMotionPaused, useMotionPaused } from '@/shared/motion/motion-pause';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

/**
 * The pause for motion that starts by itself, shared by the download page and looping stages.
 * Under reduced motion nothing loops, so the control has nothing to stop and is not offered.
 */
export function MotionToggle({ className, testId }: { className?: string; testId: string }) {
  const t = useTranslations('download.motion');
  const paused = useMotionPaused();
  const reduced = usePrefersReducedMotion();
  if (reduced) return null;
  const Icon = paused ? Play : Pause;
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={paused}
      onClick={() => setMotionPaused(!paused)}
      className={cn(controlClass({ shape: 'link', tone: 'secondary', hoverInk: 'strong' }), className)}
    >
      <Icon size={ICON_SIZE.sm} aria-hidden />
      <span>{paused ? t('play') : t('pause')}</span>
    </button>
  );
}
