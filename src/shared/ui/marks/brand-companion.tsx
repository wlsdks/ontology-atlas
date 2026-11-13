'use client';

import { useEffect, useRef, useState } from 'react';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { IconButton } from '../controls/controls';
import timeline from './moru-companion.json';
import { companionMotion } from './moru-companion-motion';

/** Decorative company on entry/download screens, never evidence of work or progress. */
export type CompanionLabels = { pause: string; resume: string; still: string };

export function BrandCompanion({ labels }: { labels: CompanionLabels }) {
  const ref = useRef<HTMLImageElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const actor = useRef<HTMLButtonElement>(null);
  const facing = useRef<HTMLSpanElement>(null);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const pauseRef = useRef(paused);
  const playback = useRef<(() => void) | null>(null);

  useEffect(() => {
    pauseRef.current = paused || hovered || focused;
    playback.current?.();
  }, [paused, hovered, focused]);

  useEffect(() => {
    const image = ref.current;
    const bounds = stage.current, body = actor.current, face = facing.current;
    if (!image || !bounds || !body || !face || reducedMotion || typeof image.animate !== 'function' || typeof IntersectionObserver === 'undefined') return;
    const motion = companionMotion(Math.max(0, bounds.clientWidth - timeline.cell));
    const options = { duration: motion.duration, iterations: Infinity };
    const animations = [image.animate(motion.sprite, options), body.animate(motion.movement, options), face.animate(motion.facing, options)];
    let visible = false;
    const update = () => {
      for (const animation of animations) {
        if (visible && !document.hidden && !pauseRef.current) animation.play();
        else animation.pause();
      }
    };
    update();
    playback.current = update;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting === true;
      update();
    });
    observer.observe(bounds);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      const next = companionMotion(Math.max(0, bounds.clientWidth - timeline.cell));
      (animations[1].effect as KeyframeEffect).setKeyframes(next.movement);
    });
    resize?.observe(bounds);
    document.addEventListener('visibilitychange', update);
    return () => {
      playback.current = null;
      observer.disconnect();
      resize?.disconnect();
      document.removeEventListener('visibilitychange', update);
      for (const animation of animations) animation.cancel();
    };
  }, [reducedMotion]);

  return (
    <div ref={stage} className="relative h-32 w-full min-w-32 overflow-hidden" data-moru-playground="">
    <IconButton ref={actor}
      label={labels[reducedMotion ? 'still' : paused ? 'resume' : 'pause']}
      size="lg"
      tone="muted"
      className="absolute top-0 left-0 w-32 shrink-0 overflow-hidden"
      style={{ height: timeline.cell }}
      onClick={() => setPaused(value => !value)}
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
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
      </span>
    </IconButton>
    </div>
  );
}
