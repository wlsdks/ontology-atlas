import type { ReactNode } from "react";

/**
 * 인사이트 페이지의 공용 섹션 래퍼 — title/subtitle 헤더 + 무채색(기본) 또는
 * amber accent 보더. OntologyInsightsPage 의 여러 섹션이 공유.
 */
export function Panel({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: "amber";
  children: ReactNode;
}) {
  const accentClass =
    accent === "amber"
      ? "border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.06)]"
      : "border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)]";
  return (
    <section className={`rounded-2xl border px-5 py-4 ${accentClass}`}>
      <header className="mb-3">
        {/* h2 — 인사이트 페이지(h1 "Insights")의 섹션 제목. 시각 스타일은 동일,
            의미만 heading 으로 승격해 12개 섹션의 document outline / 스크린리더
            heading 탐색을 살린다. */}
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-[color:var(--color-text-tertiary)]">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
