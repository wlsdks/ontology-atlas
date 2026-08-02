"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { usePanelPresence } from "@/shared/lib/use-presence";

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

/** 트리거와 목록 사이 — 구 `top-[calc(100%+4px)]` 와 같은 값. */
const ANCHOR_GAP = 4;
/** 뷰포트 가장자리에 남기는 여백 — 목록이 창에 닿아 잘리지 않게. */
const VIEWPORT_PAD = 8;
/** 목록 최대 높이 — 자리가 더 넓어도 이보다 길게 열지 않는다(구 `max-h-[264px]`). */
const MAX_LIST_HEIGHT = 264;

type Anchor = {
  left: number;
  width: number;
  /** 아래로 열 때의 상단 좌표(고정 좌표계). 위로 열면 `null`. */
  top: number | null;
  /** 위로 열 때의 하단 좌표(고정 좌표계). 아래로 열면 `null`. */
  bottom: number | null;
  maxHeight: number;
  placement: "below" | "above";
};

/**
 * 트리거의 화면 좌표에서 목록의 자리를 정한다 — **아래에 자리가 없으면 위로
 * 뒤집고, 높이는 실제 가용 공간으로 깎는다.**
 *
 * 고정 264px 을 그대로 쓰면 창 아래쪽 트리거에서 목록이 뷰포트 밖으로 나간다.
 * 자리를 재서 정하면 "목록이 화면 밖에 있다" 는 상태 자체가 생기지 않는다.
 */
function measureAnchor(trigger: HTMLElement): Anchor {
  const rect = trigger.getBoundingClientRect();
  const viewportHeight = window.innerHeight || 0;
  const spaceBelow = viewportHeight - rect.bottom - ANCHOR_GAP - VIEWPORT_PAD;
  const spaceAbove = rect.top - ANCHOR_GAP - VIEWPORT_PAD;
  // 아래가 264px 을 못 채우고 위가 더 넓을 때만 뒤집는다 — 아래로 여는 것이
  // 기본값이고, 뒤집기는 그것이 실패할 때의 보정이다.
  const flip = spaceBelow < MAX_LIST_HEIGHT && spaceAbove > spaceBelow;
  const space = Math.max(0, flip ? spaceAbove : spaceBelow);
  return {
    left: rect.left,
    width: rect.width,
    top: flip ? null : rect.bottom + ANCHOR_GAP,
    bottom: flip ? viewportHeight - rect.top + ANCHOR_GAP : null,
    maxHeight: Math.min(MAX_LIST_HEIGHT, space),
    placement: flip ? "above" : "below",
  };
}

