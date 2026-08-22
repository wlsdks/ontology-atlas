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
   * 배지 숫자가 무엇을 세는지 한 마디 — `title` 로만 노출한다(잉크 0).
   * 라벨 없는 숫자는 사용자가 화면 밖에서 단위를 추측하게 만든다. 카운트가
   * 없는 탭에서는 무의미하므로 생략한다.
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
   * `id` / `aria-controls` 의 접두사. **두 번째 소비처가 생긴 순간 필수가 된
   * 값이다** — 종전엔 `insights` 가 박혀 있어서, 프로젝트 상세가 이 탭바를
   * 재사용하자 선택된 탭의 `aria-controls` 가 존재하지 않는
   * `#insights-tabpanel-overview` 를 가리켰다(axe `aria-valid-attr-value`,
   * WCAG 4.1.2 — 2026-08-04 볼트 물린 감사에서 실측).
   *
   * 인사이트에서 안 걸린 이유는 그쪽이 **활성 탭의 패널만** 렌더하고 axe 는
   * 선택된 탭의 `aria-controls` 만 해석을 요구하기 때문이다. 즉 이 결함은
   * «두 소비처 중 한쪽에서만» 뜨는 종류였고, 래칫이 그 한쪽 라우트를
   * 실재하지 않는 슬러그로 열고 있어 한 번도 렌더된 적이 없었다.
   *
   * ⚠️ **소비처는 같은 접두사로 패널을 그려야 한다** —
   * `id={`${idPrefix}-tabpanel-${key}`}` + `role="tabpanel"` +
   * `aria-labelledby={`${idPrefix}-tab-${key}`}`. 안 그리면 같은 위반이
   * 그대로 돌아온다.
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
            aria-controls={`${idPrefix}-tabpanel-${item.key}`}
            id={`${idPrefix}-tab-${item.key}`}
            tabIndex={active ? 0 : -1}
            title={item.count !== undefined ? item.countTitle : undefined}
            onClick={() => activateTab(item.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            /*
             * ⚠️ **아래 여백은 램프에 착지한다** (2026-08-08 실측).
             *
             * 종전엔 `pb-[11px]` 이었다 — 4px 배수도 2px 반스텝도 아닌, 그
             * 자리에서 손으로 고른 값. 그래서 탭 높이가 **29px**(행간 16 +
             * 아래 여백 11 + 밑줄 2)로, 컨트롤 램프 어디에도 없는 값이었다.
             * `min-h-*` 이 없어 높이가 전적으로 패딩 산술로 정해지는데,
             * 그건 `DESIGN-SYSTEM.md` 가 *"패딩+행간+보더의 합을 램프라고
             * 부르지 마라"* 고 적어 둔 바로 그 모양이다.
             *
             * `pb-2.5`(10) 로 1px 만 줄이면 16 + 10 + 2 = **28** —
             * `--control-h-sm` 에 정확히 선다. 밑줄이 글자에 1px 가까워지는
             * 것이 이 변경의 시각적 전부다.
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
