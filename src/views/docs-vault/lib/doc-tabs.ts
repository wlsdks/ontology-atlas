/**
 * 열린 문서 탭 — 순수 상태 로직 + localStorage 영속화.
 *
 * docs-chrome-round 슬라이스 B(열린 문서 탭 스트립)의 모델 레이어. 탭은
 * "워킹셋" 이지 "모드" 가 아니다 — 활성 탭의 진실원은 URL `?slug=` 이고
 * (`persistence.ts` 의 다른 UI state 와 같은 원칙), 이 모듈은 열린 슬러그
 * 목록 + 각 탭의 최근 활성화 시각만 관리한다. `DocsVaultPage` 가 `selectedSlug`
 * 변화를 관찰해 `openOrActivateDocTab` 을 호출하는 방식으로 연결된다 — URL 과
 * 싸우지 않는다.
 *
 * **소유자 확정 (2026-07):** 탭 수명은 localStorage 영구 — "macOS 앱을 다시
 * 켜도 그대로" (docs-chrome-round 초안 계약의 sessionStorage 안을 override).
 */

export interface DocTab {
  slug: string;
  title: string;
  lastActivatedAt: number;
}

/** 탭 상한 — 증식 가드(소유자 우려: "상위 모드 탭 증식"). 초과 시 LRU 축출. */
export const DOC_TABS_MAX = 8;

const DOC_TABS_KEY_PREFIX = "docsVault:openTabs:";

/** vault(sourceKey) 별로 키를 분리 — 샘플 탭이 로컬 vault 로 새지 않는다. */
export function docTabsStorageKey(sourceKey: string): string {
  return `${DOC_TABS_KEY_PREFIX}${sourceKey}`;
}

function isDocTab(value: unknown): value is DocTab {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.slug === "string" &&
    typeof v.title === "string" &&
    typeof v.lastActivatedAt === "number"
  );
}

/** localStorage 에서 sourceKey 의 탭 목록을 읽는다. 손상/미존재 시 []. */
export function readStoredDocTabs(sourceKey: string): DocTab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(docTabsStorageKey(sourceKey));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDocTab);
  } catch {
    return [];
  }
}

export function storeDocTabs(sourceKey: string, tabs: DocTab[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(docTabsStorageKey(sourceKey), JSON.stringify(tabs));
  } catch {
    /* private mode / quota — skip, 다음 세션은 그냥 다시 채워진다 */
  }
}

/**
 * 존재하지 않는 slug(rename/delete 로 사라진 문서)가 복원되면 조용히
 * 목록에서 제거. 아무것도 제거되지 않으면 원본 참조를 그대로 반환(불필요한
 * re-render 방지).
 */
export function pruneMissingDocTabs(
  tabs: DocTab[],
  validSlugs: ReadonlySet<string>,
): DocTab[] {
  const next = tabs.filter((tab) => validSlugs.has(tab.slug));
  return next.length === tabs.length ? tabs : next;
}

/** 8개 초과 시 가장 오래 activate 되지 않은 탭부터 축출(LRU). */
function evictLru(tabs: DocTab[], max: number): DocTab[] {
  if (tabs.length <= max) return tabs;
  const next = tabs.slice();
  while (next.length > max) {
    let oldestIndex = 0;
    for (let i = 1; i < next.length; i += 1) {
      if (next[i].lastActivatedAt < next[oldestIndex].lastActivatedAt) {
        oldestIndex = i;
      }
    }
    next.splice(oldestIndex, 1);
  }
  return next;
}

/**
 * 문서 선택 부수효과 — 이미 열려 있으면 activate(+title 갱신)만, 없으면
 * 새 탭을 뒤에 추가한 뒤 상한(`DOC_TABS_MAX`) 초과분을 LRU 로 축출한다.
 * 새로 열리거나 activate 된 탭은 항상 최신 시각을 가지므로 같은 호출로는
 * 절대 축출되지 않는다.
 */
export function openOrActivateDocTab(
  tabs: DocTab[],
  next: { slug: string; title: string },
  now: number = Date.now(),
): DocTab[] {
  const idx = tabs.findIndex((tab) => tab.slug === next.slug);
  if (idx >= 0) {
    const updated = tabs.slice();
    updated[idx] = { ...updated[idx], title: next.title, lastActivatedAt: now };
    return updated;
  }
  const added = [...tabs, { slug: next.slug, title: next.title, lastActivatedAt: now }];
  return evictLru(added, DOC_TABS_MAX);
}

export interface CloseDocTabResult {
  tabs: DocTab[];
  /** null = 탭이 0개가 됨 — 호출부가 "목록 첫 문서 또는 README" 로 폴백. */
  nextActiveSlug: string | null;
}

/**
 * 탭 닫기.
 * - 닫는 탭이 활성 탭이 아니면 활성 선택은 그대로 유지.
 * - 활성 탭을 닫으면 인접 탭으로 이동 — **왼쪽 우선**, 왼쪽이 없으면(맨 왼쪽
 *   탭을 닫은 경우) 오른쪽.
 * - 마지막 남은 탭을 닫으면 `nextActiveSlug: null` — 폴백은 호출부 책임
 *   (목록 첫 문서 또는 README).
 */
export function closeDocTab(
  tabs: DocTab[],
  slug: string,
  activeSlug: string | null,
): CloseDocTabResult {
  const idx = tabs.findIndex((tab) => tab.slug === slug);
  if (idx === -1) return { tabs, nextActiveSlug: activeSlug };

  const nextTabs = [...tabs.slice(0, idx), ...tabs.slice(idx + 1)];

  if (activeSlug !== slug) {
    return { tabs: nextTabs, nextActiveSlug: activeSlug };
  }
  if (nextTabs.length === 0) {
    return { tabs: nextTabs, nextActiveSlug: null };
  }
  const leftNeighbor = idx > 0 ? tabs[idx - 1] : null;
  const rightNeighbor = idx < tabs.length - 1 ? tabs[idx + 1] : null;
  const neighbor = leftNeighbor ?? rightNeighbor;
  return { tabs: nextTabs, nextActiveSlug: neighbor?.slug ?? null };
}
