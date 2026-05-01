"use client";

import { useEffect, useState } from "react";
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
 * Track C-4 + C-5 — 우측 inspector 패널.
 *
 * 선택된 노드의 상세를 보여주고 편집 가능한 필드는 inline 편집.
 * v1 범위:
 * - ephemeral 노드: 이름 inline 편집 (local state, 저장 시 vault.md 작성)
 * - vault 노드 (C-5 신규): 이름 inline 편집, 저장 시 vault.updateFrontmatter
 * - approved 노드: read-only (cloud 모드 legacy)
 * - 미선택: 안내 placeholder
 */
export interface OntologyInspectorProps {
  ephemeralSelected: EphemeralNode | null;
  approvedSelected: { id: string; kind: string; title: string } | null;
  vaultSelected: { slug: string; kind: string; title: string } | null;
  onRenameEphemeral: (id: string, title: string) => void;
  onSaveEphemeral?: (id: string) => Promise<void> | void;
  onSaveVaultRename?: (slug: string, nextTitle: string) => Promise<void> | void;
  onDeleteVault?: (slug: string) => Promise<void> | void;
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
  vaultSelected,
  onRenameEphemeral,
  onSaveEphemeral,
  onSaveVaultRename,
  onDeleteVault,
  onClearSelection,
  saving,
}: OntologyInspectorProps) {
  const selected = ephemeralSelected ?? vaultSelected ?? approvedSelected;
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
        ) : vaultSelected ? (
          <motion.div key={`vault-${vaultSelected.slug}`} {...FADE_MOTION}>
            <VaultDetail
              node={vaultSelected}
              onSaveRename={onSaveVaultRename}
              onDelete={onDeleteVault}
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

function VaultDetail({
  node,
  onSaveRename,
  onDelete,
  saving,
  onDeselect,
}: {
  node: { slug: string; kind: string; title: string };
  onSaveRename?: (slug: string, nextTitle: string) => Promise<void> | void;
  onDelete?: (slug: string) => Promise<void> | void;
  saving: boolean;
  onDeselect: () => void;
}) {
  // local draft — 사용자가 입력 중에 patch 가 일어나지 않게 buffer.
  const [draft, setDraft] = useState(node.title);
  useEffect(() => {
    setDraft(node.title);
  }, [node.slug, node.title]);
  const trimmed = draft.trim();
  const dirty = trimmed !== "" && trimmed !== node.title;
  const canSave = dirty && Boolean(onSaveRename) && !saving;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-2)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)]">
          vault · {KIND_LABEL_MAP[node.kind] ?? node.kind}
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
          제목 (frontmatter title)
        </span>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2.5 py-1.5 text-[13px] text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)]"
        />
      </label>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          slug
        </p>
        <p className="mt-1 break-all font-mono text-[11px] text-[color:var(--color-text-tertiary)]">
          {node.slug}
        </p>
      </div>
      {onSaveRename ? (
        <button
          type="button"
          onClick={() => onSaveRename(node.slug, draft)}
          disabled={!canSave}
          aria-label="제목을 vault frontmatter 에 반영"
          className="inline-flex h-9 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.18)] px-3 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "저장 중…" : dirty ? "vault 에 저장" : "변경 없음"}
        </button>
      ) : null}
      <p className="text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
        제목만 frontmatter `title:` 에 patch 됩니다. 본문이나 다른 키는 그대로
        유지돼요. AI agent (MCP) 도 동일 vault 를 보고 있어 즉시 반영됩니다.
      </p>
      {onDelete ? (
        <button
          type="button"
          onClick={() => onDelete(node.slug)}
          disabled={saving}
          aria-label="이 vault 노드 삭제"
          className="inline-flex h-8 items-center justify-center rounded-md border border-[color:rgba(229,72,77,0.32)] bg-transparent px-3 text-[11px] text-[color:rgba(236,116,116,0.92)] transition-colors hover:border-[color:rgba(229,72,77,0.5)] hover:bg-[color:rgba(229,72,77,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⚠ vault 에서 삭제
        </button>
      ) : null}
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
