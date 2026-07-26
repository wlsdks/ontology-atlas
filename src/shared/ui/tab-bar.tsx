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
}

export function TabBar({
  items,
  activeKey,
  onSelect,
  ariaLabel,
}: {
  items: readonly TabBarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  ariaLabel: string;
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
      // overflow-x-auto — 좁은 폰(<=360px)에서 탭 라벨+카운트 합이 뷰포트를
      // 넘을 수 있다(인사이트는 5탭). 탭을 줄바꿈하면 언더라인
      // 탭바 자체 정체성이 깨지므로 AppSettingsMenu 의 tablist 와 같은
      // 패턴(내부 가로 스크롤)으로 페이지 레벨 overflow 를 막는다.
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
            aria-controls={`insights-tabpanel-${item.key}`}
            id={`insights-tab-${item.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => activateTab(item.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={
              "-mb-px inline-flex items-baseline gap-2 border-b-[length:var(--tabbar-underline)] px-0.5 pb-[11px] font-mono text-label font-semibold uppercase tracking-[0.14em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-ring-a46)] " +
              (active
                ? "border-[color:var(--color-indigo-accent)] text-[color:var(--color-text-primary)]"
                : "border-transparent text-[color:var(--color-text-quaternary)] hover:text-[color:var(--color-text-secondary)]")
            }
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="font-mono text-label font-semibold tracking-[0.02em] tabular-nums text-[color:var(--color-text-tertiary)]">
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
