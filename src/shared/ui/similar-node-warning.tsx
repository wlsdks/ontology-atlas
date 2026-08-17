"use client";

import { motion } from "framer-motion";
import { MOTION } from "@/shared/motion";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "./control-class";

export interface SimilarNodeWarningProps {
  /** 이미 보간된 메시지 — 예: `비슷한 노드가 이미 있어요 — 사용자 인증 흐름`.
   *  i18n 은 caller(view) 가 소유 — shared/ui 는 문자열을 그대로 그린다. */
  message: string;
  openLabel: string;
  createAnywayLabel: string;
  onOpen: () => void;
  onCreateAnyway: () => void;
  className?: string;
}

/**
 * GUI 노드 생성 근접 중복 — design-council B2 rank4 의 비차단 인라인 경고.
 *
 * - **비차단**: 렌더 자체가 아무것도 막지 않는다 — 두 버튼 모두 명시적
 *   선택지("그 노드 열기" / "그래도 새로 만들기")이지 승인 게이트가 아니다.
 *   human-sovereign 원칙 — 생성 권한은 항상 사용자에게 남는다.
 * - **포커스 강탈 금지**: autoFocus 없음, 렌더만으로 activeElement 가 바뀌지
 *   않는다 — 타이핑 중이던 title input 이 포커스를 유지한다.
 * - solid dot 없음(인라인 텍스트 + 링크만) — amber 예산 감사 대상 표면이
 *   아니라 인라인 1개 취급(council guardianRisk).
 * - 토큰: `--color-amber-signal-*` (warning, `--color-amber-source-*`
 *   quarantine 토큰과는 다른 계열 — docs/DESIGN-SYSTEM.md 참고).
 * - 모션: opacity 0→1 + translateY 4px→0, 150ms ease-out. reduced-motion 은
 *   앱 전역 `MotionProvider`(`reducedMotion="user"`) 가 transform 만 걸러내고
 *   opacity 전환은 유지 — 이 컴포넌트가 따로 분기할 필요 없음.
 */
export function SimilarNodeWarning({
  message,
  openLabel,
  createAnywayLabel,
  onOpen,
  onCreateAnyway,
  className,
}: SimilarNodeWarningProps) {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 0, transition: MOTION.fast }}
      // 0.15 는 램프에 없는 값이었다 — 등장은 "이동" 이라 base (2026-07-28).
      transition={MOTION.base}
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-chip border border-[color:var(--color-amber-signal-a28)] bg-[color:var(--color-amber-signal-a07)] px-2.5 py-2 text-label leading-label text-[color:var(--color-text-secondary)]",
        className,
      )}
    >
      <span className="min-w-0">{message}</span>
      <button
        type="button"
        onClick={onOpen}
        /*
         * 문장(경고 행) 속 컨트롤 — 램프 바닥 24(`min-h-6`)가 줄을 16→24 로
         * 세운다. WCAG 2.5.8 은 문장 속을 면제하지만 이 행은 산문이 아니라
         * 액션 행이라 24 타깃이 맞고, 44 였다면 경고가 배너가 된다.
         */
        className={controlClass({
          shape: "link",
          tone: "strong",
          className:
            "shrink-0 font-[var(--font-weight-signature)] underline decoration-[color:var(--color-border-strong)] underline-offset-2 hover:text-[color:var(--color-indigo-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
        })}
      >
        {openLabel}
      </button>
      <span aria-hidden className="text-[color:var(--color-text-quaternary)]">
        ·
      </span>
      <button
        type="button"
        onClick={onCreateAnyway}
        className={controlClass({
          shape: "link",
          className:
            "shrink-0 underline decoration-[color:var(--color-border-soft)] underline-offset-2 hover:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
        })}
      >
        {createAnywayLabel}
      </button>
    </motion.div>
  );
}
