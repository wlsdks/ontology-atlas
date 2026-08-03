"use client";

import { useEffect, useRef, useState } from "react";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { Check, Copy, FileText, GitBranch, MessageCircle, MoreHorizontal } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { copyText } from "@/shared/lib/copy-text";
import { controlClass } from "@/shared/ui/control-class";
import { Surface } from "@/shared/ui/surface";

/**
 * 「할 일」 큐 행의 행동 — 주 액션(지도)만 밖에 두고 나머지는 케밥 안으로.
 *
 * 여기 있는 이유: 의미 공백 섹션(정의 없음·소속 미정)이 같은 행동 세트를
 * 쓴다. 두 벌이 되면 같은 케밥이 표면마다 다른 항목을 갖는다.
 *
 * ## 라벨은 세션 능력에 따라 **번역**된다 (숨기거나 회색으로 죽이지 않는다)
 *
 * 이 화면은 계정을 모르므로 사람을 구분하지 않는다. 대신 세션이 지금 할 수
 * 있는 일만 정직하게 말한다 — 읽기 전용 폴더에서 「공방에서 수정」은 갈 수 없는
 * 문이므로 「공방에서 보기」로, 에이전트가 관측되지 않은 폴더에서 「에이전트로
 * 검증」은 「넘길 명령 복사」로 바뀐다(동료에게 전달하는 것도 이 제품의 원래
 * 동사인 인계다). 항목을 없애면 "이 제품에 그런 기능이 있다" 는 사실 자체를
 * 잃고, 회색 비활성 버튼은 이유를 말하지 않는다.
 */

export interface QueueRowActionLabels {
  openSource: string;
  openBuilder: string;
  /** 읽기 전용 세션의 같은 자리 — 쓰기가 아니라 보기. */
  openBuilderReadOnly: string;
  handoffCopy: string;
  /** 에이전트가 관측되지 않은 세션의 같은 자리 — 검증이 아니라 인계. */
  handoffCopyIdle: string;
  handoffCopied: string;
  /** 클립보드가 막혔을 때 — 침묵은 성공처럼 읽힌다. */
  handoffCopyFailed: string;
  /** 복사 후 무엇을 하면 되는지 — 스크린리더에도 같은 문장이 간다. */
  handoffCopiedHint: string;
  rowMenuTrigger: string;
  /**
   * S7 이음새 — 이 행을 그대로 지도의 에이전트에게 말로 넘기는 자리.
   * optional: 에이전트 표면이 없는 환경에서는 라벨도 주소도 오지 않고, 그때는
   * 항목이 나타나지 않는다(열리지 않을 문을 그리지 않는다).
   */
  askAgent?: string;
}

/** 케밥과 인계 버튼이 라벨을 고를 때 쓰는 세션 사실. */
export interface QueueRowAbilities {
  canWriteVault: boolean;
  agentObserved: boolean;
}

export function resolveBuilderLabel(
  labels: QueueRowActionLabels,
  abilities: QueueRowAbilities,
): string {
  return abilities.canWriteVault ? labels.openBuilder : labels.openBuilderReadOnly;
}

export function resolveHandoffLabel(
  labels: QueueRowActionLabels,
  abilities: QueueRowAbilities,
): string {
  return abilities.agentObserved ? labels.handoffCopy : labels.handoffCopyIdle;
}