/**
 * 캐노니컬 다크 Select / Listbox. 네이티브 `<select>` 는 macOS 에서 회색
 * 시스템 드롭다운(파란 하이라이트)을 띄워 다크 앱과 이질적이라, 앱 전역
 * 셀렉트를 이 컴포넌트로 대체한다(디자인 전면 정비 #4). 트리거(40px,
 * `--control-h-lg`) + 포털 앵커드 팝오버 listbox(elevated 서피스 · 인디고
 * 하이라이트 · 선택 체크). 키보드 내비(↑↓/Enter/Esc/Home/End/타입어헤드),
 * role=listbox / aria-activedescendant, 바깥 클릭·Esc 로 닫힘.
 *
 * ## 목록은 왜 포털인가 (2026-08-02 설치 앱 실측)
 *
 * 구 구현은 `position: absolute` 라 **조상의 `overflow: hidden` 이 그대로
 * 목록을 잘랐다.** 설정 시트 → AI 연결 → 모델 칸에서 러너가 준 모델 7개 중
 * 화면에 남은 것은 **1개**였고(보이는 높이 39px / 264px = 14.8%), 그 상태에서
 * ArrowDown 을 세 번 눌러도 화면은 1px 도 움직이지 않았다 — 목록 자신은
 * 스크롤할 필요가 없고(7개가 264px 안에 다 들어간다), 자르고 있는 것은 두 단계
 * 위의 `.ai-row-disclosure` 였기 때문이다.
 *
 * 그래서 이건 미관이 아니라 **기능 도달 불가 + 접근성 위반**이다:
 * `aria-activedescendant` 는 7개를 정상적으로 훑는데 화면에는 1개만 보인다 —
 * 키보드 사용자가 듣는 세상과 눈으로 보는 세상이 다르다(Nielsen ① 시스템
 * 상태 가시성).
 *
 * `.ai-row-disclosure` 의 `overflow: hidden` 은 **높이 전이용으로 설계된 것**
 * 이라 풀면 그 전이가 깨진다. 조상을 고칠 수 없으므로 목록이 조상 밖으로
 * 나가는 것이 유일한 해다.
 *
 * 헌장 준수: 무채색 + 단일 인디고, 토큰만, glow/scale 없음. 모션은 opacity +
 * scale-y(origin: 열리는 방향)만 — 등장 `--motion-fast`, 퇴장은 그 2/3
 * (`.select-listbox` 규칙, `prefers-reduced-motion` 동등물 있음).
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
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // 퇴장 창을 앱 공통 게이트에서 받는다 — 목록만의 상태 기계를 새로 만들지
  // 않는다(퇴장 창은 이 앱에 하나여야 한다, `use-presence.ts`).
  const { mounted, exiting } = usePanelPresence(open);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const typeaheadRef = useRef<{ query: string; timer: number | null }>({ query: "", timer: null });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const openList = useCallback(() => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    // 자리는 **여는 그 순간** 잰다 — 마운트 뒤 effect 에서 재면 한 프레임을
    // (0,0) 에서 그린 뒤 튄다.
    if (triggerRef.current) setAnchor(measureAnchor(triggerRef.current));
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
  // 목록이 포털이라 `rootRef` 만 보면 **목록 자신이 바깥으로 판정**된다 —
  // 옵션을 누르는 순간 pointerdown 이 먼저 닫아 클릭이 사라진다.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // 열려 있는 동안 트리거가 움직이면(시트 스크롤·창 리사이즈) 목록도 따라간다.
  // 포털은 조상의 스크롤을 상속하지 않으므로 이 구독이 없으면 목록만 남는다.
  useEffect(() => {
    if (!open) return;
    const reanchor = () => {
      if (triggerRef.current) setAnchor(measureAnchor(triggerRef.current));
    };
    window.addEventListener("scroll", reanchor, true);
    window.addEventListener("resize", reanchor);
    return () => {
      window.removeEventListener("scroll", reanchor, true);
      window.removeEventListener("resize", reanchor);
    };
  }, [open]);

  // 옵션 수가 바뀌면 목록 높이가 바뀐다 — 뒤집기 판정을 다시 한다.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    setAnchor(measureAnchor(triggerRef.current));
  }, [open, options.length]);

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

  const anchorStyle: CSSProperties | undefined = anchor
    ? {
        left: anchor.left,
        width: anchor.width,
        maxHeight: anchor.maxHeight,
        ...(anchor.top !== null ? { top: anchor.top } : {}),
        ...(anchor.bottom !== null ? { bottom: anchor.bottom } : {}),
        // 목록은 트리거에서 자라난다 — 위로 열면 아래쪽이 그 자리다.
        transformOrigin: anchor.placement === "above" ? "bottom" : "top",
      }
    : undefined;

  const list =
    mounted && anchor ? (
      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        // 퇴장 프레임은 접근성 트리와 탭 순서에서 즉시 빠진다 — 모션의 대가를
        // 접근성으로 치르지 않는다(`.ai-row-disclosure` 와 같은 계약).
        aria-hidden={exiting || undefined}
        inert={exiting || undefined}
        data-state={exiting ? "closed" : "open"}
        data-placement={anchor.placement}
        data-testid={dataTestid ? `${dataTestid}-listbox` : undefined}
        style={anchorStyle}
        className="select-listbox fixed z-40 overflow-y-auto rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] p-1 shadow-[var(--shadow-elevation-1)]"
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
    ) : null;

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
        {/* 셰브런은 목록과 **같은 사건**이다 — 목록이 80ms 에 사라지는데 이것만
            120ms 를 쓰면 한 입력이 두 사건으로 읽힌다. 시간은 `.select-chevron`
            이 목록 퇴장과 같은 값으로 소유한다. */}
        <ChevronDown
          aria-hidden
          className="select-chevron size-4 flex-none text-[color:var(--color-text-quaternary)] data-[open=true]:rotate-180"
          data-open={open}
        />
      </button>

      {list && typeof document !== "undefined" ? createPortal(list, document.body) : null}
    </div>
  );
}
