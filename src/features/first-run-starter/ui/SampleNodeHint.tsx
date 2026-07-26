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
      className="pointer-events-none absolute bottom-[calc(var(--topology-relation-legend-inset)+8px)] left-1/2 z-20 hidden -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-[color:var(--topology-v2-panel-divider)] bg-[color:var(--color-panel)] px-3.5 py-1.5 text-label text-[color:var(--topology-v2-panel-text-secondary)] shadow-[var(--chrome-shadow)] md:flex"
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
