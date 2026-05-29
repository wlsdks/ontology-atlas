"use client";

import { useState } from "react";
import { Check, PencilLine, X } from "lucide-react";

/**
 * S4.1a — 노드 "설명"(prose 본문) 읽기↔편집↔저장 primitive (multiline).
 *
 * ontology-first: 노드의 본문이 곧 그 노드의 설명. 토폴로지 drawer 에서 바로
 * 설명을 보충(사람/AI agent)한다. 저장은 부모(S4.1b)가 `replaceVaultBody` +
 * `saveDoc` 로 frontmatter 보존하며 본문만 교체. 라벨 prop 주입 → 순수 컴포넌트.
 *
 * 디자인 헌장 준수: 무채색 + 단일 인디고, glow/scale 없음. Cmd/Ctrl+Enter 저장,
 * Esc 취소(textarea 라 Enter 는 줄바꿈).
 */
export interface NodeExplanationEditLabels {
  heading: string;
  edit: string;
  save: string;
  cancel: string;
  placeholder: string;
  empty: string;
  saving: string;
}

export function NodeExplanationEdit({
  value,
  onSave,
  labels,
}: {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  labels: NodeExplanationEditLabels;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const beginEdit = () => {
    setDraft(value);
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(value);
  };
  const commit = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div data-testid="node-explanation-read">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {labels.heading}
          </span>
          <button
            type="button"
            onClick={beginEdit}
            aria-label={labels.edit}
            data-testid="node-explanation-edit-button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
          >
            <PencilLine size={12} aria-hidden />
          </button>
        </div>
        <p
          className={
            value
              ? "mt-2 [overflow-wrap:anywhere] whitespace-pre-wrap text-[12px] leading-5 text-[color:var(--color-text-secondary)]"
              : "mt-2 text-[12px] italic leading-5 text-[color:var(--color-text-quaternary)]"
          }
        >
          {value || labels.empty}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="node-explanation-edit">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {labels.heading}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void commit()}
            disabled={saving}
            aria-label={labels.save}
            data-testid="node-explanation-save"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:rgba(94,106,210,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset disabled:opacity-60"
          >
            <Check size={12} aria-hidden />
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            aria-label={labels.cancel}
            data-testid="node-explanation-cancel"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset disabled:opacity-60"
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      </div>
      <textarea
        value={draft}
        autoFocus
        disabled={saving}
        rows={4}
        placeholder={labels.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void commit();
          else if (e.key === "Escape") cancel();
        }}
        aria-label={labels.heading}
        data-testid="node-explanation-input"
        className="mt-2 w-full resize-y rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1.5 text-[12px] leading-5 text-[color:var(--color-text-primary)] transition-colors focus-visible:border-[color:rgba(94,106,210,0.46)] focus-visible:outline-none"
      />
    </div>
  );
}
