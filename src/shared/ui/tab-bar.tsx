import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * Section tabs with a 2px bottom indicator. Presentational: `onSelect` is the only integration
 * point, so the caller owns how the active tab is stored.
 */
export interface TabBarItem {
  key: string;
  label: string;
  /** Stable selector for a product-specific tab. */
  testId?: string;
  /** Engraved count beside the label; omit on tabs with no count. */
  count?: string | number;
  /** Names the count's unit through `title` only, so it costs no ink. */
  countTitle?: string;
}

export function TabBar({
  items,
  activeKey,
  onSelect,
  ariaLabel,
  idPrefix = 'insights',
  testId,
  placement = 'default',
  orientation = 'horizontal',
}: {
  items: readonly TabBarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  ariaLabel: string;
  /**
   * Prefix for `id` and `aria-controls`. The consumer must render its panel
   * with `id={`${idPrefix}-tabpanel-${key}`}`, `role="tabpanel"` and a
   * matching `aria-labelledby`, or `aria-controls` points nowhere (WCAG 4.1.2).
   */
  idPrefix?: string;
  /** Stable selector for the complete tab strip. */
  testId?: string;
  /** Lets a page header provide the strip's one shared bottom rule. */
  placement?: 'default' | 'header';
  /**
   * Stacks the tabs as a column: Up/Down move focus, and the selected tab takes the whole
   * surface, because a selection stripe is a Don't (`docs/DESIGN-SYSTEM.md`).
   */
  orientation?: 'horizontal' | 'vertical';
}) {
  const vertical = orientation === 'vertical';
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusKey = useRef<string | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  /* Without an edge fade on the hidden side, a scrolling strip looks like one that ends. */
  const [edgeOverflow, setEdgeOverflow] = useState({ left: false, right: false });

  const recomputeEdges = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    const left = strip.scrollLeft > 1;
    const right = strip.scrollLeft < maxScroll - 1;
    setEdgeOverflow((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right },
    );
  }, []);

  /*
   * A `scrollIntoView({inline:'nearest'})` can stop half-way when the width changes in the same
   * frame, so after layout `scrollLeft` is set directly. Reduced motion is honoured here
   * because a JS scroll is not a CSS transition.
   */
  const scrollActiveIntoView = useCallback(
    (behavior: ScrollBehavior) => {
      const strip = stripRef.current;
      const tab = tabRefs.current.get(activeKey);
      if (!strip || !tab) return;
      const tabRect = tab.getBoundingClientRect();
      const stripRect = strip.getBoundingClientRect();
      const left = tabRect.left - stripRect.left + strip.scrollLeft;
      const right = left + tabRect.width;
      let target = strip.scrollLeft;
      if (right > strip.scrollLeft + strip.clientWidth) target = right - strip.clientWidth;
      if (left < target) target = left;
      if (target !== strip.scrollLeft) strip.scrollTo({ left: target, behavior });
    },
    [activeKey],
  );

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    recomputeEdges();
    strip.addEventListener('scroll', recomputeEdges, { passive: true });
    /*
     * A resize can push the active tab out without a remount, so the same correction runs,
     * unanimated because it is a layout consequence.
     */
    const onResize = () => {
      recomputeEdges();
      scrollActiveIntoView('auto');
    };
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    resizeObserver?.observe(strip);
    return () => {
      strip.removeEventListener('scroll', recomputeEdges);
      resizeObserver?.disconnect();
    };
  }, [recomputeEdges, scrollActiveIntoView, items.length]);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // The tab count re-corrects on the frame where a new tab changed the width.
    const frame = requestAnimationFrame(() => scrollActiveIntoView(reduced ? 'auto' : 'smooth'));
    return () => cancelAnimationFrame(frame);
  }, [scrollActiveIntoView, items.length]);

  /* Focus follows a keyboard activation, or the next arrow press lands on an unrelated tab. */
  useEffect(() => {
    if (pendingFocusKey.current !== activeKey) return;
    tabRefs.current.get(activeKey)?.focus();
    pendingFocusKey.current = null;
  }, [activeKey]);

  const activateTab = (key: string) => {
    tabRefs.current.get(key)?.focus();
    if (key === activeKey) {
      pendingFocusKey.current = null;
      return;
    }
    pendingFocusKey.current = key;
    onSelect(key);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null;

    const forward = vertical ? 'ArrowDown' : 'ArrowRight';
    const backward = vertical ? 'ArrowUp' : 'ArrowLeft';
    switch (event.key) {
      case forward:
        nextIndex = (currentIndex + 1) % items.length;
        break;
      case backward:
        nextIndex = (currentIndex - 1 + items.length) % items.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextItem = items[nextIndex];
    if (nextItem) activateTab(nextItem.key);
  };

  const fade = 'var(--tabbar-edge-fade)';
  const maskImage = vertical
    ? undefined
    : edgeOverflow.left && edgeOverflow.right
      ? `linear-gradient(to right, transparent 0, black ${fade}, black calc(100% - ${fade}), transparent 100%)`
      : edgeOverflow.right
        ? `linear-gradient(to right, black calc(100% - ${fade}), transparent 100%)`
        : edgeOverflow.left
          ? `linear-gradient(to right, transparent 0, black ${fade})`
          : undefined;

  return (
    <div
      ref={stripRef}
      data-testid={testId}
      role="tablist"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel}
      /*
       * Declares a deliberate horizontal strip, which `responsive-overflow-audit` exempts from
       * the "nothing past the viewport" rule.
       */
      data-scroll-x={vertical ? undefined : 'true'}
      data-edge-overflow={
        vertical
          ? undefined
          : edgeOverflow.left && edgeOverflow.right
          ? 'both'
          : edgeOverflow.right
            ? 'right'
            : edgeOverflow.left
              ? 'left'
              : undefined
      }
      // Scrolls inside itself instead of wrapping, so page-level overflow never happens.
      className={
        vertical
          ? "flex flex-col gap-0.5"
          : placement === 'header'
            ? "flex h-full items-end gap-3 overflow-x-auto"
            : "flex gap-3 overflow-x-auto border-b border-[color:var(--color-divider)]"
      }
      style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
    >
      {items.map((item, index) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            data-testid={item.testId}
            ref={(element) => {
              if (element) tabRefs.current.set(item.key, element);
              else tabRefs.current.delete(item.key);
            }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${idPrefix}-tabpanel-${item.key}`}
            id={`${idPrefix}-tab-${item.key}`}
            tabIndex={active ? 0 : -1}
            /*
             * The name is stated, because the label and count spans concatenate with no
             * separator (`Connectors0`). `countTitle` still carries the unit through `title`.
             */
            aria-label={item.count === undefined ? undefined : `${item.label}, ${item.count}`}
            title={item.count !== undefined ? item.countTitle : undefined}
            onClick={() => activateTab(item.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            /*
             * The `shrink-0 whitespace-nowrap` classes stop a flex child in an `overflow-x-auto` row
             * from wrapping. Heights are minimums so zoomed text grows the tab; the touch-floor
             * classes (`app/globals.css`) are real min-heights, so tabs never share phantom targets.
             */
            className={
              vertical
                ? "atlas-touch-floor relative inline-flex min-h-[var(--control-h-lg)] w-full items-center gap-2 rounded-card px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)] " +
                  (active
                    ? "bg-[color:var(--color-indigo-a14)] font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] shadow-[inset_0_0_0_1px_var(--color-indigo-line-a22)]"
                    : "bg-transparent font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]")
                :
              "atlas-touch-floor atlas-touch-floor-wide relative -mb-px inline-flex min-h-[var(--control-h-lg)] shrink-0 items-center gap-2 whitespace-nowrap border-b-[length:var(--tabbar-underline)] bg-transparent px-3 font-[var(--font-weight-emphasis)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)] " +
              (active
                ? "border-b-[color:var(--color-indigo-accent)] font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
                : "border-transparent text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]")
            }
          >
            {/*
              * Both halves are real boxes with explicit leading, so the sans label and mono
              * count stay aligned whichever script a tab holds.
              */}
            <span className="text-body leading-body">{item.label}</span>
            {item.count !== undefined ? (
              // The number is already in the `aria-label`; hiding it here stops a second
              // reading.
              <span
                aria-hidden
                className="font-mono text-label leading-label font-[var(--font-weight-emphasis)] tracking-[var(--tracking-label)] tabular-nums text-[color:var(--color-text-secondary)]"
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
