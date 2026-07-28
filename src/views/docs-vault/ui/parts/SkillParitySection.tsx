"use client";

import { useTranslations } from "next-intl";
import { Copy, GitCompareArrows } from "lucide-react";

import type { SkillParityModel, SkillParityRow } from "../../lib/skill-parity";

/**
 * 「내 스킬 사본이 서로 일치하는가」 — 읽기 전용.
 *
 * ## 이 화면의 일 한 문장
 *
 * *같은 스킬의 두 사본이 갈렸는지 한 눈에 보고, 고치는 일은 에이전트에게 넘긴다.*
 *
 * ## 왜 일치한 줄은 조용한가
 *
 * **모든 객체가 받는 마크는 0비트다.** 11개 전부에 「일치」 배지를 달면 그
 * 배지는 아무것도 말하지 않는다. 그래서 어긋난 줄만 표식을 갖고, 일치한 줄은
 * 이름만 남는다 — 눈이 가야 할 곳이 하나뿐이다.
 *
 * 어긋남이 0이면 목록은 접혀 있고 헤더 한 줄만 남는다. "확인했고 문제 없다"
 * 는 사실 자체는 값이 있지만(안 그리면 확인한 적 없는 것과 구별이 안 된다),
 * 그 사실이 열한 줄을 차지할 이유는 없다.
 *
 * ## 고치기는 여기 없다
 *
 * 자동 동기화 버튼도, 본문 diff 도 없다(PO 카운슬 OUT 목록). **어느 사본이
 * 최신인지는 파일이 모르고 사람이 안다.** 화면이 임의로 한쪽을 정본으로
 * 정하면 어제 배운 규율을 조용히 지울 수 있다. 대신 넘길 문장을 복사해 준다 —
 * 사람은 판정하고 에이전트가 고친다.
 *
 * 헌장 준수 — 무채색 + 신호 톤 warning(amber, 미결 주의 상태) 하나. glow /
 * gradient / particle 없음.
 */
export function SkillParitySection({
  model,
  onCopyHandoff,
}: {
  model: SkillParityModel;
  /** 넘길 문장 복사 — 호출부가 실제 명령을 만든다(이 컴포넌트는 문자열을 짓지 않는다). */
  onCopyHandoff: (rows: SkillParityRow[]) => void;
}) {
  const t = useTranslations("skillParity");
  if (model.rows.length === 0) return null;

  const disagreeing = model.rows.filter((row) => row.verdict !== "agreed");

  return (
    <section
      data-testid="docs-sidebar-skill-parity"
      className="flex-none border-b border-[color:var(--color-overlay-2)] pb-1"
    >
      <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-3" title={t("headerHint")}>
        <GitCompareArrows
          size={10}
          className="flex-none text-[color:var(--color-text-quaternary)]"
          aria-hidden
        />
        <span className="flex-1 font-mono text-caption uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
          {t("header")}
        </span>
        {disagreeing.length > 0 ? (
          <span
            data-testid="skill-parity-disagreeing-count"
            className="flex-none rounded-full border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] px-1.5 font-mono text-caption tabular-nums text-[color:var(--color-amber-source-a90)]"
          >
            {t("disagreeingCount", { count: disagreeing.length })}
          </span>
        ) : (
          <span
            data-testid="skill-parity-all-agreed"
            className="flex-none font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]"
          >
            {t("allAgreed", { count: model.rows.length })}
          </span>
        )}
      </div>

      {/* 어긋난 줄만 그린다 — 일치한 열한 줄은 읽을 것이 없다. */}
      {disagreeing.length > 0 ? (
        <>
          <ul aria-label={t("listAria")} className="flex flex-col gap-0.5 px-2">
            {disagreeing.map((row) => (
              <li
                key={row.name}
                data-testid={`skill-parity-row-${row.name}`}
                data-verdict={row.verdict}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-body text-[color:var(--color-text-tertiary)]"
              >
                <span className="min-w-0 flex-1 truncate" title={row.files.join("\n")}>
                  {row.name}
                </span>
                <span className="flex-none rounded-sm border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] px-1 font-mono text-caption text-[color:var(--color-amber-source-a90)]">
                  {row.verdict === "diverged"
                    ? t("verdict.diverged")
                    : t("verdict.oneSided", { tree: row.presentIn[0] ?? "" })}
                </span>
              </li>
            ))}
          </ul>
          <div className="px-3 pb-1 pt-1.5">
            <button
              type="button"
              data-testid="skill-parity-copy-handoff"
              onClick={() => onCopyHandoff(disagreeing)}
              className="inline-flex items-center gap-1.5 rounded-chip px-1.5 py-1 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]"
            >
              <Copy size={11} aria-hidden className="flex-none" />
              {t("copyHandoff")}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
