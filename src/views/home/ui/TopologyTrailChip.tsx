"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Footprints, X } from "lucide-react";

import {
  CHROME_STATUS_CHIP_CLASS,
  CompactCopyButton,
  TopologyV2KindGlyph,
} from "@/shared/ui";
import type { FootprintTrailEntry } from "../lib/footprint-trail";

export interface TopologyTrailChipLabels {
  /** 팝오버 제목 — "걸어온 길". */
  heading: string;
  /** 트리거 aria — "걸어온 길 열기". */
  triggerAriaLabel: string;
  /** 현재 위치 sr 라벨 — "지금 여기". */
  currentAriaLabel: string;
  /** 각 행 클릭 aria 접두 — "{title}(으)로 이동". */
  rowAriaLabel: (title: string) => string;
  /** "에이전트에게 복사". */
  copyLabel: string;
  copyAriaLabel: string;
  copyCopiedAriaLabel: string;
  /** 푸터 "지우기". */
  clearLabel: string;
  /** 칩 ✕ aria — "발자국 지우기". */
  clearAriaLabel: string;
}

export interface TopologyTrailChipProps {
  /** 미리 포맷된 칩 라벨 — "걸은 길 {count}개" (i18n 은 HomePage 소유, 칩은 순수 크롬). */
  label: string;
  /** 방문 순서(오래된 → 최근). 팝오버 미니 타임라인이 위→아래로 그린다. */
  entries: readonly FootprintTrailEntry[];
  /** 현재 포커스 노드 id — 타임라인에서 인디고 점으로 표시. 없으면 없음. */
  currentId: string | null;
  labels: TopologyTrailChipLabels;
  /** 행 클릭 → 그 노드로 포커스. */
  onFocusEntry: (id: string) => void;
  /** "에이전트에게 복사" — 방문 체인 인계 패킷을 클립보드로. */
  onCopyPacket: () => void;
  copied: boolean;
  /** 세션 트레일 소거(칩 ✕ · 푸터 "지우기" 공용). */
  onClear: () => void;
}

/**
 * "걸어온 길" 트레일 칩 (fable 설계 — 소유자 요청) — 상단 중앙 크롬 열의 상태
 * 칩(`TopologyPathChip`/`TopologyRealmChip` 과 같은 문법). 클릭하면 **미니
 * 타임라인** 팝오버가 열린다: 세로 점-연결선으로 방문 순서를 위→아래로 보여주고,
 * 각 점은 kind 글리프(현재 위치는 인디고 점), 행 클릭 = 그 노드 포커스. 하단에
 * "에이전트에게 복사"(방문 체인 인계 패킷) + "지우기". 칩 ✕ 도 세션 트레일을
 * 소거한다.
 *
 * transient-surface 계약(설정 기어와 동일): dim/backdrop 없는 self-closing 앵커
 * 팝오버, 자기 Escape 를 소유해 전역 Esc 사다리와 이중 발화하지 않는다.
 */
export function TopologyTrailChip({
  label,
  entries,
  currentId,
  labels,
  onFocusEntry,
  onCopyPacket,
  copied,
  onClear,
}: TopologyTrailChipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    // 설정 기어와 같은 계약 — WINDOW capture Escape 로 포커스가 밖에 있어도 닫고
    // stopPropagation 으로 전역 Esc 사다리가 같은 키를 또 소비하지 않게 한다.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, close]);

  return (
    <div ref={rootRef} className="relative" data-testid="topology-trail-chip">
      <div className={CHROME_STATUS_CHIP_CLASS}>
        <Footprints size={14} aria-hidden className="shrink-0 text-[color:var(--color-text-tertiary)]" />
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={labels.triggerAriaLabel}
          data-testid="topology-trail-chip-trigger"
          className="min-w-0 truncate font-medium text-[color:var(--color-text-primary)]"
        >
          {label}
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label={labels.clearAriaLabel}
          data-testid="topology-trail-chip-clear"
          className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <X size={13} aria-hidden />
        </button>
      </div>
      {open ? (
        <div
          role="group"
          aria-label={labels.heading}
          data-testid="topology-trail-chip-popover"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[248px] rounded-md border border-[color:var(--topology-floating-panel-border)] bg-[color:var(--topology-floating-panel-surface)] shadow-[var(--topology-floating-panel-shadow)]"
        >
          <div className="border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {labels.heading}
          </div>
          {/* 미니 타임라인 — 세로 점-연결선. 방문 순서 위(오래됨)→아래(최근). */}
          <ol className="flex max-h-[280px] flex-col overflow-y-auto px-3 py-2.5">
            {entries.map((entry, i) => {
              const isCurrent = entry.id === currentId;
              return (
                <li key={entry.id} className="flex items-stretch gap-2.5">
                  {/* 좌측 레일 — 점 + 위아래 연결선 세그먼트(첫/끝 행은 반쪽만). */}
                  <span className="relative flex w-4 shrink-0 flex-col items-center">
                    <span
                      aria-hidden
                      className={`w-px flex-1 ${i === 0 ? "bg-transparent" : "bg-[color:var(--color-divider)]"}`}
                    />
                    {isCurrent ? (
                      <span
                        data-testid="topology-trail-current-dot"
                        aria-label={labels.currentAriaLabel}
                        className="my-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--color-indigo-accent)]"
                      />
                    ) : (
                      <TopologyV2KindGlyph kind={entry.kind} size={13} className="my-0.5 shrink-0" />
                    )}
                    <span
                      aria-hidden
                      className={`w-px flex-1 ${i === entries.length - 1 ? "bg-transparent" : "bg-[color:var(--color-divider)]"}`}
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onFocusEntry(entry.id);
                      close(false);
                    }}
                    aria-label={labels.rowAriaLabel(entry.title)}
                    aria-current={isCurrent ? "true" : undefined}
                    data-testid="topology-trail-row"
                    className="min-w-0 flex-1 truncate rounded-chip px-1.5 py-1.5 text-left text-body text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                  >
                    {entry.title}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex items-center justify-between gap-2 border-t border-[color:var(--topology-floating-panel-divider)] px-2 py-1.5">
            <CompactCopyButton
              data-testid="topology-trail-copy-packet"
              copied={copied}
              label={labels.copyLabel}
              ariaLabel={copied ? labels.copyCopiedAriaLabel : labels.copyAriaLabel}
              onClick={onCopyPacket}
              className="min-h-0 py-1"
            />
            <button
              type="button"
              onClick={onClear}
              data-testid="topology-trail-clear-footer"
              className="rounded-md px-2 py-1 text-label text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              {labels.clearLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
