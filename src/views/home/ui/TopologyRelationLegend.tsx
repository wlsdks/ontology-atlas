"use client";

import { useTranslations } from "next-intl";

/**
 * 지도 우하단 상시 계기 — 선 인코딩(spine/terminal · quality stroke) 을
 * 설명하는 유일한 표면이라 first-run 여부와 무관하게 항상 켜져 있는다
 * (W3 분석 보기 은퇴 — 이전에는 `TopologyAnalysisBar` overview 모드 안에만
 * 있어 그 모드를 벗어나면 선 의미를 잃어버렸다). `FirstRunReadout` 과 같은
 * 계기 판독 문법(mono 소문자, uppercase tracking, dot 구분)을 쓰지만 그
 * 컴포넌트의 가시성(정적 모드 + 미dismiss)에는 묶이지 않는다 — 렌더 위치는
 * `HomePage` 가 같은 bottom-right 스택 안에 둘을 나란히 배치한다.
 */
export function TopologyRelationLegend() {
  const t = useTranslations("topology.analysis");

  return (
    <div
      data-testid="topology-relation-legend"
      className="pointer-events-none hidden items-center gap-3.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-text-quaternary)] md:flex"
    >
      <span className="flex items-center gap-2">
        <span aria-hidden className="relative h-2.5 w-8 shrink-0">
          <span className="absolute left-0 right-1 top-1/2 h-px -translate-y-1/2 rounded-full bg-[color:var(--topology-relation-spine-halo)]" />
          <span className="absolute right-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-[color:var(--topology-relation-spine-terminal)]" />
        </span>
        {t("overviewRelationLegendSpine")}
      </span>
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-[2px] w-8 shrink-0 rounded-full"
          style={{
            backgroundImage:
              "linear-gradient(90deg, var(--topology-relation-stroke-strong), var(--topology-relation-stroke-weak))",
          }}
        />
        {t("overviewRelationLegendQuality")}
      </span>
    </div>
  );
}
