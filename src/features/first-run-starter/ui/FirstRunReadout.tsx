"use client";

import { useTranslations } from "next-intl";
import { useLatinEyebrow } from "@/shared/lib/latin-eyebrow";
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
  /**
   * P1 결함①b (사용성 전수 검수 2026-07-23) — 비개발(plain) 모드에서는
   * element 티어가 도달 불가 밴드로 밀려 있어(`PLAIN_TIER_REVEAL`) 줌으로는
   * 절대 element 가 드러나지 않는다. "줌인하면 요소가 나타납니다"는 이
   * 모드에서 항상 거짓이므로, `tier` 와 무관하게 클릭 기반 plain 문구로
   * 치환한다(드롭하지 않음 — 이 모드에선 그 안내가 항상 유효하다).
   */
  audiencePlain?: boolean;
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
export function FirstRunReadout({
  projectCount,
  domainCount,
  tier = "spine",
  audiencePlain = false,
}: FirstRunReadoutProps) {
  const t = useTranslations("firstRunStarter.readout");
  const visible = useFirstRunSampleModeSettled();
  // 진입 검수 E-10 — 이 계기 판독 문법(mono + uppercase + wide tracking)은
  // 라틴에서는 정상 신호지만 한글에서는 공백 글리프만 벌려 「큰  줄기  보기」로
  // 읽혔다(실측 자간 1.8px). 로케일로 조건을 내린다 — 영문은 종전 그대로.
  const eyebrow = useLatinEyebrow("tracking-[var(--tracking-caps-16)]");

  if (!visible) return null;

  const tierLabel = t(`tier_${tier}`);
  // At the element tier the "zoom in to see elements" promise is already
  // fulfilled — showing it would be a lie (M-5). Below it, keep the guidance.
  // P1 결함①b — plain 모드는 이 tier 판정 자체가 무의미하다(줌으로는 절대
  // element 에 도달 못 함) — 항상 보여주고 문구만 클릭 기반으로 바꾼다.
  const showZoomHint = audiencePlain || tier !== "element";
  const zoomHintText = audiencePlain ? t("zoomHintPlain") : t("zoomHint");

  return (
    <div
      data-testid="first-run-readout"
      data-zoom-tier={tier}
      className={`pointer-events-none hidden items-center gap-3.5 text-caption text-[color:var(--color-text-quaternary)] md:flex ${eyebrow}`}
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
          <span data-testid="first-run-readout-zoom-hint">{zoomHintText}</span>
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
