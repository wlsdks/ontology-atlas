"use client";

import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import type { ConceptEgo } from "../model/build-concept-ego";
import { ConceptEgoCard } from "./ConceptEgoCard";

/**
 * 한 커밋이 **무엇을 바꿨나** — 해시·원문 + 바뀐 개념 + 고른 개념의 성질/이웃.
 *
 * `StepList` 의 펼침 영역 안에 인라인으로 살던 것을 뺐다. 2단 작업대에서는
 * 이 내용이 **오른쪽 열**로 가야 하는데, 목록 행 안에 있으면 옮길 수가 없다.
 * 지금은 추출만 하고 자리는 그대로다 — 옮기는 것은 다음 슬라이스다.
 */
export interface CommitConcept {
  id: string;
  label: string;
  kind: string;
}

export function CommitDetail({
  t,
  hash,
  isoTime,
  subject,
  concepts,
  focusedConceptId,
  setFocusedConceptId,
  egoFor,
  kindLabel,
}: {
  t: (key: string, values?: Record<string, string | number>) => string;
  hash: string;
  isoTime: string;
  subject: string;
  concepts: readonly CommitConcept[];
  focusedConceptId: string | null;
  setFocusedConceptId: (id: string) => void;
  egoFor: (nodeId: string) => ConceptEgo | null;
  kindLabel: (kind: string) => string;
}) {
  const focused = focusedConceptId ?? concepts[0]?.id ?? null;
  return (
    <div
      className="git-fade-in flex flex-col gap-0.5 pb-1.5 pl-1.5"
      data-testid="atlas-git-history-detail"
    >
      <p className="font-mono text-caption break-all text-[color:var(--color-text-quaternary)]">
        {t("historyItemDetail", { hash, isoTime })}
      </p>
      {/* 원문 — 터미널·저장소 페이지에서 다시 마주칠 문자열이다. */}
      <p className="font-mono text-caption break-all text-[color:var(--color-text-quaternary)]">
        {subject}
      </p>
      {concepts.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          {/* 개념이 둘 이상이면 **무엇을 볼지 고르는 축**이 필요하다.
              「첫 개념만」은 나머지를 볼 길이 없고, 전부 펼치면 overview-first
              를 어긴다 — 칩이 그 선택기다. */}
          {concepts.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {concepts.map((concept) => (
                <button
                  key={concept.id}
                  type="button"
                  data-testid="atlas-git-concept-chip"
                  aria-pressed={focused === concept.id}
                  onClick={() => setFocusedConceptId(concept.id)}
                  className="inline-flex min-h-6 items-center gap-1.5 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] px-2 py-0.5 text-label text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)] aria-pressed:border-[color:var(--color-indigo-a46)] aria-pressed:bg-[color:var(--color-indigo-a16)] aria-pressed:text-[color:var(--color-text-primary)]"
                >
                  <TopologyV2KindGlyph kind={concept.kind} size={11} />
                  {concept.label}
                </button>
              ))}
            </div>
          ) : null}
          {focused ? (
            <ConceptEgoCard
              ego={egoFor(focused)}
              t={t}
              kindLabel={kindLabel}
              onSelect={setFocusedConceptId}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
