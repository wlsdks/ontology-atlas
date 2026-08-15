"use client";

import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/shared/lib/cn";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { useDialogFocusTrap } from "@/shared/lib/use-dialog-focus-trap";
import {
  OVERLAY_SPRING,
  OVERLAY_SPRING_REDUCED,
  SCRIM_FADE,
  SCRIM_FADE_REDUCED,
} from "@/shared/motion";
import { transientSurface } from "./transient-surface";

/**
 * Dialog — **뒤를 막는 중앙 대화상자.** 모달성 계약이 기본으로 딸려 온다.
 *
 * ## 왜 (2026-08-15 「체계」석 비준 — docs/DECISIONS.md)
 *
 * `role="dialog"` 26곳/23파일이 각자 모달성을 조립하고 있었다. 실측 드리프트:
 * 스크림 토큰 **5갈래** + 무스크림 aria-modal 2곳(modal without modality —
 * design.md 가 금지한 그것) · 폭 하드코딩 **8종**(360~576) · z 하드코딩
 * (z-50 12곳 · z-40 3곳) · aria-modal 선언 대비 **트랩 실재 8/20**. `Surface`
 * 가 "모달이 필요하면 이 계약을 따로 쌓는다"고 비워 둔 그 자리다 — 인라인
 * 패널 하드컷 사고와 같은 병(규율이 아니라 **베낄 자산**의 부재)이라 같은
 * 처방(프리미티브)을 쓴다.
 *
 * ## 계약 — 전부 기본 on, opt-out 없음
 *
 * 포커스 트랩 · Escape 소유 · 여는 컨트롤로 복귀 · body 스크롤락 ·
 * `aria-modal` · 스크림 클릭 닫기. **`modal={false}` 는 만들지 않는다** —
 * WAI-ARIA APG 가 모달 다이얼로그 패턴에 이 세트를 한 벌로 요구하고,
 * opt-out 스위치는 그 계약 전체를 빠져나가는 구멍이 된다. 비모달 표면은
 * 이 컴포넌트의 소비자가 아니라 `Surface` + `transientSurface("anchored")`
 * 의 소비자다.
 *
 * ## 캐노니컬 토큰 (체계석 판정 그대로)
 *
 * 스크림 `--overlay-scrim`(0.85 — 컨테이너가 스크림을 겸해 z 층이 하나로
 * 끝난다) · z `--z-dialog` · 표면 `--color-panel`(밝기 분리는 스크림이 낸다)
 * · 보더 `--color-divider`(내부 구획과 한 토큰) · 반경 `rounded-panel` ·
 * 그림자 `--shadow-elevation-3`(dialog 단) · 폭 `--dialog-w-sm/md` 2단
 * (하드코딩 8종의 실측 군집이 정확히 둘: 360~448 → 420 · 480~576 → 560).
 *
 * ## 모션
 *
 * 현직 다수파 오버레이 문법 그대로다 — 스크림 `SCRIM_FADE`, 패널
 * `OVERLAY_SPRING`(오버슈트 0, opacity + 8px 상승). Surface 의 CSS 키프레임
 * 문법으로의 통일은 모션석 공동 서명 대상이라 여기서 결정하지 않는다
 * (체계석 조건 ⓒ).
 *
 * ## 게이트
 *
 * `dialog.test.tsx`(모달성 계약) + `tests/contract/dialog-adoption-ratchet`
 * (이 파일 밖의 `role="dialog"` 는 장부를 넘지 못한다 — 새 파일은 첫날부터 0).
 * `data-transient-surface="sheet"` 자기선언으로 2026-08-11 훑기 검사를 자동
 * 상속한다.
 */
export interface DialogProps {
  open: boolean;
  /** Escape · 스크림 클릭 · 소비자의 닫기 버튼이 전부 이 하나로 모인다. */
  onClose: () => void;
  /** 폭 2단 — sm 420(기본) · md 560. 새 단이 필요하면 「체계」 소집이 먼저다. */
  size?: "sm" | "md";
  /** 패널 안 제목 원소의 id. 없으면 `aria-label` 을 넘겨라 — 이름 없는 모달 금지. */
  labelledBy?: string;
  "aria-label"?: string;
  /**
   * 여는 순간 초점이 가는 곳. 기본 `first`(첫 focusable — APG 권고).
   * `container` 는 첫 컨트롤이 파괴적일 때(삭제 확인 등), `none` 은 소비자가
   * 자기 effect 로 특정 컨트롤(주 행동 버튼 등)에 직접 줄 때 — 트랩·복귀는
   * 그대로 이 컴포넌트가 소유한다.
   */
  initialFocus?: "container" | "first" | "none";
  testId?: string;
  /** 패널에 더하는 클래스 — 레이아웃(플렉스·패딩)용. 토큰 계약은 덮지 마라. */
  className?: string;
  children: ReactNode;
}

/** SSR(정적 export 빌드)에서는 document 가 없다 — 클라이언트 마운트 후에만 포털. */
function useIsMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function Dialog({
  open,
  onClose,
  size = "sm",
  labelledBy,
  "aria-label": ariaLabel,
  initialFocus = "first",
  testId,
  className,
  children,
}: DialogProps) {
  const reducedMotion = useReducedMotion();
  const containerRef = useDialogFocusTrap<HTMLDivElement>({
    open,
    onEscape: onClose,
    initialFocus,
  });
  useBodyScrollLock(open);
  const mounted = useIsMounted();

  if (!mounted) return null;

  const handleScrimClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? SCRIM_FADE_REDUCED : SCRIM_FADE}
          data-overlay-spring="true"
          className="fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center bg-[color:var(--overlay-scrim)] px-4"
          onClick={handleScrimClick}
        >
          <motion.div
            ref={containerRef}
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={reducedMotion ? OVERLAY_SPRING_REDUCED : OVERLAY_SPRING}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-label={ariaLabel}
            tabIndex={-1}
            data-testid={testId}
            data-overlay-spring="true"
            {...transientSurface("sheet")}
            // 프로그램으로 옮긴 컨테이너 초점에는 링을 그리지 않는다
            // (dialog-focus-ring.spec.ts 가 지키는 판정).
            className={cn(
              "w-[min(var(--dialog-w-sm),calc(100vw-2rem))] rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-4 shadow-[var(--shadow-elevation-3)] focus:outline-none",
              size === "md" && "w-[min(var(--dialog-w-md),calc(100vw-2rem))]",
              className,
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
