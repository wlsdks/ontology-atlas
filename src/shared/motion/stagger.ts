'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { MOTION, STAGGER } from './tokens';

export const STAGGER_MAX_STEPS = 3;

const ENTRANCE_WINDOW_MS = (STAGGER_MAX_STEPS * STAGGER + MOTION.base.duration) * 1000;

type StaggerRole = 'rise' | 'fade';

interface StaggerEntry {
  owner: object;
  ids: ReadonlySet<string>;
  done: boolean;
}

const seen = new Map<string, StaggerEntry>();

export function staggerDelaySeconds(index: number): number {
  return Math.min(Math.max(index, 0), STAGGER_MAX_STEPS) * STAGGER;
}

export function resetStaggerSessionForTests(): void {
  seen.clear();
}

interface StaggerOnceArgs {
  vaultKey: string;
  listKey: string;
  ids: readonly string[];
  role?: StaggerRole;
}

interface StaggerItemProps {
  className?: string;
  style?: CSSProperties;
}

const NONE: StaggerItemProps = {};

export function useStaggerOnce({ vaultKey, listKey, ids, role = 'rise' }: StaggerOnceArgs) {
  const owner = useRef<object>({});
  const [entering, setEntering] = useState<ReadonlySet<string> | null>(null);
  const key = `${vaultKey}:${listKey}`;
  const hasIds = ids.length > 0;
  const idsRef = useRef(ids);
  useLayoutEffect(() => {
    idsRef.current = ids;
  });

  useLayoutEffect(() => {
    if (!hasIds) return undefined;
    const existing = seen.get(key);
    if (existing && (existing.done || existing.owner !== owner.current)) return undefined;
    const entry = existing ?? { owner: owner.current, ids: new Set(idsRef.current), done: false };
    seen.set(key, entry);
    setEntering(entry.ids);
    const timer = window.setTimeout(() => {
      entry.done = true;
      setEntering(null);
    }, ENTRANCE_WINDOW_MS);
    return () => {
      window.clearTimeout(timer);
      setEntering(null);
    };
  }, [key, hasIds]);

  const className = role === 'fade' ? 'motion-stagger-fade' : 'motion-stagger-in';
  return (id: string, index: number): StaggerItemProps => {
    if (!entering?.has(id)) return NONE;
    return {
      className,
      style: { '--motion-stagger-index': Math.min(index, STAGGER_MAX_STEPS) } as CSSProperties,
    };
  };
}
