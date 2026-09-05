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
  listboxLeft,
  listboxTopIsHidden,
  type ListboxGrowth,
} from "./select-growth";
import { transientSurface } from "@/shared/ui/transient-surface";

export interface SelectOption {
  value: string;
  label: string;
  /** Secondary text, rendered as the option row's second line. */
  description?: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown on the trigger while `value` is the empty string. */
  placeholder?: string;
  /** Accessible name. Required wherever no visible form label is attached. */
  ariaLabel?: string;
  ariaLabelledby?: string;
  /**
   * The id of the line explaining what this value goes on to do. A select whose
   * help sentence is only visual leaves a screen-reader user with the label
   * alone, which is exactly the half that does not name the consumer.
   */
  ariaDescribedby?: string;
  disabled?: boolean;
  /** Trigger height. Default `lg` (40px, `--control-h-lg`); dense forms use `md` (32px). */
  size?: "md" | "lg";
  className?: string;
  id?: string;
  "data-testid"?: string;
}

/** Gap between the trigger and the list. */
const ANCHOR_GAP = 4;
/** Margin kept from the viewport edge so the list is never clipped by the window. */
const VIEWPORT_PAD = 8;
/**
 * The height that counts as "enough room" when choosing which way to open.
 *
 * Used for the flip decision only, **never as a height cap** — the caps belong to
 * the two rules in `select-growth.ts` (row cap, space cap). The old
 * implementation let this one value serve as the cap as well, which left "how
 * many options are fully visible" unanswered.
 */
const PREFERRED_SPACE = 264;

type Anchor = {
  left: number;
  width: number;
  /** Top coordinate (fixed positioning) when opening downwards; `null` when flipped up. */
  top: number | null;
  /** Bottom coordinate (fixed positioning) when opening upwards; `null` when opening down. */
  bottom: number | null;
  /** Room actually left in the viewport in this direction — the space cap's input. */
  availableHeight: number;
  placement: "below" | "above";
};

/**
 * Places the list from the trigger's viewport rect — **flips above when there is
 * no room below, and reports the remaining space as it is.**
 *
 * Height is deliberately not decided here: how many rows fit depends on rendered
 * row heights (a row with a description line is taller), and that call belongs to
 * a pure function.
 */
