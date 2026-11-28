import { Pause, Play } from 'lucide-react';

import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { cn } from '@/shared/lib/cn';
import { setMotionPaused, useMotionPaused } from '@/shared/motion/motion-pause';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

/**
 * The download page's pause for motion that starts by itself. Under reduced motion nothing
 * loops, so the control has nothing to stop and is not offered.
 */
interface MotionPauseLabels {
  pause: string;
  play: string;
}

export function MotionToggle({ labels, className, testId }: { labels: MotionPauseLabels; className?: string; testId: string }) {
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
      <span>{paused ? labels.play : labels.pause}</span>
    </button>
  );
}
