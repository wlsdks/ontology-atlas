/**
 * RATIO-SYSTEM §3 (`docs/prototypes/RATIO-SYSTEM.md`) — the ONE tab-bar
 * pattern for the whole app: mono tracking-caps label + engraved count,
 * active = 2px indigo underline, inactive = quaternary text (hover =
 * secondary). No color badges, no pill backgrounds — underline is the only
 * state marker. First consumer: `/ontology/insights` (개요·관계·신선도);
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
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      // overflow-x-auto — 좁은 폰(<=360px)에서 3-tab(개요·관계·신선도) 라벨+
      // 카운트 합이 뷰포트를 근소하게 넘을 수 있다. 탭을 줄바꿈하면 언더라인
      // 탭바 자체 정체성이 깨지므로 AppSettingsMenu 의 tablist 와 같은
      // 패턴(내부 가로 스크롤)으로 페이지 레벨 overflow 를 막는다.
      className="flex gap-7 overflow-x-auto border-b border-[color:var(--color-divider)]"
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`insights-tabpanel-${item.key}`}
            id={`insights-tab-${item.key}`}
            onClick={() => onSelect(item.key)}
            className={
              "-mb-px inline-flex items-baseline gap-2 border-b-[length:var(--tabbar-underline)] px-0.5 pb-[11px] font-mono text-label font-semibold uppercase tracking-[0.14em] transition-colors duration-150 " +
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