function measureAnchor(trigger: HTMLElement): Anchor {
  const rect = trigger.getBoundingClientRect();
  const viewportHeight = window.innerHeight || 0;
  const spaceBelow = viewportHeight - rect.bottom - ANCHOR_GAP - VIEWPORT_PAD;
  const spaceAbove = rect.top - ANCHOR_GAP - VIEWPORT_PAD;
  // Flip only when below is tight and above is roomier: opening downwards is the
  // default, and flipping is the correction for when that fails.
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

/** Collects the growth inputs from the rendered list — row heights are measured, never assumed. */
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
 * The canonical dark Select / Listbox. A native `<select>` raises the grey macOS
 * system dropdown with its blue highlight, which reads as foreign inside a dark
 * app, so every select in the app is this component instead: a trigger (40px,
 * `--control-h-lg`) plus a portalled anchored listbox popover (elevated surface,
 * indigo highlight, selected check). Keyboard nav (↑↓/Enter/Esc/Home/End/
 * typeahead), role=listbox / aria-activedescendant, closes on outside click and Esc.
 *
 * **Why the list is portalled** (measured 2026-08-02 in the installed app). The
 * old implementation used `position: absolute`, so an ancestor's `overflow:
 * hidden` clipped the list outright. In Settings → AI connection → model, **1** of
 * the 7 models the runner offered was still on screen (39px visible of 264px =
 * 14.8%), and three ArrowDown presses moved the view by 0px — the list itself had
 * nothing to scroll (all 7 rows fit inside 264px); the clipping came from
 * `.ai-row-disclosure`, two levels up.
 *
 * That makes it unreachable functionality and an accessibility violation, not a
 * cosmetic complaint: `aria-activedescendant` walks all 7 while only 1 is visible,
 * so what a keyboard user hears and what they see are different worlds (Nielsen
 * #1, visibility of system status).
 *
 * `.ai-row-disclosure`'s `overflow: hidden` exists to make its height transition
 * work, so removing it breaks that transition. The ancestor cannot be fixed, which
 * leaves escaping the ancestor as the only remedy.
 *
 * Charter compliance: neutrals plus a single indigo, tokens only, no glow or
 * scale. Motion is opacity plus scale-y (origin: the direction it opens) only —
 * `--motion-fast` in, two thirds of that out (the `.select-listbox` rules, with a
 * `prefers-reduced-motion` equivalent).
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
  className,
  id,
  "data-testid": dataTestid,
}: SelectProps) {
  const reactId = useId();
  const baseId = id ?? reactId;
  const listboxId = `${baseId}-listbox`;
  const optionDomId = (index: number) => `${baseId}-opt-${index}`;

  const [open, setOpen] = useState(false);
  // Keyboard highlight index, initialised on open to the selected option (or 0).
  const [activeIndex, setActiveIndex] = useState(0);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [growth, setGrowth] = useState<ListboxGrowth | null>(null);
  // The list's measured left edge once it has a width; `null` means the trigger's edge.
  // It is remeasured before paint on every open, so a stale slide is never drawn.
  const [listLeft, setListLeft] = useState<number | null>(null);
  // Edge affordances turn on **only when something is genuinely hidden**; right
  // after opening that is the bottom edge alone.
  const [edges, setEdges] = useState<{ top: boolean; bottom: boolean }>({
    top: false,
    bottom: false,
  });
  // The exit window comes from the shared hook rather than a state machine owned
  // by this list — there is exactly one exit window in this app (`use-presence.ts`).
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
    // Measure at the moment of opening: measuring in a post-mount effect draws one
    // frame at (0,0) and then jumps.
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

  // Outside click closes, without moving focus — the click target is already the
  // new focus. The list is portalled, so checking `rootRef` alone would judge the
  // list itself as outside: pointerdown would close first and swallow the click.
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

  // Follow the trigger while open (sheet scroll, window resize). A portal does not
  // inherit ancestor scrolling, so without this the list is left behind.
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

  // A changed option count changes the list height, so the flip decision is remade.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    setAnchor(measureAnchor(triggerRef.current));
  }, [open, options.length]);

  /**
   * Measures the rendered rows to settle the cap — **row heights are measured, not
   * assumed.** It runs before paint, so a wrong height is never visible for even
   * one frame.
   */
  useLayoutEffect(() => {
    if (!mounted || !anchor) return;
    const list = listRef.current;
    if (!list) return;
    const remeasure = () => {
      // The list's own width decides whether it still fits to the right of the
      // trigger; that is known only once rows are rendered, like the height.
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
    // Rows still grow after this — a late web font is the usual cause. Measuring
    // once would let that growth turn silently into scroll and switch the edge
    // affordance on falsely.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(remeasure);
    observer.observe(list);
    for (const row of list.children) observer.observe(row);
    return () => observer.disconnect();
  }, [mounted, anchor, options]);

  // On open the list sits at the top, so nothing is hidden above; "there is more"
  // is carried by the bottom edge.
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

  // Keep the active option in view.
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
   * A fade mask on the covered side only, **and only once the cap is reached and
   * something is genuinely hidden** — an overflow that does not exist is never
   * advertised (same grammar as the composer). The mask adds no colour, so the
   * palette does not grow.
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
        // Measured after the rows render (`listboxLeft`); until then the trigger's edge.
        left: listLeft ?? anchor.left,
        /*
         * **The list never gets narrower than its own items** (owner report,
         * 2026-08-16).
         *
         * This used to be `width: anchor.width`, pinned to the trigger. For a
         * select in a narrow slot that width became the list width and **the
         * choices were truncated** — in the shipped app `Read Only` rendered as
         * `Rea…` and `Agent` as `Ag…`. A list you cannot choose from is not a list.
         *
         * The trigger width is now a **floor**: the list never goes below it, and
         * grows past it when the content is wider. Selects in wide slots are
         * unchanged — this value only ever grows, never shrinks.
         *
         * The cap exists because one unusually long item would otherwise stretch
         * the list across the window; `VIEWPORT_PAD` keeps the screen-edge margin.
         */
        minWidth: anchor.width,
        maxWidth: `calc(100vw - ${VIEWPORT_PAD * 2}px)`,
        // The smaller of the two caps; before rows are measured (first layout) only
        // the space cap applies.
        maxHeight: growth ? growth.height : anchor.availableHeight,
        ...(anchor.top !== null ? { top: anchor.top } : {}),
        ...(anchor.bottom !== null ? { bottom: anchor.bottom } : {}),
        // No cap reached means no scroll affordance at all: a scrollbar over a
        // fully visible list would be lying about "there is more".
        overflowY: growth?.overflowing === false ? "hidden" : "auto",
        ...(edgeMask ? { maskImage: edgeMask, WebkitMaskImage: edgeMask } : {}),
        // The list grows out of the trigger; opening upwards puts that origin at
        // the bottom.
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
        // Exiting frames leave the accessibility tree and tab order immediately —
        // motion is not paid for with accessibility (same contract as
        // `.ai-row-disclosure`).
        aria-hidden={exiting || undefined}
        inert={exiting || undefined}
        data-state={exiting ? "closed" : "open"}
        data-placement={anchor.placement}
        // The cap decision is left in the DOM so the installed-app verifier and a
        // human can read "why did it stop here" as a named cause.
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
                {/*
                  Item labels are **never truncated.** The list now grows to its
                  content, so there is nothing to truncate for — and truncating
                  produces a list you cannot choose from.
                */}
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
          "flex w-full items-center gap-2 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 text-left text-body text-[color:var(--color-text-secondary)] outline-none transition-colors hover:border-[color:var(--color-border-strong)] focus-visible:outline-none focus-visible:border-[color:var(--color-indigo-a46)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a24)] data-[state=open]:border-[color:var(--color-indigo-a46)]",
          // The disabled set comes from the value layer. Hand-written versions keep
          // the cursor and the dim but drop the hover suppression — this call site
          // had exactly that gap.
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
        {/* The chevron is the **same event** as the list: if the list leaves in 80ms
            and this one takes 120ms, a single input reads as two events. The timing
            lives in `.select-chevron`, at the same value as the list's exit. */}
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
