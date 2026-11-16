'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';

import { MCP_TOOL_COUNT } from '../lib/release-facts';
import type { StageGraph } from '../lib/stage-graph';

const COUNT_UP_MS = 1400;

/**
 * Share of each count to show, 0 to 1. The numbers are final until a script sees the strip below
 * the fold; then they wait at zero and count up once when it is seen. A strip already in view, and
 * reduced motion, keep the final numbers.
 */
function useCountUp(): [(node: HTMLElement | null) => void, number] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [share, setShare] = useState(1);

  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let first = true;
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries[entries.length - 1].isIntersecting;
        if (!seen) {
          setShare(0);
          first = false;
          return;
        }
        observer.disconnect();
        if (first) return;
        const start = performance.now();
        const step = (now: number) => {
          const linear = Math.min(1, (now - start) / COUNT_UP_MS);
          setShare(1 - (1 - linear) ** 3);
          if (linear < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { rootMargin: '0px 0px -15% 0px', threshold: 0 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [node]);

  return [setNode, share];
}

/**
 * Three counts the repository can prove: the MCP tools (`release-facts.test.ts` counts the
 * definitions) and the concepts and relations of the committed map the loop section reads.
 */
export function ProofNumbers({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download.numbers');
  const format = useFormatter();
  const [strip, share] = useCountUp();
  const rows = [
    { key: 'tools', value: MCP_TOOL_COUNT },
    { key: 'concepts', value: graph.nodes.length },
    { key: 'relations', value: graph.edges.length },
  ] as const;

  return (
    <section
      aria-label={t('label')}
      data-testid="gateway-numbers"
      className={cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)] w-full')}
    >
      <ul ref={strip} className={cn(PAGE_COLUMN, '@container grid min-w-0 gap-y-8 sm:grid-cols-3')}>
        {rows.map((row) => (
          <li
            key={row.key}
            className="min-w-0 border-l border-[color:var(--color-border-soft)] pl-6"
          >
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-3">
              <span className="sr-only">{format.number(row.value)}</span>
              <span
                aria-hidden
                data-token="engraved-numeral"
                className="text-monument font-[var(--font-weight-signature)] tabular-nums tracking-[var(--tracking-monument)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
              >
                {format.number(Math.round(row.value * share))}
              </span>
              <span className="text-title leading-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {t(`${row.key}.label`)}
              </span>
            </p>
            <p className="mt-2 max-w-[20rem] text-body leading-body text-[color:var(--color-text-tertiary)]">
              {t(`${row.key}.body`)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
