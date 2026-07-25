"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
  /** 옵션 보조 설명 — 옵션 행 두 번째 줄로 표시. */
  description?: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** 선택 값이 없을 때(빈 문자열) 트리거에 보일 안내 문구. */
  placeholder?: string;
  /** 접근성 이름 — 폼 라벨을 시각적으로 붙이지 않는 자리에 필수. */
  ariaLabel?: string;
  ariaLabelledby?: string;
  disabled?: boolean;
  /** 트리거 높이. 기본 `lg`(40px, `--control-h-lg`). 밀도 높은 폼은 `md`(32px). */
  size?: "md" | "lg";
  className?: string;
  id?: string;
  "data-testid"?: string;
}

/**
 * 캐노니컬 다크 Select / Listbox. 네이티브 `<select>` 는 macOS 에서 회색
 * 시스템 드롭다운(파란 하이라이트)을 띄워 다크 앱과 이질적이라, 앱 전역
 * 셀렉트를 이 컴포넌트로 대체한다(디자인 전면 정비 #4). 트리거(40px,
 * `--control-h-lg`) + 앵커드 팝오버 listbox(elevated 서피스 · 인디고
 * 하이라이트 · 선택 체크). 키보드 내비(↑↓/Enter/Esc/Home/End/타입어헤드),
 * role=listbox / aria-activedescendant, 바깥 클릭·Esc 로 닫힘.
 *
 * 헌장 준수: 무채색 + 단일 인디고, 토큰만, glow/scale 없음. 모션은
 * 150ms opacity + scale-y(origin-top) 만 — `prefers-reduced-motion` 존중.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  ariaLabelledby,
  disabled = false,
  size = "lg",
  className,
  id,
  "data-testid": dataTestid,
}: SelectProps) {
  const reactId = useId();
  const baseId = id ?? reactId;
  const listboxId = `${baseId}-listbox`;
  const optionDomId = (index: number) => `${baseId}-opt-${index}`;

  const [open, setOpen] = useState(false);
  // 키보드 하이라이트(활성) 인덱스. 열릴 때 선택 값(없으면 0)으로 초기화.
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const typeaheadRef = useRef<{ query: string; timer: number | null }>({ query: "", timer: null });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const openList = useCallback(() => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [disabled, selectedIndex]);

  const closeList = useCallback(
    (focusTrigger = true) => {
      setOpen(false);
      if (focusTrigger) triggerRef.current?.focus();
    },
    [],
  );

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) return;
      onChange(option.value);
      closeList();
    },
    [options, onChange, closeList],
  );

  // 바깥 클릭 → 닫기 (포커스는 옮기지 않음 — 클릭 지점이 이미 새 포커스).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // 활성 옵션이 뷰 밖이면 스크롤로 따라가게.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionDomId(activeIndex))}`);
    el?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  const runTypeahead = useCallback(
    (char: string) => {
      const state = typeaheadRef.current;
      if (state.timer) window.clearTimeout(state.timer);
      state.query += char.toLowerCase();
      const query = state.query;
      const startFrom = query.length === 1 ? activeIndex + 1 : activeIndex;
      const n = options.length;
      for (let i = 0; i < n; i++) {
        const idx = (startFrom + i) % n;
        if (options[idx].label.toLowerCase().startsWith(query)) {
          setActiveIndex(idx);
          if (!open) commit(idx);
          break;
        }
      }
      state.timer = window.setTimeout(() => {
        state.query = "";
        state.timer = null;
      }, 600);
    },
    [activeIndex, options, open, commit],
  );

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (disabled) return;
    const n = options.length;

    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
        return;
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        runTypeahead(e.key);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (n === 0 ? 0 : (i + 1) % n));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (n === 0 ? 0 : (i - 1 + n) % n));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(n - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        closeList();
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          runTypeahead(e.key);
        }
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={baseId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-activedescendant={open ? optionDomId(activeIndex) : undefined}
        disabled={disabled}
        data-testid={dataTestid}
        data-state={open ? "open" : "closed"}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full items-center gap-2 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 text-left text-caption text-[color:var(--color-text-secondary)] outline-none transition-colors hover:border-[color:var(--color-border-strong)] focus-visible:border-[color:var(--color-indigo-a46)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a24)] disabled:cursor-not-allowed disabled:opacity-55 data-[state=open]:border-[color:var(--color-indigo-a46)]",
          size === "md" ? "h-[var(--control-h-md)]" : "h-[var(--control-h-lg)]",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            selected ? "text-[color:var(--color-text-primary)]" : "text-[color:var(--color-text-quaternary)]",
          )}
        >
          {selected ? selected.label : placeholder ?? ""}
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 flex-none text-[color:var(--color-text-quaternary)] transition-transform duration-150 ease-out motion-reduce:transition-none data-[open=true]:rotate-180"
          data-open={open}
        />
      </button>

      {open ? (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          data-testid={dataTestid ? `${dataTestid}-listbox` : undefined}
          className="absolute left-0 top-[calc(100%+4px)] z-40 max-h-[264px] w-full origin-top overflow-y-auto rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] p-1 shadow-[0_12px_34px_rgba(0,0,0,.5)] motion-safe:animate-[select-pop_150ms_ease-out] motion-reduce:animate-none"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={optionDomId(index)}
                role="option"
                aria-selected={isSelected}
                data-active={isActive}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-chip px-2.5 py-2 text-caption",
                  isActive
                    ? "bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]"
                    : "text-[color:var(--color-text-secondary)]",
                )}
              >
                <span className="flex-none pt-0.5">
                  {isSelected ? (
                    <Check aria-hidden className="size-3.5 text-[color:var(--color-indigo-accent)]" />
                  ) : (
                    <span className="inline-block size-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block truncate text-label text-[color:var(--color-text-quaternary)]">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
