'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useVaultOntology } from '../model/use-vault-ontology';

/**
 * 로컬 vault 에서 추출한 ontology stub 들을 *간결한 리스트*로 보여주는 패널.
 *
 * 통합 트리 / ego 그래프 와는 별개 — 이건 *fast path* 의 입증용 surface.
 * stub 은 evidence 미부여 (검수 안 됨) 상태로, 사용자가 frontmatter 만으로
 * 즉시 ontology 가 자라는 모습을 보여 mission 약속의 절반을 가시화.
 *
 * 디자인 헌장 안: 단일 인디고 + 무채색, 애니메이션 0.
 */
export function VaultOntologyStubsPanel() {
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
            vault frontmatter ontology
          </h2>
        </div>
        <p className="mt-3 text-[12.5px] leading-6 text-[color:var(--color-text-tertiary)]">
          {warnings[0] ??
            'vault 의 .md 어디에도 frontmatter `kind:` 가 없어 stub 후보가 비어있습니다. 문서 상단에 `kind: project` (또는 capability / element / workflow / decision) 추가 시 즉시 노드로 자랍니다.'}
        </p>
      </section>
    );
  }

  // kind 별 그룹화 — UI 위계 — sorted by kind 알파벳 순.
  const byKind = new Map<string, typeof nodes>();
  for (const n of nodes) {
    if (!byKind.has(n.kind)) byKind.set(n.kind, []);
    byKind.get(n.kind)!.push(n);
  }
  const kinds = [...byKind.keys()].sort();

  return (
    <section
      aria-labelledby="vault-stubs-heading"
      className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[color:var(--color-indigo-accent)]" aria-hidden />
          <h2
            id="vault-stubs-heading"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-indigo-accent)]"
          >
            vault frontmatter ontology
          </h2>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {nodes.length} nodes · {edges.length} relations · stub
        </p>
      </header>
      <p className="mt-2 text-[12px] text-[color:var(--color-text-tertiary)]">
        AI 추출 거치지 않은 fast-path stub. evidence 가 붙으면 정식 ontology fact 로 승격됩니다.
      </p>

      {/* 다음 단계 안내 — vault stub 을 영구 fact 로 만드는 두 path 안내.
          IndexedDB 기반 promote 큐는 후속 (Phase 7+) 으로 미루고, 현재 가능한
          두 우회 경로 (빌더 + cloud 검수) 를 명시. */}
      <details className="mt-3 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-2)] px-3 py-2 text-[12px] text-[color:var(--color-text-secondary)]">
        <summary className="cursor-pointer font-[var(--font-weight-signature)]">
          이 stub 을 어떻게 영구 fact 로 만들까요?
        </summary>
        <div className="mt-2 space-y-2 text-[color:var(--color-text-tertiary)]">
          <p>
            <strong>(1) 빌더에서 직접 그리기</strong> — `/ontology/edit/` 빌더
            캔버스에서 노드와 관계를 직접 추가하면 즉시 영구 저장 (cloud 모드).
          </p>
          <p>
            <strong>(2) cloud 검수 큐</strong> — 추후 도입 예정 (Phase 7+). 현재는
            local stub → cloud 검수 큐 promote path 가 wiring 안 되어 있어, 빌더
            에서 직접 그리는 (1) 경로 추천.
          </p>
          <Link
            href="/ontology/edit/"
            className="inline-flex h-7 items-center gap-1 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.14)] px-3 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)]"
          >
            빌더 열기 <ArrowRight size={11} aria-hidden />
          </Link>
        </div>
      </details>

      <div className="mt-4 space-y-4">
        {kinds.map((kind) => {
          const group = byKind.get(kind)!;
          return (
            <div key={kind}>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
                {kind} · {group.length}
              </p>
              <ul className="mt-2 grid gap-1.5 md:grid-cols-2">
                {group.map((n) => (
                  <li
                    key={n.id}
                    className="flex items-center gap-2 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-2)] px-3 py-1.5"
                  >
                    <span className="truncate text-[13px] text-[color:var(--color-text-primary)]">
                      {n.title}
                    </span>
                    <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                      {n.sourceSlug}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
