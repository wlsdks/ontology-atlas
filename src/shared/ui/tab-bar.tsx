import { useEffect, useRef, type KeyboardEvent } from 'react';

/**
 * RATIO-SYSTEM §3 (`docs/prototypes/RATIO-SYSTEM.md`) — the ONE tab-bar
 * pattern for the whole app: mono tracking-caps label + engraved count,
 * active = 2px indigo underline, inactive = quaternary text (hover =
 * secondary). No color badges, no pill backgrounds — underline is the only
 * state marker. First consumer: `/ontology/insights`;
 * kept here (not page-local) so later pages needing the same tab pattern
 * reuse this instead of forking a second implementation.
 *
 * Presentational only — no router/navigation coupling, so it works whether
 * the caller reflects the active tab in a query string, local state, or
 * something else. `onSelect` is the only integration point.
 */
export interface TabBarItem {
  key: string;
  label: string;
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
}) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusKey = useRef<string | null>(null);

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

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      // On narrow phones (<=360px) the labels plus counts can exceed the viewport
      // (/ontology/insights has five tabs). Wrapping the tabs would destroy the underline
      // tab bar's identity, so this scrolls horizontally inside itself — the same pattern
      // AppSettingsMenu's tablist uses — and page-level overflow never happens.
      className="flex gap-7 overflow-x-auto border-b border-[color:var(--color-divider)]"
    >
      {items.map((item, index) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
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
            title={item.count !== undefined ? item.countTitle : undefined}
            onClick={() => activateTab(item.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            /*
             * ⚠️ **The bottom padding lands on the ramp** (measured 2026-08-08).
             *
             * It used to be `pb-[11px]` — neither a 4px multiple nor a 2px half-step, just a
             * value picked by eye on the spot. That made the tab **29px** tall (16 leading +
             * 11 bottom padding + 2 underline), a height that exists nowhere on the control
             * ramp. With no `min-h-*`, the height is decided entirely by padding arithmetic,
             * which is exactly what `docs/DESIGN-SYSTEM.md` warns against: do not call the
             * sum of padding, leading and border a ramp value.
             *
             * Dropping one pixel to `pb-2.5` (10) gives 16 + 10 + 2 = **28**, landing exactly
             * on `--control-h-sm`. The entire visual change is the underline sitting 1px
             * closer to the text.
             */
            className={
              "-mb-px inline-flex items-baseline gap-2 border-b-[length:var(--tabbar-underline)] px-0.5 pb-2.5 font-mono text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-caps-14)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)] " +
              (active
                ? "border-[color:var(--color-indigo-accent)] text-[color:var(--color-text-primary)]"
                : "border-transparent text-[color:var(--color-text-quaternary)] hover:text-[color:var(--color-text-secondary)]")
            }
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="font-mono text-label font-[var(--font-weight-emphasis)] tracking-[var(--tracking-label)] tabular-nums text-[color:var(--color-text-tertiary)]">
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
