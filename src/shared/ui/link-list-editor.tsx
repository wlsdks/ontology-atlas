"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export interface LinkItem {
  label: string;
  url: string;
}

interface Props {
  value: readonly LinkItem[];
  editable: boolean;
  onChange: (next: LinkItem[]) => void | Promise<void>;
  /** 편집 불가 + 빈값 일 때 안내. 없으면 렌더 자체 X. */
  emptyHint?: string;
  className?: string;
  ariaLabel?: string;
  /** "+ 링크 추가" 버튼의 visible text + aria-label. Default: 'Add link'. */
  addLinkLabel?: string;
  /** 인라인 추가 폼의 commit 버튼 label. Default: 'Add'. */
  commitLabel?: string;
  /** 인라인 추가 폼의 cancel 버튼 label. Default: 'Cancel'. */
  cancelLabel?: string;
  /** label 입력 placeholder. Default: 'Label'. */
  labelPlaceholder?: string;
  /** url 입력 placeholder. Default: 'https://...'. */
  urlPlaceholder?: string;
  /** 칩 X 버튼의 aria-label 빌더. Default: \`Remove {label}\`. */
  removeAriaLabel?: (label: string) => string;
}

/**
 * label + url 쌍 리스트 편집기.
 *
 * - 기존 항목: 링크 row + (editable) X 삭제
 * - editable + "+ 링크 추가" → 두 필드 (label · url) 인라인 입력 → Enter 커밋,
 *   Esc 취소. 빈 필드가 있으면 추가 안 함.
 * - 중복 url 은 현재 허용 (label 이 다를 수 있음).
 */
export function LinkListEditor({
  value,
  editable,
  onChange,
  emptyHint,
  className,
  ariaLabel,
  addLinkLabel = "Add link",
  commitLabel = "Add",
  cancelLabel = "Cancel",
  labelPlaceholder = "Label",
  urlPlaceholder = "https://...",
  removeAriaLabel = (label) => `Remove ${label}`,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const labelRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (adding) labelRef.current?.focus();
  }, [adding]);

  const removeAt = (index: number) => {
    const next = value.filter((_, i) => i !== index);
    void onChange(next);
  };

  const commit = () => {
    const label = draftLabel.trim();
    const url = draftUrl.trim();
    if (!label || !url) {
      cancel();
      return;
    }
    void onChange([...value, { label, url }]);
    setDraftLabel("");
    setDraftUrl("");
    setAdding(false);
  };

  const cancel = () => {
    setDraftLabel("");
    setDraftUrl("");
    setAdding(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  if (!editable && value.length === 0) {
    if (!emptyHint) return null;
    return (
      <p className={cn("text-[12px] text-[color:var(--color-text-quaternary)]", className)}>
        {emptyHint}
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)} aria-label={ariaLabel}>
      {value.map((link, idx) => (
        <div
          key={`${link.url}-${idx}`}
          className="flex items-center gap-2 rounded-2xl border border-[color:var(--color-border-soft)] px-3 py-2.5 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a32)] hover:text-[color:var(--color-text-primary)]"
        >
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 flex-1 items-center justify-between gap-3"
          >
            <span className="min-w-0 truncate">{link.label}</span>
            <span
              aria-hidden="true"
              className="font-mono text-[11px] text-[color:var(--color-text-quaternary)]"
            >
              ↗
            </span>
          </a>
          {editable ? (
            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="shrink-0 text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              aria-label={removeAriaLabel(link.label)}
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      ))}
      {editable ? (
        adding ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-[color:var(--color-indigo-a32)] bg-[color:var(--color-overlay-1)] px-3 py-3 md:flex-row md:items-center">
            <input
              ref={labelRef}
              type="text"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={labelPlaceholder}
              className="flex-1 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-2 py-1.5 text-xs text-[color:var(--color-text-primary)] outline-none focus:border-[color:var(--color-indigo-brand)]"
            />
            <input
              type="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={urlPlaceholder}
              className="flex-1 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-2 py-1.5 text-xs text-[color:var(--color-text-primary)] outline-none focus:border-[color:var(--color-indigo-brand)]"
            />
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={commit}
                className="rounded-md border border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-a16)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)] hover:bg-[color:var(--color-indigo-a24)]"
              >
                {commitLabel}
              </button>
              <button
                type="button"
                onClick={cancel}
                className="rounded-md border border-[color:var(--color-divider)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
              >
                {cancelLabel}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center justify-center gap-1 self-start rounded-2xl border border-dashed border-[color:var(--color-border-strong)] bg-transparent px-3 py-2 text-xs text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a32)] hover:text-[color:var(--color-text-primary)]"
            aria-label={addLinkLabel}
          >
            <Plus size={11} />
            {addLinkLabel}
          </button>
        )
      ) : null}
    </div>
  );
}
