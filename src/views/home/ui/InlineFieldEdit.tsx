"use client";

import { useState } from "react";
import { Check, PencilLine, X } from "lucide-react";

/**
 * S1.1.1a — 단일 frontmatter 필드(예: domain)의 인라인 편집 primitive.
 *
 * 토폴로지를 온톨로지의 1차 *편집* surface 로 만드는 흐름에서, drawer 의 한
 * 필드를 읽기 ↔ 편집 ↔ 저장/취소로 전환한다. 라벨은 prop 으로 주입(drawer 와
 * 같은 패턴) → useTranslations 무관, 순수 컴포넌트라 단위 test 용이.
 *
 * 디자인 헌장 준수: 무채색 + 단일 인디고. glow/neon/scale-hover 없음 —
 * transition-colors 만. value 빈 문자열 → `empty` 라벨 표시.
 */
export interface InlineFieldEditLabels {
  /** 필드 이름 (예: "도메인"). */
  field: string;
  /** 읽기 모드 편집 진입 버튼 aria. */
  edit: string;
  save: string;
  cancel: string;
  placeholder: string;
  /** value 가 빈 문자열일 때 읽기 모드 표시. */
  empty: string;
  /** 저장 중 표시. */
  saving: string;
}

export function InlineFieldEdit({
  value,
  onSave,
  labels,
}: {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  labels: InlineFieldEditLabels;
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
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2" data-testid="inline-field-read">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          {labels.field}
        </span>
        <span
          className={
            value
              ? "text-[12px] text-[color:var(--color-text-secondary)]"
              : "text-[12px] italic text-[color:var(--color-text-quaternary)]"
          }
        >
          {value || labels.empty}
        </span>
        <button
          type="button"
          onClick={beginEdit}
          aria-label={labels.edit}
          data-testid="inline-field-edit-button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
        >
          <PencilLine size={12} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5" data-testid="inline-field-edit">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
        {labels.field}
      </span>
      <input
        type="text"
        value={draft}
        autoFocus
        disabled={saving}
        placeholder={labels.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          else if (e.key === "Escape") cancel();
        }}
        aria-label={labels.field}
        data-testid="inline-field-input"
        className="h-7 min-w-0 flex-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 text-[12px] text-[color:var(--color-text-primary)] transition-colors focus-visible:border-[color:rgba(94,106,210,0.46)] focus-visible:outline-none"
      />
      <button
        type="button"
        onClick={() => void commit()}
        disabled={saving}
        aria-label={labels.save}
        data-testid="inline-field-save"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:rgba(94,106,210,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset disabled:opacity-60"
      >
        <Check size={12} aria-hidden />
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={saving}
        aria-label={labels.cancel}
        data-testid="inline-field-cancel"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset disabled:opacity-60"
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  );
}
