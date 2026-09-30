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
import { CONTROL_DISABLED_CLASS, CONTROL_PRESS_TRAVEL, CONTROL_TRANSITION } from "@/shared/ui/control-class";
import { usePanelPresence } from "@/shared/lib/use-presence";
import {
  listboxBottomIsHidden,
  listboxGrowth,
  listboxLeft,
  listboxTopIsHidden,
  type ListboxGrowth,
} from "./select-growth";
import { transientSurface } from "@/shared/ui/transient-surface";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown on the trigger while `value` is the empty string. */
  placeholder?: string;
  /** Required wherever no visible form label is attached. */
  ariaLabel?: string;
  ariaLabelledby?: string;
  /**
   * Id of the line saying what this value goes on to do; without it a screen reader hears only
   * the label.
   */
  ariaDescribedby?: string;
  disabled?: boolean;
  /** Trigger height: `lg` 40px by default, `md` 32px for dense forms, `sm` 28px in a chip row. */
  size?: "sm" | "md" | "lg";
  /**
   * Draws the trigger as text with a chevron, no border or fill until hover, for a picker in a
   * row of icon buttons. The list is the same.
   */
  quiet?: boolean;
  className?: string;
  id?: string;
  "data-testid"?: string;
}

const ANCHOR_GAP = 4;
const VIEWPORT_PAD = 8;
/**
 * "Enough room" for the flip decision only, never a height cap: the caps are the row and space
 * rules in `select-growth.ts`.
 */
const PREFERRED_SPACE = 264;

type Anchor = {
  left: number;
  width: number;
  /** Fixed top when opening down; `null` when flipped up. */
  top: number | null;
  /** Fixed bottom when opening up; `null` when opening down. */
  bottom: number | null;
  /** Room left in the viewport in this direction: the space cap's input. */
  availableHeight: number;
  placement: "below" | "above";
};

/**
 * Flips above when below is tight and above is roomier. Height is not decided here: it depends
 * on rendered row heights (`readGrowth`).
 */
