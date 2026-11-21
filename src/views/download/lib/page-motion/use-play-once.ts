'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useMotionPaused } from '@/shared/motion/motion-pause';

/** The share of a block that must be on screen before its entrance plays. */
const VISIBLE_SHARE = 0.2;

type Run = { animations: Animation[] } | 'still';

/**
 * Plays a block's entrance once, while at least a fifth of it is on screen in a visible tab and
 * the page's motion is not paused; off screen it holds where it is and never restarts.
 *
 * `build` returns the block's Web Animations, each with `fill: 'backwards'` so the finished block
 * is the markup's own style. They are created paused at their first frame while the block is still
 * below the fold. A block already on screen when the script arrives keeps the finished drawing the
 * server sent, as does every block under reduced motion or without an observer: the reader never
 * sees a drawn block jump back to its start.
 */
export function usePlayOnce<T extends Element>(build: (node: T) => Animation[]): (node: T | null) => void {
  const stopped = useMotionPaused();
  const stoppedRef = useRef(stopped);
  const buildRef = useRef(build);
  const sync = useRef<() => void>(() => {});
  const cleanup = useRef<() => void>(() => {});

  useEffect(() => {
    buildRef.current = build;
  });

  useEffect(() => {
    stoppedRef.current = stopped;
    sync.current();
  }, [stopped]);

  useEffect(() => () => cleanup.current(), []);

  return useCallback((node: T | null) => {
    cleanup.current();
    cleanup.current = () => {};
    sync.current = () => {};
    if (!node || typeof IntersectionObserver === 'undefined' || typeof node.animate !== 'function') return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let run: Run | null = null;
    let visible = false;
    const update = () => {
      if (run === null || run === 'still') return;
      const go = visible && !document.hidden && !stoppedRef.current;
      for (const animation of run.animations) {
        if (animation.playState === 'finished') continue;
        if (go) animation.play();
        else animation.pause();
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (run === null) {
          if (entry.isIntersecting) {
            run = 'still';
            observer.disconnect();
            return;
          }
          const animations = buildRef.current(node);
          for (const animation of animations) animation.pause();
          run = { animations };
          void Promise.all(animations.map((animation) => animation.finished))
            .then(() => observer.disconnect())
            .catch(() => {});
        }
        visible = entry.intersectionRatio >= VISIBLE_SHARE;
        update();
      },
      { threshold: [0, VISIBLE_SHARE] },
    );
    observer.observe(node);
    document.addEventListener('visibilitychange', update);
    sync.current = update;
    cleanup.current = () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      if (run && run !== 'still') for (const animation of run.animations) animation.cancel();
    };
  }, []);
}
