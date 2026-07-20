"use client";

import { useTranslations } from "next-intl";
import { useRelationVocabulary } from "@/entities/knowledge-graph";

/**
 * 지도 우하단 상시 계기 — 선 인코딩(spine/terminal · quality stroke) 을
 * 설명하는 유일한 표면이라 first-run 여부와 무관하게 켜져 있는다
 * (W3 분석 보기 은퇴 — 이전에는 `TopologyAnalysisBar` overview 모드 안에만
 * 있어 그 모드를 벗어나면 선 의미를 잃어버렸다). `FirstRunReadout` 과 같은
 * 계기 판독 문법(mono 소문자, uppercase tracking, dot 구분)을 쓰지만 그
 * 컴포넌트의 가시성(정적 모드 + 미dismiss)에는 묶이지 않는다 — 렌더 위치는
 * `HomePage` 가 같은 bottom-right 스택 안에 둘을 나란히 배치한다.
 *
 * "상시" 는 first-run 상태 기준이다 — 뷰포트 기준으로는 `md:flex`
 * (< 768px 는 `hidden`) 로 좁은 화면에서 의도적으로 숨긴다. 좁은 화면은
 * 이 계기를 놓을 여유 공간이 없고, 선 인코딩보다 노드 자체 탐색이
 * 우선이라는 판단(UX 교차검증 라운드, 2026-07-19).
 *
 * P1a-1 (persona 실측 N5 — 표면마다 4벌 관계 어휘): 왼쪽 spine 항목은
 * `contains` 관계 타입 그 자체라 `useRelationVocabulary`(entities/
 * knowledge-graph) formal 레지스터에서 가져온다 — 인사이트·빌더와 같은
 * "포함" 단어. 오른쪽 quality 항목은 관계 타입이 아니라 모든 엣지에 걸친
 * 근거 확실도 gradient(강함↔약함)라 타입 사전에 없다 — 이전 라벨 "신뢰"가
 * "포함" 옆에서 마치 두 번째 관계 타입인 것처럼 읽혀 사용자가 다른 관계
 * 타입 이름으로 오인했다(같은 조사 N5). "확실도"로 바꿔 타입이 아닌 확신
 * 정도임을 분명히 한다.
 */
export function TopologyRelationLegend() {
  const t = useTranslations("topology.analysis");
  const relationVocabulary = useRelationVocabulary();

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
        {relationVocabulary("contains", "formal")}
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
