'use client';

import { useEffect, useState } from 'react';

export type InViewMotion = 'paused' | 'running' | undefined;

/**
 * A CSS loop's switch: `running` while the block is at least 20% visible in a visible tab,
 * `paused` otherwise. It stays undefined without a script and under reduced motion, so the
 * stylesheet, which animates only under a set attribute, leaves the block still and complete.
 */
export function useInViewMotion(): [(node: HTMLElement | null) => void, InViewMotion] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [motion, setMotion] = useState<InViewMotion>(undefined);

  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let seen = false;
    const update = () => setMotion(seen && !document.hidden ? 'running' : 'paused');
    const observer = new IntersectionObserver(
      (entries) => {
        seen = entries[entries.length - 1].isIntersecting;
        update();
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [node]);

  return [setNode, motion];
}
