"use client";

import {
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";

type Variant = "default" | "indigo";

interface Props {
  value: readonly string[];
  editable: boolean;
  onChange: (next: string[]) => void | Promise<void>;
  /** 추가 input placeholder. */
  placeholder?: string;
  /** 칩 톤. tags=default (무채색), stack=indigo. */
  variant?: Variant;
  /** 빈 상태 (editable=false && value 비었을 때) 안내 문구. 없으면 렌더 자체 안 함. */
  emptyHint?: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * 칩 리스트를 읽기/편집 겸용으로 렌더.
 *
 * - editable=false: 값만 칩으로 출력. value 가 비어 있으면 emptyHint 또는 null.
 * - editable=true: 각 칩에 X 삭제 버튼 + 끝에 "+ 추가" 토글. 클릭 시 inline
 *   input 으로 전환, Enter 로 커밋·Esc 로 취소. 중복은 무시.
 *
 * 저장은 onChange(next) 가 받음. 매 변경마다 호출되므로 호출부가 debounce 필요
 * 시 적용 (현재는 일반 사용 케이스에서 연타가 드물어 생략).
 */
export function ChipListEditor({
  value,
  editable,
  onChange,
  placeholder = "추가",
  variant = "default",
  emptyHint,
  className,
  ariaLabel,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (adding) {
      inputRef.current?.focus();
    }
  }, [adding]);

  const chipClass =
    variant === "indigo"
      ? "border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.08)] text-[color:var(--color-text-primary)]"
      : "border-[color:var(--color-divider)] bg-transparent text-[color:var(--color-text-secondary)]";

  const removeAt = (target: string) => {
    const next = value.filter((item) => item !== target);
    void onChange(next);
  };

  const commit = () => {
    const next = draft.trim();
    setDraft("");
    setAdding(false);
    if (!next) return;
    if (value.includes(next)) return;
    void onChange([...value, next]);
  };

  const cancel = () => {
    setDraft("");
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
      <p
        className={cn(
          "text-[12px] text-[color:var(--color-text-quaternary)]",
          className,
        )}
      >
        {emptyHint}
      </p>
    );
  }

  return (
    <div
      className={cn("flex flex-wrap gap-2", className)}
      aria-label={ariaLabel}
    >
      {value.map((item) => (
        <span
          key={item}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs",
            chipClass,
          )}
        >
          <span>{item}</span>
          {editable ? (
            <button
              type="button"
              onClick={() => removeAt(item)}
              className="text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              aria-label={`${item} 제거`}
            >
              <X size={11} />
            </button>
          ) : null}
        </span>
      ))}
      {editable ? (
        adding ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:var(--color-elevated)] px-3 py-1.5 text-xs text-[color:var(--color-text-primary)] outline-none focus:border-[color:var(--color-indigo-brand)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-[color:var(--color-border-strong)] bg-transparent px-3 py-1.5 text-xs text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
            aria-label="새 항목 추가"
          >
            <Plus size={11} />
            {placeholder}
          </button>
        )
      ) : null}
    </div>
  );
}
