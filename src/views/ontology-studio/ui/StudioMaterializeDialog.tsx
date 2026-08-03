"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FileText, X } from "lucide-react";
import { OVERLAY_SPRING, OVERLAY_SPRING_REDUCED, SCRIM_FADE, SCRIM_FADE_REDUCED } from "@/shared/motion";
import type { CreateNodeKind } from "../lib/build-create-node";
import type { StudioWriteTarget } from "../lib/resolve-write-target";
import { controlClass } from "@/shared/ui";

/**
 * "이 개념은 아직 문서가 없어요" — 문서를 만들어도 되는지 묻는 동의 표면.
 *
 * 왜 이 화면이 존재하는가 — 다른 문서의 관계 키에서 이름만 불린 개념은 자기
 * `.md` 가 없다. 그런 개념에 관계를 이으려면 그 개념의 문서를 만드는 수밖에
 * 없고(관계는 개념에 속하니까), 사용자 디스크에 파일을 만드는 일은 사용자가
 * 요청한 적 없는 일이라 **명시적 동의 없이는 하지 않는다**. 그래서 저장 순간에
 * 딱 한 번, 만들 파일 경로까지 밝히고 묻는다.
 *
 * 진짜 모달 — 뒤를 실제로 가리는 `--overlay-scrim`(다크 backdrop), Tab 순환
 * 트랩, Esc / 취소 / scrim 클릭 닫기, 닫힐 때 트리거로 포커스 복귀. 스크림에
 * `--color-overlay-*`(패널 위 옅은 백색 wash) 를 쓰면 뒤가 그대로 비쳐
 * modality 가 시각적으로 사라진다 — app/globals.css `--overlay-scrim` 주석 참조.
 *
 * 모션은 앱의 오버레이 계약 그대로(OVERLAY_SPRING, opacity + 8px 상승,
 * reduced-motion 은 120ms linear). 퇴장 애니메이션은 두지 않는다 — 호출부가
 * AnimatePresence 없이 조건부 렌더하므로 exit prop 은 재생되지 않고, 동의
 * 모달은 결정 직후 즉시 사라지는 편이 정직하다.
 */

export interface StudioMaterializeLabels {
  title: string;
  /** 왜 문서가 없는지 — 개념 이름을 넣은 한 문장. */
  reason: string;
  /** 무엇을 할 것인지 — 쓰기 가능 / 읽기 전용에 따라 다르다. */
  action: string;
  fileLabel: string;
  kindLabel: string;
  kindPrompt: string;
  scopeNote: string;
  confirm: string;
  cancel: string;
  closeAria: string;
  kindOptionLabel: (kind: CreateNodeKind) => string;
}

const KIND_CHOICES: CreateNodeKind[] = ["domain", "capability", "element"];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset";

export function StudioMaterializeDialog({
  target,
  labels,
  onConfirm,
  onCancel,
}: {
  target: Extract<StudioWriteTarget, { status: "missing" }>;
  labels: StudioMaterializeLabels;
  onConfirm: (kind: CreateNodeKind) => void;
  onCancel: () => void;
}) {
  // 종류를 못 정한 개념(예: 이름만 적힌 `relates:` 항목)은 우리가 지어내지
  // 않는다 — 사용자가 고른다. 아는 경우엔 묻지 않는다.
  const [kind, setKind] = useState<CreateNodeKind>(target.kind ?? "element");
  const cardRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus({ preventScroll: true });
    return () => {
      // 트리거(저장 버튼)로 포커스 복귀 — 취소해도 키보드 사용자가 흐름을 잃지 않는다.
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
        return;
      }
      // aria-modal 을 선언했으면 Tab 도 실제로 갇혀야 한다 — 안 그러면 뒤의
      // 레일·터미널 핸들로 포커스가 새어 나가 "가려졌다"는 약속이 깨진다.
      // NewDocKindDialog 와 같은 trap 패턴(신규 의존성 0).
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
  }, [onCancel]);

  return (
    <motion.div
      data-testid="studio-materialize-dialog"
      data-overlay-spring="true"
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reducedMotion ? SCRIM_FADE_REDUCED : SCRIM_FADE}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--overlay-scrim)] px-6"
      onClick={onCancel}
    >
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reducedMotion ? OVERLAY_SPRING_REDUCED : OVERLAY_SPRING}
        className="flex w-[440px] max-w-full flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] shadow-[var(--shadow-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-5 py-3">
          <span className="min-w-0 flex-1 text-body-lg tracking-body-lg font-semibold text-[color:var(--color-text-primary)] [word-break:keep-all]">
            {labels.title}
          </span>
          <button
            type="button"
            data-testid="studio-materialize-close"
            aria-label={labels.closeAria}
            onClick={onCancel}
            className={`-my-1 -mr-2 flex h-[var(--overlay-close-size)] w-[var(--overlay-close-size)] flex-none items-center justify-center rounded-chip text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-secondary)] ${FOCUS_RING}`}
          >
            <X size={15} aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <p className="text-body tracking-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
            {labels.reason}
          </p>
          <p className="text-body tracking-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
            {labels.action}
          </p>

          {/* "무엇이 만들어지는가" 한 묶음 — 경로와 종류는 같은 사실이라
              그룹 안 간격(8px)을 그룹 사이 간격(12px)보다 좁게 둔다. */}
          <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-2.5">
            <FileText size={14} aria-hidden className="flex-none text-[color:var(--color-text-tertiary)]" />
            <span className="flex-none text-label tracking-label text-[color:var(--color-text-tertiary)]">
              {labels.fileLabel}
            </span>
            <span
              data-testid="studio-materialize-path"
              className="min-w-0 flex-1 truncate text-body tracking-body text-[color:var(--color-text-primary)]"
              title={`${target.slug}.md`}
            >
              {target.slug}.md
            </span>
          </div>

          {target.kind === null ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-label tracking-label text-[color:var(--color-text-tertiary)]">
                {labels.kindPrompt}
              </span>
              <div className="flex gap-1.5">
                {KIND_CHOICES.map((option) => {
                  const on = option === kind;
                  return (
                    <button
                      key={option}
                      type="button"
                      data-testid={`studio-materialize-kind-${option}`}
                      aria-pressed={on}
                      onClick={() => setKind(option)}
                      className={controlClass({
                        shape: "chip",
                        size: "lg",
                        active: on,
                        className: `flex-1 justify-center tracking-body hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)] ${FOCUS_RING}`,
                      })}
                    >
                      {labels.kindOptionLabel(option)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-label tracking-label text-[color:var(--color-text-tertiary)]">
              {labels.kindLabel} · {labels.kindOptionLabel(target.kind)}
            </p>
          )}
          </div>

          <p className="text-label tracking-label leading-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
            {labels.scopeNote}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[color:var(--color-divider)] px-5 py-3">
          <button
            type="button"
            data-testid="studio-materialize-cancel"
            onClick={onCancel}
            className={controlClass({
              shape: "chip",
              size: "lg",
              className: `tracking-body hover:border-[color:var(--color-border-strong)] ${FOCUS_RING}`,
            })}
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            data-testid="studio-materialize-confirm"
            onClick={() => onConfirm(kind)}
            className={`flex h-8 items-center rounded-chip bg-[color:var(--color-indigo-brand)] px-4 text-body tracking-body font-semibold text-white transition-colors hover:bg-[color:var(--color-indigo-hover)] ${FOCUS_RING}`}
          >
            {labels.confirm}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
