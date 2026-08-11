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
import { CONTROL_DISABLED_CLASS } from "@/shared/ui/control-class";
import { usePanelPresence } from "@/shared/lib/use-presence";
import {
  listboxBottomIsHidden,
  listboxGrowth,
  listboxTopIsHidden,
  type ListboxGrowth,
} from "./select-growth";
import { transientSurface } from "@/shared/ui/transient-surface";

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
/**
 * 어느 쪽으로 열지 정할 때 «자리가 넉넉하다» 로 치는 높이.
 *
 * 뒤집기 판정에만 쓰고 **높이 상한으로는 쓰지 않는다** — 상한은
 * `select-growth.ts` 의 두 규칙(행 상한 · 자리 상한)이 정한다. 구 구현은 이
 * 값 하나가 상한까지 겸했고, 그래서 "몇 개까지 다 보이나" 에 아무 답도
 * 없었다.
 */
const PREFERRED_SPACE = 264;

type Anchor = {
  left: number;
  width: number;
  /** 아래로 열 때의 상단 좌표(고정 좌표계). 위로 열면 `null`. */
  top: number | null;
  /** 위로 열 때의 하단 좌표(고정 좌표계). 아래로 열면 `null`. */
  bottom: number | null;
  /** 이 방향으로 뷰포트에 실제로 남은 공간 — 자리 상한의 재료. */
  availableHeight: number;
  placement: "below" | "above";
};

/**
 * 트리거의 화면 좌표에서 목록의 자리를 정한다 — **아래에 자리가 없으면 위로
 * 뒤집고, 남은 공간을 그대로 보고한다.**
 *
 * 높이를 여기서 정하지 않는 이유: 몇 행까지 담기는지는 렌더된 행 높이를 봐야
 * 알 수 있고(설명 줄이 붙는 행은 더 높다), 그 판정은 순수 함수가 갖는다.
 */
function measureAnchor(trigger: HTMLElement): Anchor {
  const rect = trigger.getBoundingClientRect();
  const viewportHeight = window.innerHeight || 0;
  const spaceBelow = viewportHeight - rect.bottom - ANCHOR_GAP - VIEWPORT_PAD;
  const spaceAbove = rect.top - ANCHOR_GAP - VIEWPORT_PAD;
  // 아래가 넉넉하지 않고 위가 더 넓을 때만 뒤집는다 — 아래로 여는 것이
  // 기본값이고, 뒤집기는 그것이 실패할 때의 보정이다.
  const flip = spaceBelow < PREFERRED_SPACE && spaceAbove > spaceBelow;
  return {
    left: rect.left,
    width: rect.width,
    top: flip ? null : rect.bottom + ANCHOR_GAP,
    bottom: flip ? viewportHeight - rect.top + ANCHOR_GAP : null,
    availableHeight: Math.max(0, flip ? spaceAbove : spaceBelow),
    placement: flip ? "above" : "below",
  };
}

