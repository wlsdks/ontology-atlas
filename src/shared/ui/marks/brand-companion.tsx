'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { IconButton } from '../controls/controls';
import { controlClass } from '../control-class';
import { ICON_SIZE } from '../tokens/icon-size';
import timeline from './moru-companion.json';
import reactions from './moru-reactions.json';
import { companionMotion, type CompanionContext } from './moru-companion-motion';
import { companionPlayer } from './moru-companion-player';

/** Decorative company on entry/download screens, never evidence of work or progress. */
export type CompanionLabels = { pause: string; resume: string; still: string; interact: string };

export function BrandCompanion({ labels, context = 'folder' }: { labels: CompanionLabels; context?: CompanionContext }) {
  const ref = useRef<HTMLImageElement>(null);
  const reactionRef = useRef<HTMLImageElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const actor = useRef<HTMLButtonElement>(null);
  const facing = useRef<HTMLSpanElement>(null);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const intent = useRef({ paused, held: false });
  const playback = useRef<ReturnType<typeof companionPlayer> | null>(null);

  useEffect(() => {
    intent.current = { paused, held: hovered || focused };
    playback.current?.update();
  }, [paused, hovered, focused]);

  useEffect(() => {
    const image = ref.current, reactionImage = reactionRef.current;
    const bounds = stage.current, body = actor.current, face = facing.current;
    if (!image || !reactionImage || !bounds || !body || !face) return;
    const motion = companionMotion(Math.max(0, bounds.clientWidth - timeline.cell), context);
    const options = { duration: motion.duration, iterations: Infinity };
    const animations = reducedMotion || typeof image.animate !== 'function' || typeof IntersectionObserver === 'undefined' ? []
      : [image.animate(motion.sprite, options), body.animate(motion.movement, options), face.animate(motion.facing, options)];
    const player = companionPlayer({ image, reactionImage, body, bounds, animations, context, reducedMotion, intent: () => intent.current });
    playback.current = player;
    return () => {
      playback.current = null;
      player.destroy();
    };
  }, [reducedMotion, context]);

  return (
    <div className="flex w-full max-w-48 items-end gap-2">
    <div ref={stage} className="relative h-32 min-w-32 flex-1 overflow-hidden" data-moru-playground="" data-moru-context={context}>
    <button ref={actor}
      type="button" aria-label={labels.interact} title={labels.interact}
      className={controlClass({ shape: 'link', size: 'sm', tone: 'secondary', className: 'absolute top-0 left-0 w-32 shrink-0 overflow-hidden' })}
      style={{ height: timeline.cell }}
      onClick={() => playback.current?.react()}
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
      onFocus={event => setFocused(event.currentTarget.matches(':focus-visible'))} onBlur={() => setFocused(false)}
      onKeyDown={() => setFocused(true)}
      data-moru-companion=""
      data-moru-paused={reducedMotion || paused}
    >
      <span ref={facing} className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Preserve native 128px cells, including jump headroom, instead of enlarging
          the lossy 64px runtime export. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} src={withBasePath(`/brand/moru-companion.png?v=${timeline.digest}`)} alt="" aria-hidden="true" draggable={false}
        width={timeline.cell * timeline.frames} height={timeline.cell}
        className="pointer-events-none absolute top-0 left-0 max-w-none"
        style={{ width: timeline.cell * timeline.frames, height: timeline.cell, imageRendering: 'pixelated' }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={reactionRef} src={withBasePath(`/brand/moru-reactions.png?v=${reactions.digest}`)} alt="" aria-hidden="true" draggable={false} hidden
        width={reactions.cell * reactions.frames} height={reactions.cell}
        className="pointer-events-none absolute top-0 left-0 max-w-none"
        style={{ width: reactions.cell * reactions.frames, height: reactions.cell, imageRendering: 'pixelated' }} />
      </span>
    </button>
    </div>
    <IconButton label={labels[reducedMotion ? 'still' : paused ? 'resume' : 'pause']} size="sm" tone="secondary"
      disabled={reducedMotion} className="atlas-touch-floor atlas-touch-floor-wide mb-4 shrink-0" aria-pressed={paused}
      onClick={() => setPaused(value => !value)}>
      {paused || reducedMotion ? <Play size={ICON_SIZE.sm} aria-hidden /> : <Pause size={ICON_SIZE.sm} aria-hidden />}
    </IconButton>
    </div>
  );
}