export function HandoffCopyButton({
  payload,
  labels,
  abilities,
  candidate,
  onReviewStart,
}: {
  payload: string;
  labels: QueueRowActionLabels;
  abilities: QueueRowAbilities;
  candidate?: { id: string; title: string };
  onReviewStart?: (candidate: { id: string; title: string }) => void;
}) {
  /**
   * 복사 결과는 **성공도 실패도** 말한다 (2026-07-28 QA). 클립보드 권한은
   * 조용히 거절될 수 있고, 그때 침묵하면 사용자는 복사됐다고 믿는다 —
   * 붙여넣기에서야 안다. 공용 3-상태 훅을 쓴다(새 기제 없음).
   */
  const { state: copyState, copy: copyHandoff } = useCopyFeedback(1600);
  const copied = copyState === "copied";
  const label = resolveHandoffLabel(labels, abilities);
  return (
    <>
      <button
        type="button"
        data-testid="do-next-handoff-copy"
        onClick={async () => {
          if (candidate) onReviewStart?.(candidate);
          await copyHandoff(payload);
        }}
        /**
         * **`compact` 프롭은 2026-08-03 에 사라졌다.** 그 프롭이 고르던 것은
         * 높이 하나(30 vs 32)였고, 칩 램프가 32 로 수렴하면서 두 값이 같아졌다.
         * 아무것도 안 고르는 축은 «고를 것만 늘리는 것» 이라 지웠다.
         */
        className={controlClass({
          shape: "chip",
          size: "md",
          className:
            "hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]",
        })}
      >
        {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
        {copyState === "failed"
          ? labels.handoffCopyFailed
          : copied
            ? labels.handoffCopied
            : label}
      </button>
      {/* 복사는 성공해도 화면이 거의 안 변한다 — 무엇이 손에 들어왔고 그걸로
          무엇을 하면 되는지 한 문장을 보조기술에도 같이 준다. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {copied ? labels.handoffCopiedHint : ""}
      </span>
    </>
  );
}

export function RowActionMenu({
  sourceHref,
  builderHref,
  askAgentHref,
  handoffPayload,
  candidate,
  onReviewStart,
  abilities,
  labels,
}: {
  sourceHref: string | null;
  builderHref: string;
  /**
   * S7 이음새 — 지도로 건너가 이 행의 문맥이 실린 문장으로 에이전트 패널을
   * 연다. **주소가 나르는 것은 의도의 종류뿐**이고 문장은 도착지의 첫 마디
   * 생성기가 짓는다(두 입구가 같은 함수를 지나야 갈라지지 않는다).
   * 데스크톱 앱에만 있는 표면이라 여기서는 링크로만 제안하고, 브리지가 없는
   * 곳에서는 호출자가 이 값을 주지 않아 항목 자체가 나타나지 않는다.
   */
  askAgentHref?: string | null;
  handoffPayload: string;
  candidate: { id: string; title: string };
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  abilities: QueueRowAbilities;
  labels: QueueRowActionLabels;
}) {
  // 이 메뉴도 같은 계약을 탄다 — 실패는 말해야 한다.
  const { state: menuCopyState, copy: copyHandoff } = useCopyFeedback(1600);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  /**
   * 메뉴 한 항목 = 목록의 한 줄 → `row`. `<Link>` 와 `<button>` 이 같은
   * 문자열을 쓰므로 상수 하나로 묶는다(둘이 갈리면 메뉴 안에서 항목마다
   * 높이가 달라진다). 램프가 안 내는 호버 잉크만 여기 남는다.
   *
   * `row` 가 `w-full` 을 싣지만 이 메뉴는 이미 `flex-col`(= stretch)이라
   * 폭은 바뀌지 않는다.
   */
  const menuItemClass = controlClass({
    shape: "row",
    size: "sm",
    tone: "secondary",
    className:
      "hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]",
  });

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="do-next-row-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labels.rowMenuTrigger}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-chip border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {/* 행 끝의 «⋯» 아래 오른쪽 정렬 — 등장 원점도 그 모서리다. */}
      <Surface
        open={open}
        origin="top right"
        role="menu"
        data-testid="do-next-row-menu-popover"
        className="absolute right-0 z-20 mt-1 flex min-w-[10rem] flex-col gap-0.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-1 shadow-[var(--shadow-elevation-1)]"
      >
          {sourceHref ? (
            <Link
              href={sourceHref}
              role="menuitem"
              data-testid="do-next-row-menu-source"
              onClick={() => {
                onReviewStart?.(candidate);
                setOpen(false);
              }}
              className={menuItemClass}
            >
              <FileText size={13} aria-hidden />
              {labels.openSource}
            </Link>
          ) : null}
          <Link
            href={builderHref}
            role="menuitem"
            data-testid="do-next-row-menu-builder"
            onClick={() => {
              onReviewStart?.(candidate);
              setOpen(false);
            }}
            className={menuItemClass}
          >
            <GitBranch size={13} aria-hidden />
            {resolveBuilderLabel(labels, abilities)}
          </Link>
          {askAgentHref && labels.askAgent ? (
            <Link
              href={askAgentHref}
              role="menuitem"
              data-testid="do-next-row-menu-ask-agent"
              onClick={() => {
                onReviewStart?.(candidate);
                setOpen(false);
              }}
              className={menuItemClass}
            >
              <MessageCircle size={13} aria-hidden />
              {labels.askAgent}
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            data-testid="do-next-row-menu-handoff"
            onClick={async () => {
              onReviewStart?.(candidate);
              if (await copyHandoff(handoffPayload)) {
                window.setTimeout(() => setOpen(false), 1000);
              }
            }}
            className={menuItemClass}
          >
            {menuCopyState === "copied" ? (
              <Check size={13} aria-hidden />
            ) : (
              <Copy size={13} aria-hidden />
            )}
            {menuCopyState === "copied"
              ? labels.handoffCopied
              : menuCopyState === "failed"
                ? labels.handoffCopyFailed
                : resolveHandoffLabel(labels, abilities)}
          </button>
      </Surface>
    </div>
  );
}
