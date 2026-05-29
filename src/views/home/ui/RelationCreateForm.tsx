"use client";

import { useState } from "react";
import { Link2, Plus, X } from "lucide-react";
import type { VaultRelationKey } from "@/entities/docs-vault/lib/relation-proposal";

/**
 * S3.1a — 토폴로지에서 선택 노드(source)로부터 다른 노드(target)로 관계를 긋는
 * 작은 form (presentational). target 선택 + 관계 종류 선택 → onCreate 콜백.
 * 실제 vault write(buildVaultRelationFrontmatterPatch → updateFrontmatter)는
 * HomePage/drawer 글루(S3.1b)가 담당. 라벨·후보 prop 주입 → 순수 컴포넌트.
 *
 * 디자인 헌장 준수: 무채색 + 단일 인디고, glow/scale 없음.
 */

export interface RelationTargetOption {
  slug: string;
  title: string;
}

export interface RelationCreateFormLabels {
  heading: string;
  target: string;
  targetPlaceholder: string;
  relation: string;
  create: string;
  cancel: string;
  relationKeyLabels: Record<string, string>;
}

export function RelationCreateForm({
  targets,
  relationKeys,
  defaultRelationKey,
  onCreate,
  onCancel,
  labels,
}: {
  targets: readonly RelationTargetOption[];
  relationKeys: readonly VaultRelationKey[];
  defaultRelationKey?: VaultRelationKey;
  onCreate: (input: { targetSlug: string; relationKey: VaultRelationKey }) => void | Promise<void>;
  onCancel?: () => void;
  labels: RelationCreateFormLabels;
}) {
  const [targetSlug, setTargetSlug] = useState("");
  const [relationKey, setRelationKey] = useState<VaultRelationKey>(
    defaultRelationKey ?? relationKeys[0],
  );
  const [creating, setCreating] = useState(false);

  const canCreate = targetSlug !== "" && !creating;

  const submit = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      await onCreate({ targetSlug, relationKey });
      setTargetSlug("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <section
      aria-label={labels.heading}
      data-testid="relation-create-form"
      className="rounded-xl border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.05)] px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
          <Link2 size={11} aria-hidden />
          {labels.heading}
        </p>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label={labels.cancel}
            data-testid="relation-create-cancel"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
          >
            <X size={12} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <label className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {labels.relation}
          </span>
          <select
            value={relationKey}
            disabled={creating}
            onChange={(e) => setRelationKey(e.target.value as VaultRelationKey)}
            aria-label={labels.relation}
            data-testid="relation-create-key"
            className="h-7 min-w-0 flex-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 text-[12px] text-[color:var(--color-text-primary)] transition-colors focus-visible:border-[color:rgba(94,106,210,0.46)] focus-visible:outline-none"
          >
            {relationKeys.map((k) => (
              <option key={k} value={k}>
                {labels.relationKeyLabels[k] ?? k}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {labels.target}
          </span>
          <select
            value={targetSlug}
            disabled={creating}
            onChange={(e) => setTargetSlug(e.target.value)}
            aria-label={labels.target}
            data-testid="relation-create-target"
            className="h-7 min-w-0 flex-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 text-[12px] text-[color:var(--color-text-primary)] transition-colors focus-visible:border-[color:rgba(94,106,210,0.46)] focus-visible:outline-none"
          >
            <option value="">{labels.targetPlaceholder}</option>
            {targets.map((tgt) => (
              <option key={tgt.slug} value={tgt.slug}>
                {tgt.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canCreate}
          data-testid="relation-create-submit"
          className="inline-flex h-7 items-center justify-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:rgba(94,106,210,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset disabled:opacity-50"
        >
          <Plus size={12} aria-hidden />
          {labels.create}
        </button>
      </div>
    </section>
  );
}
