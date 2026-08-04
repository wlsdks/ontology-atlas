"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FileText, Sparkles } from "lucide-react";
import { OVERLAY_SPRING, OVERLAY_SPRING_REDUCED, SCRIM_FADE, SCRIM_FADE_REDUCED } from "@/shared/motion";
import type { PracticeCleanupPlan } from "../lib/studio-practice-guide";
import { controlClass } from "@/shared/ui";

/**
 * 실습 마무리 — **"이거 지울까요?"** 를 묻는 자리.
 *
 * ## 이 화면이 실습을 실습으로 만든다
 *
 * 앞 단계에서 만든 것은 **진짜 파일**이다. 가짜 저장으로 흉내 냈다면 사용자는
 * "저장하면 어떻게 되는지" 를 배우지 못한 채 배웠다고 믿었을 것이다. 대신
 * 대가를 여기서 치른다 — 연습으로 생긴 것을 연습이 치울 기회를 준다.
 *
 * **되돌리기는 정확해야 한다.** 공방의 생성 경로는 새 노드 하나만 만들지
 * 않는다. 출발 노드에 관계를 적기도 하고, 출발 노드에게 문서가 없으면 그것까지
 * 실체화한다. 그래서 이 화면은 "문서 1개" 라고 뭉뚱그리지 않고 **지울 파일과
 * 참조만 뗄 파일을 나눠서** 보여 준다(`planPracticeCleanup`). 새 노드만 지우고
 * 끝내면 출발 노드에 깨진 참조가 남아, 실습이 볼트를 더럽히고 끝난다.
 *
 * ## 「직접 안 해도 된다」 는 왜 여기 있나
 *
 * 이 제품의 약속은 "사람이 다 손으로 쓴다" 가 아니라 **"사람과 에이전트가 같은
 * 파일을 함께 키운다"** 이다. 그 사실을 알기 가장 좋은 순간은 방금 한 번
 * 손으로 해 본 직후다 — 해 보기 전에 말하면 광고문이고, 해 본 뒤에 말하면
 * 안도다. 그래서 이 문장은 첫 화면이 아니라 마지막 화면에 있다.
 *
 * 진짜 모달 — `--overlay-scrim` 백드롭, Tab 트랩, Esc 닫기(= 남겨 두기),
 * 트리거로 포커스 복귀. 헌장 준수: 무채색 + 단일 인디고, glow/particle 없음.
 */
export interface StudioPracticeCleanupLabels {
  title: string;
  /** 무엇이 만들어졌는지 한 문장. */
  summary: string;
  /** 지울지 묻는 문장. */
  question: string;
  deleteLabel: string;
  keepLabel: string;
  /** 참조만 떼는 파일 옆 캡션. */
  detachNote: string;
  /** 에이전트 안내 한 문장. */
  agentHint: string;
  /** 에이전트 안내의 행동 라벨 — 없으면 문장만 보여 준다. */
  agentAction: string | null;
  dialogAria: string;
}

