'use client';

import { useFormatter, useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';

import { MCP_TOOL_COUNT } from '../lib/release-facts';
import type { StageGraph } from '../lib/stage-graph';

/**
 * Three counts the repository can prove: the MCP tools (`release-facts.test.ts` counts the
 * definitions) and the concepts and relations of the committed map the loop section reads.
 */
export function ProofNumbers({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download.numbers');
  const format = useFormatter();
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
      <ul className={cn(PAGE_COLUMN, '@container grid min-w-0 gap-y-8 sm:grid-cols-3')}>
        {rows.map((row) => (
          <li
            key={row.key}
            className="min-w-0 border-l border-[color:var(--color-border-soft)] pl-6"
          >
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-3">
              <span
                data-token="engraved-numeral"
                className="text-monument font-[var(--font-weight-signature)] tabular-nums tracking-[var(--tracking-monument)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
              >
                {format.number(row.value)}
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
