"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, GitBranch, MoreHorizontal } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { copyText } from "@/shared/lib/copy-text";

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
  /** 복사 후 무엇을 하면 되는지 — 스크린리더에도 같은 문장이 간다. */
  handoffCopiedHint: string;
  rowMenuTrigger: string;
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
  compact = false,
}: {
  payload: string;
  labels: QueueRowActionLabels;
  abilities: QueueRowAbilities;
  candidate?: { id: string; title: string };
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  /** 한 줄 행에 얹히는 자리 — 높이만 한 단 낮추고 라벨/동작은 같다. */
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const label = resolveHandoffLabel(labels, abilities);
  return (
    <>
      <button
        type="button"
        data-testid="do-next-handoff-copy"
        onClick={async () => {
          if (candidate) onReviewStart?.(candidate);
          if (await copyText(payload)) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }
        }}
        className={`inline-flex items-center gap-1 rounded-md border border-[color:var(--color-border-soft)] text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)] ${
          compact ? "min-h-7 px-2" : "min-h-8 px-2.5"
        }`}
      >
        {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
        {copied ? labels.handoffCopied : label}
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
  handoffPayload,
  candidate,
  onReviewStart,
  abilities,
  labels,
}: {
  sourceHref: string | null;
  builderHref: string;
  handoffPayload: string;
  candidate: { id: string; title: string };
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  abilities: QueueRowAbilities;
  labels: QueueRowActionLabels;
}) {
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

  const menuItemClass =
    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-label text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]";

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
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          data-testid="do-next-row-menu-popover"
          className="absolute right-0 z-20 mt-1 flex min-w-[10rem] flex-col gap-0.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-1 shadow-[var(--shadow-elevation-1)]"
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
          <button
            type="button"
            role="menuitem"
            data-testid="do-next-row-menu-handoff"
            onClick={async () => {
              onReviewStart?.(candidate);
              if (await copyText(handoffPayload)) {
                setCopied(true);
                window.setTimeout(() => {
                  setCopied(false);
                  setOpen(false);
                }, 1000);
              }
            }}
            className={menuItemClass}
          >
            {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
            {copied ? labels.handoffCopied : resolveHandoffLabel(labels, abilities)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