function measureAnchor(trigger: HTMLElement): Anchor {
  const rect = trigger.getBoundingClientRect();
  const viewportHeight = window.innerHeight || 0;
  const spaceBelow = viewportHeight - rect.bottom - ANCHOR_GAP - VIEWPORT_PAD;
  const spaceAbove = rect.top - ANCHOR_GAP - VIEWPORT_PAD;
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
 * The app's dark Select: a trigger plus a portalled listbox, because a native `<select>` raises
 * the grey macOS dropdown. The list is portalled so an `overflow: hidden` ancestor
 * (`.ai-row-disclosure`, which needs it for its height transition) cannot clip it.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  ariaLabelledby,
  ariaDescribedby,
  disabled = false,
  size = "lg",
  quiet = false,
  className,
  id,
  "data-testid": dataTestid,
}: SelectProps) {
  const reactId = useId();
  const baseId = id ?? reactId;
  const listboxId = `${baseId}-listbox`;
  const optionDomId = (index: number) => `${baseId}-opt-${index}`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [growth, setGrowth] = useState<ListboxGrowth | null>(null);
  // `null` means the trigger's edge; remeasured before paint on every open.
  const [listLeft, setListLeft] = useState<number | null>(null);
  const [hiddenEdges, setHiddenEdges] = useState<{ top: boolean; bottom: boolean }>({
    top: false,
    bottom: false,
  });
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
    // Measured on open, not after mount, which would draw one frame at (0,0) and jump.
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

  // Closes without refocusing the trigger, since the pressed target takes focus. The list is
  // portalled, so `rootRef` alone would count it as outside and close it before the click lands.
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

  // A portal does not inherit ancestor scrolling, so the list follows the trigger.
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

  // A new option count changes the list height, so the flip is decided again.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    setAnchor(measureAnchor(triggerRef.current));
  }, [open, options.length]);

  /** Runs before paint so a wrong height is never visible for a frame. */
  useLayoutEffect(() => {
    if (!mounted || !anchor) return;
    const list = listRef.current;
    if (!list) return;
    const remeasure = () => {
      // The list's own width, known only once rows render, decides whether it still fits right.
      const left = listboxLeft({
        triggerLeft: anchor.left,
        listWidth: list.getBoundingClientRect().width,
        viewportWidth: window.innerWidth || 0,
        pad: VIEWPORT_PAD,
      });
      setListLeft((current) => (current === left ? current : left));
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
    // Rows still grow after this (a late web font); measuring once would turn that growth into
    // scroll and switch the edge affordance on falsely.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(remeasure);
    observer.observe(list);
    for (const row of list.children) observer.observe(row);
    return () => observer.disconnect();
  }, [mounted, anchor, options]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !list || !growth) {
      setHiddenEdges({ top: false, bottom: false });
      return;
    }
    const read = () =>
      setHiddenEdges({
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

  /** Fades only the covered side, and only once a cap hides something; adds no colour. */
  const edgeMask = (() => {
    const fade = "var(--leading-body)";
    if (hiddenEdges.top && hiddenEdges.bottom) {
      return `linear-gradient(to bottom, transparent 0, black ${fade}, black calc(100% - ${fade}), transparent 100%)`;
    }
    if (hiddenEdges.top) return `linear-gradient(to bottom, transparent 0, black ${fade})`;
    if (hiddenEdges.bottom) return `linear-gradient(to top, transparent 0, black ${fade})`;
    return undefined;
  })();

  const anchorStyle: CSSProperties | undefined = anchor
    ? {
        left: listLeft ?? anchor.left,
        /*
         * The trigger width is a floor, not the width: a list pinned to a narrow trigger
         * truncated its choices. `VIEWPORT_PAD` caps one long item.
         */
        minWidth: anchor.width,
        maxWidth: `calc(100vw - ${VIEWPORT_PAD * 2}px)`,
        // Before rows are measured only the space cap applies.
        maxHeight: growth ? growth.height : anchor.availableHeight,
        ...(anchor.top !== null ? { top: anchor.top } : {}),
        ...(anchor.bottom !== null ? { bottom: anchor.bottom } : {}),
        // Without a reached cap a scrollbar would falsely say "there is more".
        overflowY: growth?.overflowing === false ? "hidden" : "auto",
        ...(edgeMask ? { maskImage: edgeMask, WebkitMaskImage: edgeMask } : {}),
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
        aria-describedby={ariaDescribedby}
        // Exiting frames leave the accessibility tree and tab order at once.
        aria-hidden={exiting || undefined}
        inert={exiting || undefined}
        data-state={exiting ? "closed" : "open"}
        data-placement={anchor.placement}
        // Left in the DOM so the installed-app verifier can read why the list stopped here.
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
                "flex cursor-pointer items-start gap-2 rounded-chip px-2.5 py-2 text-body",
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
                {/* Labels never truncate: a truncated list cannot be chosen from. */}
                <span className="block whitespace-nowrap">{option.label}</span>
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
        aria-describedby={ariaDescribedby}
        aria-activedescendant={open ? optionDomId(activeIndex) : undefined}
        disabled={disabled}
        data-testid={dataTestid}
        data-state={open ? "open" : "closed"}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full items-center gap-2 rounded-chip border px-3 text-left text-[color:var(--color-text-secondary)] outline-none focus-visible:outline-none focus-visible:border-[color:var(--color-indigo-a46)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a24)] data-[state=open]:border-[color:var(--color-indigo-a46)]",
          quiet
            ? "border-transparent bg-transparent hover:bg-[color:var(--color-overlay-1)] data-[state=open]:bg-[color:var(--color-overlay-1)]"
            : "border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] hover:border-[color:var(--color-border-strong)]",
          // The value layer's disabled set also suppresses hover, which hand-written sets miss.
          CONTROL_TRANSITION,
          CONTROL_PRESS_TRAVEL,
          CONTROL_DISABLED_CLASS,
          size === "sm"
            ? cn("h-[var(--control-h-sm)] text-label", quiet ? "gap-1 px-1.5" : "px-2")
            : size === "md"
              ? "h-[var(--control-h-md)] text-body-lg"
              : "h-[var(--control-h-lg)] text-body-lg",
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
        {/*
          * The chevron shares the list's exit timing (`.select-chevron`), so one input reads as
          * one event.
          */}
        <ChevronDown
          aria-hidden
          className="select-chevron size-4 flex-none text-[color:var(--color-text-quaternary)] data-[open=true]:[transform:rotate(180deg)]"
          data-open={open}
        />
      </button>

      {list && typeof document !== "undefined" ? createPortal(list, document.body) : null}
    </div>
  );
}