/** 렌더된 목록에서 자람의 재료를 걷는다 — 행 높이는 재는 것이지 가정하는 것이 아니다. */
function readGrowth(list: HTMLUListElement, availableHeight: number): ListboxGrowth | null {
  const style = window.getComputedStyle(list);
  const px = (value: string) => Number.parseFloat(value) || 0;
  return listboxGrowth({
    rowHeights: Array.from(list.children, (row) => row.getBoundingClientRect().height),
    paddingBlock: px(style.paddingTop) + px(style.paddingBottom),
    borderBlock: px(style.borderTopWidth) + px(style.borderBottomWidth),
    availableHeight,
  });
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
  const [growth, setGrowth] = useState<ListboxGrowth | null>(null);
  // 어포던스는 **가려졌을 때만** 켠다 — 열자마자는 아래만 가려져 있다.
  const [edges, setEdges] = useState<{ top: boolean; bottom: boolean }>({
    top: false,
    bottom: false,
  });
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

  /**
   * 렌더된 행을 재서 상한을 확정한다 — **행 높이는 가정하지 않고 잰다.**
   * 페인트 전에 도므로 잘못된 높이가 한 프레임도 보이지 않는다.
   */
  useLayoutEffect(() => {
    if (!mounted || !anchor) return;
    const list = listRef.current;
    if (!list) return;
    const remeasure = () => {
      const next = readGrowth(list, anchor.availableHeight);
      setGrowth((current) =>
        current &&
        next &&
        current.height === next.height &&
        current.rows === next.rows &&
        current.overflowing === next.overflowing &&
        current.cappedBy === next.cappedBy
          ? current
          : next,
      );
    };
    remeasure();
    // 행은 나중에도 자란다 — 늦게 온 웹폰트가 대표적이다. 한 번만 재고 끝내면
    // 그 뒤의 성장은 조용히 스크롤로 흘러가고, 어포던스가 거짓으로 켜진다.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(remeasure);
    observer.observe(list);
    for (const row of list.children) observer.observe(row);
    return () => observer.disconnect();
  }, [mounted, anchor, options]);

  // 열릴 때는 맨 위이므로 위는 안 가려져 있다 — 「더 있다」 는 아래가 나른다.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !list || !growth) {
      setEdges({ top: false, bottom: false });
      return;
    }
    const read = () =>
      setEdges({
        top: listboxTopIsHidden(growth.overflowing, list.scrollTop),
        bottom: listboxBottomIsHidden(
          growth.overflowing,
          list.scrollTop,
          list.clientHeight,
          list.scrollHeight,
        ),
      });
    read();
    list.addEventListener("scroll", read, { passive: true });
    return () => list.removeEventListener("scroll", read);
  }, [open, growth, activeIndex]);

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

  /**
   * 가려진 쪽에만 페이드 마스크. **상한에 닿고 실제로 가려졌을 때만** —
   * 없는 넘침을 광고하지 않는다(컴포저와 같은 문법). 마스크는 색을 더하지
   * 않으므로 채색 시스템이 늘지 않는다.
   */
  const edgeMask = (() => {
    const fade = "var(--leading-body)";
    if (edges.top && edges.bottom) {
      return `linear-gradient(to bottom, transparent 0, #000 ${fade}, #000 calc(100% - ${fade}), transparent 100%)`;
    }
    if (edges.top) return `linear-gradient(to bottom, transparent 0, #000 ${fade})`;
    if (edges.bottom) return `linear-gradient(to top, transparent 0, #000 ${fade})`;
    return undefined;
  })();

  const anchorStyle: CSSProperties | undefined = anchor
    ? {
        left: anchor.left,
        width: anchor.width,
        // 상한 둘 중 작은 쪽. 행을 아직 못 쟀으면(첫 레이아웃) 자리 상한만 쓴다.
        maxHeight: growth ? growth.height : anchor.availableHeight,
        ...(anchor.top !== null ? { top: anchor.top } : {}),
        ...(anchor.bottom !== null ? { bottom: anchor.bottom } : {}),
        // 상한에 안 닿았으면 스크롤 어포던스 자체가 없다 — 다 보이는데
        // 스크롤바가 있으면 「더 있다」 가 거짓말이 된다.
        overflowY: growth?.overflowing === false ? "hidden" : "auto",
        ...(edgeMask ? { maskImage: edgeMask, WebkitMaskImage: edgeMask } : {}),
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
        // 상한 판정을 DOM 에 남긴다 — 설치 앱 검증기와 사람이 «왜 여기서
        // 멈췄나» 를 원인 이름으로 읽는다.
        data-capped-by={growth?.cappedBy}
        data-overflowing={growth ? String(growth.overflowing) : undefined}
        data-testid={dataTestid ? `${dataTestid}-listbox` : undefined}
        style={anchorStyle}
        {...transientSurface("anchored")}
      className="select-listbox fixed z-40 rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] p-1 shadow-[var(--shadow-elevation-1)]"
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
          "flex w-full items-center gap-2 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 text-left text-caption text-[color:var(--color-text-secondary)] outline-none transition-colors hover:border-[color:var(--color-border-strong)] focus-visible:outline-none focus-visible:border-[color:var(--color-indigo-a46)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a24)] data-[state=open]:border-[color:var(--color-indigo-a46)]",
          // 비활성 한 세트는 값 층에서 — 손으로 적으면 커서·흐림만 남고
          // 호버 무력화가 빠진다(실제로 빠져 있던 자리다).
          CONTROL_DISABLED_CLASS,
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
