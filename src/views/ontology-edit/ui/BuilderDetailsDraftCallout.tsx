"use client";

import { useTranslations } from "next-intl";

/**
 * 상세 시트(모바일/좁은 화면) 안, 임시 초안이 있을 때 뜨는 배너 — 저장 상태
 * 팝오버를 여는 지름길. (OntologyEditPage.tsx A4 분해 — 기능/props 무변,
 * 물리 이동만.)
 */
export function BuilderDetailsDraftCallout({
  draftNodes,
  draftEdges,
  onOpenWriteSummary,
}: {
  draftNodes: number;
  draftEdges: number;
  onOpenWriteSummary: () => void;
}) {
  const t = useTranslations("ontologyPages.edit.page");
  if (draftNodes === 0 && draftEdges === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--color-indigo-a22)] bg-[color:var(--color-indigo-a07)] px-4 py-2.5 motion-safe:animate-[atlasStatusIn_180ms_ease-out]">
      <div className="flex min-w-0 items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-accent)]"
        />
        <div className="min-w-0">
          <p className="truncate text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t("detailsDraftStatusTitle", {
              nodes: draftNodes,
              edges: draftEdges,
            })}
          </p>
          <p className="mt-0.5 hidden truncate text-caption leading-4 text-[color:var(--color-text-tertiary)] sm:block">
            {t("detailsDraftStatusBody")}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenWriteSummary}
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--color-indigo-a32)] bg-[color:var(--color-indigo-a13)] px-2.5 text-caption font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a52)] hover:bg-[color:var(--color-indigo-a20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
      >
        {t("detailsDraftStatusAction")}
      </button>
    </div>
  );
}
