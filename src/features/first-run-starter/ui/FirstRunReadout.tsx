"use client";

import { useTranslations } from "next-intl";
import { useFirstRunSampleModeSettled } from "../model/use-first-run-sample-mode-settled";

export interface FirstRunReadoutProps {
  projectCount: number;
  domainCount: number;
  /**
   * M-5 — the current semantic-zoom altitude tier, reported by the map engine
   * (`TopologyMapV2#onZoomTierChange`). Drives the readout's orientation label
   * (SPINE → CIRCUIT → ELEMENT) and, once elements are actually on screen
   * ("element"), drops the now-false "zoom in to see elements" hint. Defaults
   * to "spine" (the overview entry) when the map hasn't reported yet.
   */
  tier?: "spine" | "circuit" | "element";
}

/**
 * 우하단 계기 판독 — "1 project · 6 domains · Spine view · 줌인하면 요소가
 * 나타납니다" (승인 계약: `first-run-v3-flagship.html` `.readout`). 이전
 * 라운드의 하단 오픈소스 스트립을 대체 — v3 는 그 자리를 지도 방향성 지표로
 * 바꿨다("소개·macOS 앱·GitHub" 링크는 기존 크롬/설정 기어 경로로 충분,
 * 별도 스트립 불필요).
 *
 * M-5 — the tier label + zoom hint used to be one frozen string
 * (`readout.hint` = "Spine view · 줌인하면 요소가 나타납니다"). It stayed
 * "Spine view · zoom in to see elements" even at max zoom with element nodes
 * on screen — an orientation instrument that lies. The label now tracks the
 * live `tier`, and the "zoom in to see elements" hint only shows while
 * elements are NOT yet revealed (spine / circuit); at the element tier it is
 * dropped.
 *
 * `useFirstRunStarter` 의 `visible`(= sample mode settled && !dismissed) 과
 * 달리 dismiss 에 묶이지 않는다 — 시작하기 모듈을 닫아도 정적 샘플을 계속
 * 둘러보는 동안은 방향성 지표로 남아있는 게 유용하다(이전 오픈소스 스트립과
 * 같은 지속성).
 */
export function FirstRunReadout({ projectCount, domainCount, tier = "spine" }: FirstRunReadoutProps) {
  const t = useTranslations("firstRunStarter.readout");
  const visible = useFirstRunSampleModeSettled();

  if (!visible) return null;

  const tierLabel = t(`tier_${tier}`);
  // At the element tier the "zoom in to see elements" promise is already
  // fulfilled — showing it would be a lie (M-5). Below it, keep the guidance.
  const showZoomHint = tier !== "element";

  return (
    <div
      data-testid="first-run-readout"
      data-zoom-tier={tier}
      className="pointer-events-none hidden items-center gap-3.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-text-quaternary)] md:flex"
    >
      <span>
        <span className="text-[color:var(--color-text-tertiary)]">{projectCount}</span>{" "}
        {t("projectUnit")}
      </span>
      <Dot />
      <span>
        <span className="text-[color:var(--color-text-tertiary)]">{domainCount}</span>{" "}
        {t("domainUnit")}
      </span>
      <Dot />
      <span data-testid="first-run-readout-tier">{tierLabel}</span>
      {showZoomHint ? (
        <>
          <Dot />
          <span data-testid="first-run-readout-zoom-hint">{t("zoomHint")}</span>
        </>
      ) : null}
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="h-[3px] w-[3px] shrink-0 rounded-full bg-[color:var(--color-text-quaternary)]"
    />
  );
}
