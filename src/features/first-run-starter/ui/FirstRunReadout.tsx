"use client";

import { useTranslations } from "next-intl";
import { useFirstRunSampleModeSettled } from "../model/use-first-run-sample-mode-settled";

export interface FirstRunReadoutProps {
  projectCount: number;
  domainCount: number;
}

/**
 * 우하단 계기 판독 — "1 project · 6 domains · Spine view · 줌인하면 요소가
 * 나타납니다" (승인 계약: `first-run-v3-flagship.html` `.readout`). 이전
 * 라운드의 하단 오픈소스 스트립을 대체 — v3 는 그 자리를 지도 방향성 지표로
 * 바꿨다("소개·macOS 앱·GitHub" 링크는 기존 크롬/설정 기어 경로로 충분,
 * 별도 스트립 불필요).
 *
 * `useFirstRunStarter` 의 `visible`(= sample mode settled && !dismissed) 과
 * 달리 dismiss 에 묶이지 않는다 — 시작하기 모듈을 닫아도 정적 샘플을 계속
 * 둘러보는 동안은 방향성 지표로 남아있는 게 유용하다(이전 오픈소스 스트립과
 * 같은 지속성).
 */
export function FirstRunReadout({ projectCount, domainCount }: FirstRunReadoutProps) {
  const t = useTranslations("firstRunStarter.readout");
  const visible = useFirstRunSampleModeSettled();

  if (!visible) return null;

  return (
    <div
      data-testid="first-run-readout"
      className="pointer-events-none absolute bottom-6 right-6 z-20 hidden items-center gap-3.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-text-quaternary)] md:flex"
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
      <span>{t("hint")}</span>
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
