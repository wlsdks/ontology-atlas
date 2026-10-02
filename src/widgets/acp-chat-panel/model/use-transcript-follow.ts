'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import {
  FOLLOWING,
  afterScroll,
  afterUpwardIntent,
  afterWrite,
  followStep,
  resumeFollowing,
  showsJump,
  type FollowState,
  type ScrollBox,
} from './transcript-follow';

const UPWARD_KEYS = new Set(['ArrowUp', 'PageUp', 'Home']);
const WHEEL_LINE_PX = 40;
const FRAME_MS = 1000 / 60;
const MAX_STEP_MS = 64;

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement
    && (target.isContentEditable || target.matches('input, textarea, select'))
  );
}

/**
 * Keeps `scrollerRef` on its end while the person is there. Growth of `contentRef`, its one child,
 * is observed after layout, so nothing runs per chunk and a reader higher up is never written.
 */
export function useTranscriptFollow({
  scrollerRef,
  contentRef,
  reducedMotion,
}: {
  scrollerRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  reducedMotion: boolean;
}): { jumpVisible: boolean; follow: () => void; restore: () => void } {
  const stateRef = useRef<FollowState>(FOLLOWING);
  /** Mount, being shown again, or another conversation: the next follow lands at once. */
  const restoreRef = useRef(true);
  const reducedMotionRef = useRef(reducedMotion);
  useLayoutEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);
  const [jumpVisible, setJumpVisible] = useState(false);
  const resumeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    let frame = 0;
    let lastStepAt = 0;
    let holding = false;
    let jumpShown = false;
    let lastClientHeight = scroller.clientHeight;
    let lastScrollHeight = scroller.scrollHeight;
    const read = (): ScrollBox => ({
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
    });
    const syncJump = (box: ScrollBox) => {
      const next = showsJump(stateRef.current, box);
      if (next === jumpShown) return;
      jumpShown = next;
      setJumpVisible(next);
    };
    const halt = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastStepAt = 0;
    };
    // One clock: a frame's timestamp and `performance.now()` need not share an origin.
    const step = () => {
      frame = 0;
      const now = performance.now();
      const state = stateRef.current;
      if (!state.following || holding) {
        lastStepAt = 0;
        return;
      }
      const box = read();
      if (box.clientHeight === 0) return;
      if (box.scrollTop < state.lastTop - 0.5) {
        // It went up before its scroll event arrived: only the person does that.
        stateRef.current = { following: false, lastTop: box.scrollTop };
        lastStepAt = 0;
        syncJump(box);
        return;
      }
      const elapsedMs = lastStepAt === 0 ? FRAME_MS : Math.min(now - lastStepAt, MAX_STEP_MS);
      const top = followStep(box, {
        instant: restoreRef.current || reducedMotionRef.current,
        elapsedMs,
      });
      restoreRef.current = false;
      if (top === null) {
        lastStepAt = 0;
        return;
      }
      scroller.scrollTop = top;
      stateRef.current = afterWrite(stateRef.current, scroller.scrollTop);
      lastStepAt = now;
      frame = requestAnimationFrame(step);
    };
    const run = () => {
      if (frame || holding || !stateRef.current.following) return;
      step();
    };
    const stopForIntent = () => {
      const next = afterUpwardIntent(stateRef.current, read());
      if (next === stateRef.current) return;
      stateRef.current = next;
      halt();
      syncJump(read());
    };
    const onScroll = () => {
      const box = read();
      stateRef.current = afterScroll(stateRef.current, box, box.scrollHeight - lastScrollHeight);
      lastScrollHeight = box.scrollHeight;
      syncJump(box);
      if (stateRef.current.following) run();
      else halt();
    };
    const onWheel = (event: WheelEvent) => {
      // A pinch is a ctrl-wheel and zooms.
      if (event.ctrlKey || event.deltaY >= 0 || !stateRef.current.following) return;
      stopForIntent();
      if (stateRef.current.following) return;
      // WebKit scrolls a wheel off the main thread, and a queued follow write lands over it.
      event.preventDefault();
      scroller.scrollTop += event.deltaY * (event.deltaMode === 1 ? WHEEL_LINE_PX : event.deltaMode === 2 ? scroller.clientHeight : 1);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const upward = UPWARD_KEYS.has(event.key) || (event.key === ' ' && event.shiftKey);
      if (!upward || event.defaultPrevented || isEditable(event.target)) return;
      stopForIntent();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target !== scroller && !isEditable(event.target)) stopForIntent();
    };
    const onTouchEnd = () => {
      holding = false;
      syncJump(read());
      run();
    };
    const onTouchStart = (event: TouchEvent) => {
      holding = true;
      halt();
      // Text React replaces mid-touch releases the touch on the detached node, off the scroller.
      event.target?.addEventListener('touchend', onTouchEnd, { once: true, passive: true });
      event.target?.addEventListener('touchcancel', onTouchEnd, { once: true, passive: true });
    };
    const observer = new ResizeObserver(() => {
      const box = read();
      lastScrollHeight = box.scrollHeight;
      if (box.clientHeight !== lastClientHeight) {
        // Shown again, or squeezed from below by a card: keep the tail in view at once.
        if (lastClientHeight === 0 || box.clientHeight < lastClientHeight) restoreRef.current = true;
        lastClientHeight = box.clientHeight;
      }
      syncJump(box);
      run();
    });
    observer.observe(content);
    observer.observe(scroller);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('wheel', onWheel, { passive: false });
    scroller.addEventListener('keydown', onKeyDown);
    scroller.addEventListener('focusin', onFocusIn);
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchend', onTouchEnd, { passive: true });
    scroller.addEventListener('touchcancel', onTouchEnd, { passive: true });
    resumeRef.current = () => {
      stateRef.current = resumeFollowing(stateRef.current);
      syncJump(read());
      run();
    };
    return () => {
      halt();
      observer.disconnect();
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('keydown', onKeyDown);
      scroller.removeEventListener('focusin', onFocusIn);
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchend', onTouchEnd);
      scroller.removeEventListener('touchcancel', onTouchEnd);
      resumeRef.current = null;
    };
  }, [contentRef, scrollerRef]);

  const follow = useCallback(() => {
    stateRef.current = resumeFollowing(stateRef.current);
    resumeRef.current?.();
  }, []);
  const restore = useCallback(() => {
    restoreRef.current = true;
    stateRef.current = resumeFollowing(stateRef.current);
    resumeRef.current?.();
  }, []);
  return { jumpVisible, follow, restore };
}
