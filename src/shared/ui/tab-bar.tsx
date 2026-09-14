import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * Shared section navigation. Tabs sit on one quiet content boundary with a
 * 2px bottom indicator, stronger selected type, and readable inactive labels.
 * The 40px fine-pointer floor gives labels space; touch still promotes to 44px.
 * These are section tabs, not raised file tabs or a segmented-control capsule.
 *
 * Presentational only — no router/navigation coupling, so it works whether
 * the caller reflects the active tab in a query string, local state, or
 * something else. `onSelect` is the only integration point.
 */
export interface TabBarItem {
  key: string;
  label: string;
  /** Stable selector for a product-specific tab. */
  testId?: string;
  /** Engraved count next to the label (e.g. node count) — omit for tabs with no count. */
  count?: string | number;
  /**
   * One phrase naming what the count counts, exposed through `title` only so it costs no
   * ink. An unlabelled number leaves the user guessing at the unit. Omit it on tabs that
   * have no count.
   */
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
}: {
  items: readonly TabBarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  ariaLabel: string;
  /**
   * Prefix for `id` and `aria-controls`. **It became mandatory the moment a second consumer
   * appeared**: this used to be hard-coded to `insights`, so when the project detail page
   * reused the tab bar, the selected tab's `aria-controls` pointed at a non-existent
   * `#insights-tabpanel-overview` (axe `aria-valid-attr-value`, WCAG 4.1.2 — measured in
   * the 2026-08-04 audit against a connected vault).
   *
   * It never surfaced on insights because that page renders **only the active tab's
   * panel**, and axe requires only the selected tab's `aria-controls` to resolve. So this
   * defect could appear at just one of the two consumers — and the ratchet was opening that
   * route with a slug that did not exist, so it had never rendered at all.
   *
   * ⚠️ **Consumers must render the panel with the same prefix** —
   * `id={`${idPrefix}-tabpanel-${key}`}` plus `role="tabpanel"` plus
   * `aria-labelledby={`${idPrefix}-tab-${key}`}`. Skip it and the violation returns
   * unchanged.
   */
  idPrefix?: string;
  /** Stable selector for the complete tab strip. */
  testId?: string;
  /** Lets a page header provide the strip's one shared bottom rule. */
  placement?: 'default' | 'header';
}) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusKey = useRef<string | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  /*
   * When the tabs do not fit, an edge fade is drawn **only on the side with hidden tabs** —
   * the same affordance and the same width as the docs strip (`--tabbar-edge-fade`).
   * Without it a strip that scrolls looks like a strip that ends, and the tab past the
   * edge is silently unreachable.
   */
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
   * **Bring the active tab into view.** Ported from `DocsVaultTabStrip`, including the
   * defect it records: `scrollIntoView({inline:'nearest'})` can stop with the active tab
   * only half exposed when the strip width changes in the same frame. After layout settles
   * (rAF) `scrollLeft` is computed directly, so the whole tab is inside the viewport
   * deterministically.
   *
   * ⚠️ Without this, arriving at `?tab=<last>` on a narrow screen shows a strip scrolled to
   * zero with the selected tab off the right edge.
   *
   * A JS scroll animation cannot be switched off by the reduced-motion base layer (it is a
   * behaviour argument, not a CSS transition), so it is respected here.
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
     * ⚠️ **A width change is the other way the active tab leaves the viewport** (measured
     * 2026-09-05: at en/390 the strip sat at scrollLeft 0 with the selected tab 433px past
     * the right edge, because the mount-time correction had run at 1440). Rotating a phone
     * or dragging a window is not a remount, so the same correction runs here — without
     * animation, since this is a layout consequence rather than a chosen navigation.
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
    // The tab count is a dependency too, so it re-corrects on the frame where a new tab
    // changed the width.
    const frame = requestAnimationFrame(() => scrollActiveIntoView(reduced ? 'auto' : 'smooth'));
    return () => cancelAnimationFrame(frame);
  }, [scrollActiveIntoView, items.length]);

  /*
   * **Keyboard activation moves focus with the selection.** The caller re-renders with the
   * new `activeKey`, and the tab that was activated has to still be the focused one — an
   * arrow key that changes the panel and leaves focus behind makes the next arrow press go
   * somewhere unrelated.
   */
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

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % items.length;
        break;
      case 'ArrowLeft':
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

  // A transparent fade only on the edge that has hidden tabs. Four states: both, either, neither.
  const fade = 'var(--tabbar-edge-fade)';
  const maskImage =
    edgeOverflow.left && edgeOverflow.right
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
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      /*
       * Declares this a deliberate horizontal strip. `responsive-overflow-audit` exempts a
       * declared strip's children from the "nothing past the viewport" rule and nothing
       * else — keying on computed `overflow-x` matched the page's vertical scroll
       * container too, and the sweep stopped being able to fail.
       */
      data-scroll-x="true"
      data-edge-overflow={
        edgeOverflow.left && edgeOverflow.right
          ? 'both'
          : edgeOverflow.right
            ? 'right'
            : edgeOverflow.left
              ? 'left'
              : undefined
      }
      // On narrow phones the labels plus counts exceed the viewport — /ontology/insights
      // carries seven tabs. Wrapping them would destroy the document strip's identity,
      // so this scrolls horizontally inside itself — the same pattern AppSettingsMenu's
      // tablist uses — and page-level overflow never happens.
      className={
        placement === 'header'
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
             * ⚠️ **The count must not run into the label.** Measured on `/en/mcp/`,
             * 2026-09-05: the accessible name of the connectors tab was `Connectors0` —
             * the label text node and the count span sit side by side, and the name
             * computation concatenates them with nothing between. Read aloud that is one
             * word, and a screen-reader user hunting for "Connectors" hears a tab that is
             * not it.
             *
             * The name is stated rather than left to concatenation, so the separator
             * cannot depend on whitespace an engine may or may not insert. `countTitle`
             * still reaches the description through `title`, which is where the *unit*
             * belongs — the name says which tab and how many, not what they are.
             */
            aria-label={item.count === undefined ? undefined : `${item.label}, ${item.count}`}
            title={item.count !== undefined ? item.countTitle : undefined}
            onClick={() => activateTab(item.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            /*
             * ⚠️ `shrink-0 whitespace-nowrap` restores this file's own contract. Without
             * them a flex child in an `overflow-x-auto` row shrinks to fit instead of
             * overflowing, so the strip that was written to scroll silently wrapped each
             * label onto two lines at 390 and the underline no longer sat under one tab.
             *
             * `atlas-touch-floor` is the finger height. This is a real `min-height` rather
             * than an expanded hit area on purpose (`app/globals.css`): adjacent document
             * tabs must never have overlapping phantom targets. Fine pointers use the lg
             * control height as a minimum, so a reader's enlarged line box can grow the tab
             * rather than clip at a fixed height; coarse pointers promote the same minimum to
             * 44px. `items-center` keeps the label centered above its indicator at every height.
             */
            className={
              "atlas-touch-floor relative -mb-px inline-flex min-h-[var(--control-h-lg)] shrink-0 items-center gap-2 whitespace-nowrap border-b-[length:var(--tabbar-underline)] bg-transparent px-3 font-[var(--font-weight-emphasis)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)] " +
              (active
                ? "border-b-[color:var(--color-indigo-accent)] font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
                : "border-transparent text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]")
            }
          >
            {/*
              ⚠️ **Both halves are real boxes with explicit leading, so their vertical
              alignment does not depend on which glyphs a tab happens to hold.**

              The label used to be a bare text node — an anonymous flex item taking the
              button's own metrics — beside a count in an explicit `font-mono` span. While
              every tab was mono that was one font and one box height. It stopped being one
              once the caps device stood down for Hangul: the label resolved to the sans
              stack and the count stayed monospace, and the two no longer ended at the same
              place.

              The navigation label uses the normal sans body step; only the engraved count
              stays compact and monospaced. Centering both explicit line boxes keeps their
              optical relationship stable across scripts.
            */}
            <span className="text-body leading-body">{item.label}</span>
            {item.count !== undefined ? (
              // The number is already in the button's `aria-label`; leaving it in the
              // accessibility tree as well would read it twice.
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
