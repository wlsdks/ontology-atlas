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
 * 우측 inspector 패널.
 *
 * 선택된 노드의 상세를 보여주고 편집 가능한 필드는 inline 편집.
 * v1 범위:
 * - ephemeral 노드: 이름 inline 편집 (local state, 저장 시 vault.md 작성)
 * - vault 노드: 이름 inline 편집, 저장 시 vault.updateFrontmatter
 * - approved 노드: read-only (cloud 모드 legacy)
 * - 미선택: 안내 placeholder
 */
export type VaultArrayKey =
  | "capabilities"
  | "elements"
  | "dependencies"
  | "relates";

export type VaultLiteralKey = "description" | "domain";

export interface VaultSelected {
  slug: string;
  kind: string;
  title: string;
  /** V1.2 vault-adaptation — frontmatter scalar literals. */
  description: string;
  domain: string;
  capabilities: string[];
  elements: string[];
  dependencies: string[];
  relates: string[];
}

export interface OntologyInspectorProps {
  ephemeralSelected: EphemeralNode | null;
  vaultSelected: VaultSelected | null;
  /** true 면 vault 가 read-only (빌드타임 dogfood 매니페스트 기반). 인스펙터의
   *  rename/array/literal/delete 모두 disabled — disk 권한 없어 patch 불가. */
  vaultReadOnly?: boolean;
  onRenameEphemeral: (id: string, title: string) => void;
  onSaveEphemeral?: (id: string) => Promise<void> | void;
  onSaveVaultRename?: (slug: string, nextTitle: string) => Promise<void> | void;
  onEditVaultArrayKey?: (
    slug: string,
    key: VaultArrayKey,
    next: string[],
  ) => Promise<void> | void;
  onEditVaultLiteral?: (
    slug: string,
    key: VaultLiteralKey,
    next: string,
  ) => Promise<void> | void;
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
  vaultSelected,
  vaultReadOnly = false,
  onRenameEphemeral,
  onSaveEphemeral,
  onSaveVaultRename,
  onEditVaultArrayKey,
  onEditVaultLiteral,
  onDeleteVault,
  onClearSelection,
  saving,
}: OntologyInspectorProps) {
  const selected = ephemeralSelected ?? vaultSelected;
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
          선택한 노드의 상세 + 인라인 편집.
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
              왼쪽 palette 에서 종류를 클릭해 첫 노드를 만들거나, 캔버스의 노드를 클릭하면 상세가 여기에 보여요.
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
              readOnly={vaultReadOnly}
              onSaveRename={onSaveVaultRename}
              onEditArrayKey={onEditVaultArrayKey}
              onEditLiteral={onEditVaultLiteral}
              onDelete={onDeleteVault}
              saving={Boolean(saving)}
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

const ARRAY_KEY_LABELS: Record<VaultArrayKey, string> = {
  capabilities: "역량 (capabilities)",
  elements: "요소 (elements)",
  dependencies: "의존 (dependencies)",
  relates: "관련 (relates)",
};

function VaultDetail({
  node,
  readOnly,
  onSaveRename,
  onEditArrayKey,
  onEditLiteral,
  onDelete,
  saving,
  onDeselect,
}: {
  node: VaultSelected;
  readOnly: boolean;
  onSaveRename?: (slug: string, nextTitle: string) => Promise<void> | void;
  onEditArrayKey?: (
    slug: string,
    key: VaultArrayKey,
    next: string[],
  ) => Promise<void> | void;
  onEditLiteral?: (
    slug: string,
    key: VaultLiteralKey,
    next: string,
  ) => Promise<void> | void;
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
  const canSave = !readOnly && dirty && Boolean(onSaveRename) && !saving;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-2)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)]">
          {readOnly ? "dogfood" : "vault"} · {KIND_LABEL_MAP[node.kind] ?? node.kind}
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
          disabled={readOnly}
          className="rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2.5 py-1.5 text-[13px] text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)] disabled:opacity-60"
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
      {!readOnly && onSaveRename ? (
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
        {readOnly
          ? "dogfood 매니페스트 — 빌드타임 baked. 직접 수정하려면 /docs 에서 vault 폴더를 여세요."
          : "제목만 frontmatter `title:` 에 patch 됩니다. 본문이나 다른 키는 그대로 유지돼요. AI agent (MCP) 도 동일 vault 를 보고 있어 즉시 반영됩니다."}
      </p>
      {!readOnly && onEditLiteral ? (
        <div className="flex flex-col gap-2">
          <LiteralEditor
            fieldKey="domain"
            value={node.domain}
            onCommit={(next) => onEditLiteral(node.slug, "domain", next)}
            disabled={saving}
            placeholder="예: workbench"
            multiline={false}
          />
          <LiteralEditor
            fieldKey="description"
            value={node.description}
            onCommit={(next) => onEditLiteral(node.slug, "description", next)}
            disabled={saving}
            placeholder="이 노드를 한 줄로 설명"
            multiline
          />
        </div>
      ) : null}
      {!readOnly && onEditArrayKey ? (
        <div className="flex flex-col gap-3">
          {(["capabilities", "elements", "dependencies", "relates"] as const).map(
            (key) => (
              <ArrayKeyEditor
                key={key}
                fieldKey={key}
                values={node[key]}
                onChange={(next) => onEditArrayKey(node.slug, key, next)}
                disabled={saving}
              />
            ),
          )}
        </div>
      ) : readOnly ? (
        <ReadOnlyArraySummary node={node} />
      ) : null}
      {!readOnly && onDelete ? (
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

const LITERAL_LABELS: Record<VaultLiteralKey, string> = {
  description: "설명 (description)",
  domain: "도메인 (domain)",
};

function LiteralEditor({
  fieldKey,
  value,
  onCommit,
  disabled,
  placeholder,
  multiline,
}: {
  fieldKey: VaultLiteralKey;
  value: string;
  onCommit: (next: string) => void;
  disabled: boolean;
  placeholder?: string;
  multiline?: boolean;
}) {
  // local draft — 입력 중엔 vault 에 patch 안 함. blur 또는 Enter (single-line)
  // 시 commit. 사용자 변경이 file write 빈도를 결정 — 너무 자주 쓰면 IDE/editor
  // 가 잡고 있을 때 race.
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [fieldKey, value]);
  const dirty = draft !== value;
  const commit = () => {
    if (!dirty || disabled) return;
    onCommit(draft);
  };
  const sharedClass =
    "w-full rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2 py-1 text-[12px] text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)] disabled:opacity-50";
  return (
    <div className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {LITERAL_LABELS[fieldKey]}
      </p>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          disabled={disabled}
          placeholder={placeholder}
          rows={2}
          className={`mt-1.5 ${sharedClass} resize-y leading-snug`}
        />
      ) : (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          className={`mt-1.5 ${sharedClass}`}
        />
      )}
      <p className="mt-1 text-[10px] text-[color:var(--color-text-quaternary)]">
        {dirty
          ? "포커스 해제 시 vault 에 자동 저장."
          : "비우고 저장하면 frontmatter 키 자체가 삭제됩니다."}
      </p>
    </div>
  );
}

function ArrayKeyEditor({
  fieldKey,
  values,
  onChange,
  disabled,
}: {
  fieldKey: VaultArrayKey;
  values: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}) {
  const [input, setInput] = useState("");
  // 노드 변경 시 입력 buffer 초기화 — 다른 노드의 입력이 새 노드에 새 옴 안 함.
  useEffect(() => {
    setInput("");
  }, [values.join("|"), fieldKey]);
  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed || values.includes(trimmed) || disabled) return;
    onChange([...values, trimmed]);
    setInput("");
  };
  const remove = (slug: string) => {
    if (disabled) return;
    onChange(values.filter((v) => v !== slug));
  };
  return (
    <div className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {ARRAY_KEY_LABELS[fieldKey]}
      </p>
      {values.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1">
          {values.map((slug) => (
            <li key={slug}>
              <button
                type="button"
                onClick={() => remove(slug)}
                disabled={disabled}
                aria-label={`${slug} 제거`}
                className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(229,72,77,0.46)] hover:bg-[color:rgba(229,72,77,0.10)] disabled:opacity-50"
              >
                <span className="font-mono break-all">{slug}</span>
                <span aria-hidden className="text-[color:var(--color-text-tertiary)]">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex gap-1">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
          placeholder="slug 입력 + Enter"
          className="flex-1 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2 py-1 font-mono text-[11px] text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !input.trim() || values.includes(input.trim())}
          aria-label="추가"
          className="inline-flex h-7 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.18)] px-2 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * read-only 모드 (dogfood 매니페스트 기반) 의 array 키 요약. 편집 input 없이
 * chip 만 노출 — 사용자에게 "이 노드는 어떤 의존/역량을 갖는지" 정보만 전달.
 */
function ReadOnlyArraySummary({ node }: { node: VaultSelected }) {
  const sections: Array<{ key: VaultArrayKey; values: string[] }> = (
    ["capabilities", "elements", "dependencies", "relates"] as const
  )
    .map((key) => ({ key, values: node[key] }))
    .filter((s) => s.values.length > 0);
  if (sections.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {sections.map(({ key, values }) => (
        <div
          key={key}
          className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {ARRAY_KEY_LABELS[key]}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1">
            {values.map((slug) => (
              <li
                key={slug}
                className="inline-flex items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2 py-0.5 font-mono text-[11px] text-[color:var(--color-text-tertiary)]"
              >
                {slug}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