export function StudioPracticeCleanup({
  outcome,
  plan,
  labels,
  busy,
  onDelete,
  onKeep,
  onAgentAction,
}: {
  /**
   * 이 실습이 **디스크에 썼는가, 명령을 넘겼는가.** 읽기 전용 볼트에서는
   * 저장이 파일을 만들지 않고 에이전트에게 넘길 명령을 복사한다. 그때도
   * 실습은 끝나야 하지만, **되돌릴 것이 없으므로 다른 말을 해야 한다** —
   * 지울 파일 목록도 「지우기」 버튼도 없다. 있지도 않은 파일을 지우겠다고
   * 하면 그게 거짓말이다.
   */
  outcome: "written" | "copied";
  plan: PracticeCleanupPlan;
  labels: StudioPracticeCleanupLabels;
  /** 삭제가 진행 중이면 두 버튼 모두 잠근다 — 두 번 눌러 두 번 지우지 않는다. */
  busy: boolean;
  onDelete: () => void;
  onKeep: () => void;
  onAgentAction: (() => void) | null;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    // 파괴적 행동에 기본 포커스를 주지 않는다 — Enter 한 번에 지워지면
    // 그건 질문이 아니라 함정이다.
    keepRef.current?.focus({ preventScroll: true });
    return () => {
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        // 삭제가 도는 중이면 Esc 는 아무것도 안 한다. 닫아도 삭제는 계속되므로,
        // 「남겨 두기」의 뜻과 실제 결과가 어긋난다 — 버튼은 이미 `busy` 로
        // 잠가 두고 키보드만 열어 두면 그 잠금이 반쪽이다.
        if (busy) return;
        // Esc = 남겨 두기. 취소가 파괴 쪽으로 떨어지면 안 된다.
        onKeep();
        return;
      }
      if (e.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const items = Array.from(
        card.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !card.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey ? active === first : active === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onKeep, busy]);

  return (
    <motion.div
      data-testid="studio-practice-cleanup"
      data-overlay-spring="true"
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialogAria}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reducedMotion ? SCRIM_FADE_REDUCED : SCRIM_FADE}
      className="fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center bg-[color:var(--overlay-scrim)] px-6"
    >
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reducedMotion ? OVERLAY_SPRING_REDUCED : OVERLAY_SPRING}
        className="flex w-[440px] max-w-full flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] shadow-[var(--shadow-elevation-3)]"
      >
        <div className="border-b border-[color:var(--color-divider)] px-5 py-3">
          <h2 className="text-body-lg tracking-body-lg font-semibold text-[color:var(--color-text-primary)] [word-break:keep-all]">
            {labels.title}
          </h2>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <p className="text-body tracking-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
            {labels.summary}
          </p>

          {/* 무엇이 사라지는지 파일 이름으로 말한다 — "정리합니다" 같은
              동사만으로는 사용자가 무엇을 승인하는지 알 수 없다. */}
          {outcome === "written" ? (
          <ul className="flex flex-col gap-1.5">
            {plan.deleteSlugs.map((slug) => (
              <li
                key={slug}
                data-testid="studio-practice-delete-row"
                className="flex items-center gap-2 rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-2"
              >
                <FileText size={14} aria-hidden className="flex-none text-[color:var(--color-text-tertiary)]" />
                <span
                  className="min-w-0 flex-1 truncate text-body tracking-body text-[color:var(--color-text-primary)]"
                  title={`${slug}.md`}
                >
                  {slug}.md
                </span>
              </li>
            ))}
            {plan.detach ? (
              <li
                data-testid="studio-practice-detach-row"
                className="flex items-center gap-2 rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-2"
              >
                <FileText size={14} aria-hidden className="flex-none text-[color:var(--color-text-tertiary)]" />
                <span
                  className="min-w-0 flex-1 truncate text-body tracking-body text-[color:var(--color-text-primary)]"
                  title={`${plan.detach.slug}.md`}
                >
                  {plan.detach.slug}.md
                </span>
                <span className="flex-none text-label tracking-label text-[color:var(--color-text-tertiary)]">
                  {labels.detachNote}
                </span>
              </li>
            ) : null}
          </ul>
          ) : null}

          <p className="text-body tracking-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
            {labels.question}
          </p>
        </div>

        <div className="flex gap-2 border-t border-[color:var(--color-divider)] px-5 py-3">
          {outcome === "written" ? (
          <button
            type="button"
            data-testid="studio-practice-delete"
            disabled={busy}
            onClick={onDelete}
            className="flex h-8 min-h-[var(--overlay-close-size)] flex-1 items-center justify-center rounded-chip border border-[color:var(--color-border-strong)] text-body tracking-body text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
          >
            {labels.deleteLabel}
          </button>
          ) : null}
          <button
            ref={keepRef}
            type="button"
            data-testid="studio-practice-keep"
            disabled={busy}
            onClick={onKeep}
            className="flex h-8 min-h-[var(--overlay-close-size)] flex-1 items-center justify-center rounded-chip border border-[color:var(--color-indigo-line-a45)] bg-[color:var(--color-indigo-a16)] text-body tracking-body font-semibold text-[color:var(--color-indigo-text-soft)] transition-colors hover:bg-[color:var(--color-indigo-a24)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
          >
            {labels.keepLabel}
          </button>
        </div>

        {/* 해 본 직후에만 성립하는 문장. 첫 화면에 있으면 광고문이다. */}
        <div className="flex items-start gap-2 border-t border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-3">
          <Sparkles size={14} aria-hidden className="mt-0.5 flex-none text-[color:var(--color-text-tertiary)]" />
          <p className="min-w-0 flex-1 text-body leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
            {labels.agentHint}
            {onAgentAction && labels.agentAction ? (
              <>
                {" "}
                <button
                  type="button"
                  data-testid="studio-practice-agent"
                  onClick={onAgentAction}
                  className={controlClass({
            shape: "link",
            tone: "accent",
            className:
              "font-medium underline underline-offset-2 hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]",
          })}
                >
                  {labels.agentAction}
                </button>
              </>
            ) : null}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
