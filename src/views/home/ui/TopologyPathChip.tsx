"use client";

import { Route, X } from "lucide-react";
import { CHROME_STATUS_CHIP_CLASS, CompactCopyButton, controlClass } from "@/shared/ui";

export interface TopologyPathChipProps {
  /** Pre-formatted status line — "경로: {source} → 대상 선택" before a target
   *  is picked, "{source} → {target} · N홉" once both endpoints resolve. The
   *  view composes this (i18n interpolation lives in `HomePage`, not here) so
   *  this component stays a pure "chrome grammar" chip. */
  label: string;
  /** Only rendered once both endpoints resolve — the one agent-facing copy
   *  action that replaced the old path panel's CLI/MCP 2-button split and its
   *  5-button proof-check row (분석 패널 완전 소멸 2단계 §b). */
  resolved: boolean;
  copyPacketLabel: string;
  copyPacketCopied: boolean;
  copyPacketAriaLabel: string;
  copyPacketCopiedAriaLabel: string;
  onCopyPacket: () => void;
  clearAriaLabel: string;
  onClear: () => void;
}

/**
 * Top-center "chrome grammar" status chip for path mode — replaces the old
 * left-slot path panel (route card + MCP/CLI chips + collapsed proof
 * disclosure). Mounted next to `SearchHint` (same "상단 중앙 툴바" row), not
 * in the INDEX/analysis-rail left slot — path no longer reclaims that slot
 * (`slot-ownership.ts`). Canvas path highlighting is untouched — this chip is
 * chrome only, no map-rendering logic.
 */
export function TopologyPathChip({
  label,
  resolved,
  copyPacketLabel,
  copyPacketCopied,
  copyPacketAriaLabel,
  copyPacketCopiedAriaLabel,
  onCopyPacket,
  clearAriaLabel,
  onClear,
}: TopologyPathChipProps) {
  return (
    <div
      data-testid="topology-path-chip"
      role="status"
      className={CHROME_STATUS_CHIP_CLASS}
    >
      <Route size={14} aria-hidden className="shrink-0 text-[color:var(--color-text-tertiary)]" />
      <span data-testid="topology-path-chip-label" className="min-w-0 truncate">
        {label}
      </span>
      {resolved ? (
        <CompactCopyButton
          data-testid="topology-path-chip-copy-packet"
          copied={copyPacketCopied}
          label={copyPacketLabel}
          ariaLabel={copyPacketCopied ? copyPacketCopiedAriaLabel : copyPacketAriaLabel}
          onClick={onCopyPacket}
          className="min-h-0 shrink-0 py-0"
        />
      ) : null}
      <button
        type="button"
        onClick={onClear}
        aria-label={clearAriaLabel}
        data-testid="topology-path-chip-clear"
        className={controlClass({
          shape: "icon",
          size: "sm",
          tone: "muted",
          className: "-mr-1 hover:text-[color:var(--color-text-primary)]",
        })}
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
