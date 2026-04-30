"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { EphemeralNode } from "../lib/use-ephemeral-nodes";

// 헌장 §11 + a11y — motion-reduce 사용자 보호. 짧은 fade 만 (transform 없음).
const FADE_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: [0.42, 0, 0.58, 1] as const },
};

/**
 * Track C-4 — 우측 inspector 패널.
 *
 * 선택된 노드의 상세를 보여주고 편집 가능한 필드는 inline 편집.
 * v1 범위:
 * - ephemeral 노드: 이름 inline 편집 (local state — persist 는 C-5)
 * - approved 노드: read-only (이름 / kind / 요약 / 검수 시각)
 * - 미선택: 안내 placeholder
 *
 * approved 노드 detail 은 C-6 에서 더 채움 (현재 hook 이 title/kind 만 노출).
 */
export interface OntologyInspectorProps {
  ephemeralSelected: EphemeralNode | null;
  approvedSelected: { id: string; kind: string; title: string } | null;
  onRenameEphemeral: (id: string, title: string) => void;
  onSaveEphemeral?: (id: string) => Promise<void> | void;
  onClearSelection: () => void;
  saving?: boolean;
}

const KIND_LABEL_MAP: Record<string, string> = {
  project: "프로젝트",
  domain: "도메인",
  capability: "역량",
  element: "요소",
  document: "문서",
};

export function OntologyInspector({
  ephemeralSelected,
  approvedSelected,
  onRenameEphemeral,
  onSaveEphemeral,
  onClearSelection,
  saving,
}: OntologyInspectorProps) {
  const selected = ephemeralSelected ?? approvedSelected;
  return (
    <aside
      aria-label="선택한 ontology 노드 상세"
      className="flex h-full w-[280px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-3"
    >
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          Inspector
        </p>
        <p className="mt-1 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
          캔버스에서 노드를 클릭하면 상세가 여기에 보여요.
        </p>
      </header>
      <AnimatePresence mode="wait">
        {!selected ? (
          <motion.div
            key="empty"
            {...FADE_MOTION}
            className="rounded-md border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] p-3"
          >
            <p className="text-[12px] leading-5 text-[color:var(--color-text-quaternary)]">
              아직 선택된 노드가 없어요.
            </p>
          </motion.div>
        ) : ephemeralSelected ? (
          <motion.div key={`eph-${ephemeralSelected.id}`} {...FADE_MOTION}>
            <EphemeralDetail
              node={ephemeralSelected}
              onRename={onRenameEphemeral}
              onSave={onSaveEphemeral}
              saving={Boolean(saving)}
              onDeselect={onClearSelection}
            />
          </motion.div>
        ) : approvedSelected ? (
          <motion.div key={`appr-${approvedSelected.id}`} {...FADE_MOTION}>
            <ApprovedDetail
              node={approvedSelected}
              onDeselect={onClearSelection}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </aside>
  );
}

// canonical id 미리보기 — 저장 후 실제 id 와 일치. kind.{slug}.
function previewSlug(title: string): string {
  const trimmed = title.trim();
  if (!trimmed || trimmed === "(이름 입력)") return "(이름 후 자동)";
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 32) || "(이름 후 자동)";
}

function EphemeralDetail({
  node,
  onRename,
  onSave,
  saving,
  onDeselect,
}: {
  node: EphemeralNode;
  onRename: (id: string, title: string) => void;
  onSave?: (id: string) => Promise<void> | void;
  saving: boolean;
  onDeselect: () => void;
}) {
  const titleEmpty = node.title.trim() === "" || node.title === "(이름 입력)";
  const canSave = !titleEmpty && Boolean(onSave) && !saving;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.06)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.18)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-primary)]">
          ephemeral · {KIND_LABEL_MAP[node.kind] ?? node.kind}
        </span>
        <button
          type="button"
          onClick={onDeselect}
          aria-label="선택 해제"
          className="rounded-md p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
        >
          ×
        </button>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          이름
        </span>
        <input
          type="text"
          value={node.title}
          onChange={(e) => onRename(node.id, e.target.value)}
          placeholder="(이름 입력)"
          className="rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2.5 py-1.5 text-[13px] text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)]"
        />
      </label>
      {/* 캔버스 좌표 + 저장 시 canonical ID 미리보기 (kind.{slug 추정}) */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <p className="font-mono uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            저장 ID
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-[color:var(--color-text-tertiary)]">
            {node.kind}.{previewSlug(node.title)}
          </p>
        </div>
        <div>
          <p className="font-mono uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            좌표
          </p>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-[color:var(--color-text-tertiary)]">
            ({Math.round(node.x)}, {Math.round(node.y)})
          </p>
        </div>
      </div>
      {onSave ? (
        <button
          type="button"
          onClick={() => onSave(node.id)}
          disabled={!canSave}
          aria-label="이 노드를 manual 노드로 저장"
          className="inline-flex h-9 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.18)] px-3 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "저장 중…" : "manual 노드로 저장"}
        </button>
      ) : null}
      <p className="text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
        {titleEmpty
          ? "이름을 입력하면 manual 노드로 저장할 수 있어요."
          : "저장 시 knowledgeApprovedNodes 의 manual 항목으로 추가됩니다."}
      </p>
    </div>
  );
}

function ApprovedDetail({
  node,
  onDeselect,
}: {
  node: { id: string; kind: string; title: string };
  onDeselect: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-2)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)]">
          승인 · {KIND_LABEL_MAP[node.kind] ?? node.kind}
        </span>
        <button
          type="button"
          onClick={onDeselect}
          aria-label="선택 해제"
          className="rounded-md p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
        >
          ×
        </button>
      </div>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          이름
        </p>
        <p className="mt-1 text-[13px] text-[color:var(--color-text-primary)]">
          {node.title}
        </p>
      </div>
      <p className="text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
        승인된 노드 — 편집은 별도 fire (C-6) 에서. 트리 화면에서도 볼 수 있어요.
      </p>
    </div>
  );
}
