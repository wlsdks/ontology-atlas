'use client';

import { Link } from '@/i18n/navigation';
import { ArrowRight, GitBranch, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useVaultOntology } from '../model/use-vault-ontology';

/**
 * 로컬 vault frontmatter 에서 자란 ontology 노드 *간결 리스트* 패널.
 *
 * 통합 트리 / ego 그래프 와는 별개 — vault 안 .md frontmatter 의 `kind:`
 * 가 즉시 노드로 surface 되는 mission v2 모델 ("vault frontmatter 가 곧
 * 그래프, 검수 단계 없음") 의 가시 증명.
 *
 * 디자인 헌장 안: 단일 인디고 + 무채색, 애니메이션 0.
 */
export function VaultOntologyStubsPanel() {
  const t = useTranslations('featuresMisc.vaultStubs');
  const { nodes, edges, warnings } = useVaultOntology();

  if (nodes.length === 0) {
    return (
      <section
        aria-labelledby="vault-stubs-heading"
        className="rounded-2xl border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-6"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[color:var(--color-text-quaternary)]" aria-hidden />
          <h2
            id="vault-stubs-heading"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]"
          >
            {t('headingFallback')}
          </h2>
        </div>
        <p className="mt-3 text-[12.5px] leading-6 text-[color:var(--color-text-tertiary)]">
          {warnings[0] ?? t('emptyBody')}
        </p>
      </section>
    );
  }

  // kind 별 그룹화 — 이 패널은 트리 앞의 보조 compile proof 다. 전체
  // 노드 목록을 다시 펼치면 browse tree 보다 문서 목록 인상이 앞서므로
  // kind census 만 남기고 실제 탐색은 아래 OntologyTreeView 로 넘긴다.
  const byKind = new Map<string, typeof nodes>();
  for (const n of nodes) {
    if (!byKind.has(n.kind)) byKind.set(n.kind, []);
    byKind.get(n.kind)!.push(n);
  }
  const kinds = [...byKind.keys()].sort();

  return (
    <section
      aria-labelledby="vault-stubs-heading"
      className="rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.08)] text-[color:var(--color-indigo-accent)]">
            <GitBranch size={14} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2
              id="vault-stubs-heading"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-indigo-accent)]"
            >
              {t('headingFallback')}
            </h2>
            <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
              {t('intro')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-2)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {t('summary', { nodes: nodes.length, edges: edges.length })}
          </span>
          <Link
            href="/ontology/edit/"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:rgba(94,106,210,0.36)] bg-[color:rgba(94,106,210,0.10)] px-2.5 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.52)] hover:text-[color:var(--color-text-primary)]"
          >
            {t('polishCta')} <ArrowRight size={11} aria-hidden />
          </Link>
        </div>
      </div>

      <details className="mt-2 text-[12px] text-[color:var(--color-text-secondary)]">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)] hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-secondary)] [&::-webkit-details-marker]:hidden">
          <Sparkles size={11} aria-hidden />
          {t('censusSummary', { count: kinds.length })}
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {kinds.map((kind) => (
            <span
              key={kind}
              className="rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-2)] px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]"
            >
              {t('groupSummary', { kind, count: byKind.get(kind)!.length })}
            </span>
          ))}
        </div>
        <p className="mt-2 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
          {t('polishBody')}
        </p>
      </details>
    </section>
  );
}
