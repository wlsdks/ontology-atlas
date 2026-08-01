"use client";

import { useTranslations } from "next-intl";
import { useSampleNodeHint } from "../model/use-sample-node-hint";

export interface SampleNodeHintProps {
  /** 지도에서 현재 노드가 선택돼 있는가 — 첫 선택이 힌트를 영구 소멸시킨다. */
  hasSelection: boolean;
  /**
   * 가이드 투어(2026-07-23, `src/features/guided-tour`) open 동안 렌더 억제 —
   * 투어가 같은 자리에서 같은 학습 목적("눌러보세요")을 더 명시적으로
   * 가르치는 동안 힌트가 겹쳐 보이면 이중 안내가 된다. 영구 dismiss 는
   * 아니다 — 투어가 닫히면 (아직 dismiss 전이면) 다시 보인다.
   */
  hidden?: boolean;
}

/**
 * 샘플 모드 첫 방문의 1회성 지도 힌트 — "지도의 노드를 눌러보세요 · 모든 것이
 * 진짜 문서예요". 지도 하단 중앙에 조용히 앉는 단일 라벨(popup soup 아님).
 *
 * - `pointer-events-none`: 힌트가 노드 클릭을 절대 가로막지 않는다. 사용자가
 *   힌트를 "통과해" 아래 노드를 클릭하면 그 클릭이 곧 dismiss 다.
 * - reduced-motion 무애니메이션: 진입 모션 없음(정적). 헌장의 침착함 유지 +
 *   `prefers-reduced-motion` 사용자에게도 동일.
 * - 게이트/영구 dismiss 는 `useSampleNodeHint` 소유(localStorage). 실제 vault
 *   연결 시 sample-settled 게이트가 꺼져 자동 소멸.
 */
export function SampleNodeHint({ hasSelection, hidden = false }: SampleNodeHintProps) {
  const t = useTranslations("firstRunStarter.nodeHint");
  const { visible } = useSampleNodeHint(hasSelection);

  if (!visible || hidden) return null;

  return (
    <div
      data-testid="sample-node-hint"
      /*
       * 하단 인셋은 **`…-bottom-inset`** 을 쓴다 — 좌우용 `…-legend-inset` 이
       * 아니다 (2026-08-01 실측 수리).
       *
       * 두 토큰은 기본값이 같아서(24px) 넓은 화면에서는 구분이 안 보인다.
       * 갈리는 곳은 `<lg` 다: `bottom-inset` 만 탭바 예약고를 더한다. 좌우용을
       * 쓰고 있었던 탓에 768·834·1023 에서 이 힌트가 30px 중 25px(83%)을
       * 탭바에 덮였다 — 지도의 **첫 상호작용 지시문**이 태블릿 세로에서
       * 실질적으로 안 보였다. 렌더는 되고 있었으므로 어떤 가시성 검사도
       * 이상하다고 말하지 않는다.
       *
       * 같은 사고가 이미 두 번 있었고(2026-07-23 INDEX 푸터 · 판독계),
       * 그때 만든 토큰이 바로 이것이다. 세 번째는 새 값이 아니라 **있는 것을
       * 안 쓴** 경우다.
       */
      className="pointer-events-none absolute bottom-[calc(var(--topology-relation-legend-bottom-inset)+8px)] left-1/2 z-20 hidden -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-[color:var(--topology-v2-panel-divider)] bg-[color:var(--color-panel)] px-3.5 py-1.5 text-label text-[color:var(--topology-v2-panel-text-secondary)] shadow-[var(--chrome-shadow)] md:flex"
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-brand)]"
      />
      <span>
        <b className="font-[var(--font-weight-signature)] text-[color:var(--topology-v2-panel-text-primary)]">
          {t("action")}
        </b>{" "}
        {t("reason")}
      </span>
    </div>
  );
}
