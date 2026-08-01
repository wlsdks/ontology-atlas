/**
 * R14 #157 + #158 — vault polling 결과를 *added* / *modified* 두 부류로
 * 분류하는 pure helper. VaultDiffToaster 가 React 외 dependency 없이 호출.
 *
 * 입력: 이전 / 현재 manifest 의 (slug, mtime|null) Map.
 * 출력: 새로 등장한 slug + mtime 변화 slug.
 *
 * 정책:
 *   - prev 에 없는 slug → added.
 *   - 같은 slug 가 양쪽 다 mtime != null 이고 current > prev → modified.
 *   - 한쪽이라도 mtime == null (static manifest) → 비교 의미 없음. modified
 *     판정 skip (false-positive 차단).
 *   - removed 는 의도적으로 제외 — 사용자 명시 액션 (`delete_concept` 등)
 *     이 자체 toast 띄움. polling 결과로 다시 띄우면 noise.
 */
export function diffVaultManifest(
  prev: Map<string, number | null>,
  current: Map<string, number | null>,
): { added: string[]; modified: string[] } {
  const added: string[] = [];
  const modified: string[] = [];
  for (const [slug, mtime] of current) {
    const prevMtime = prev.get(slug);
    if (prevMtime === undefined) {
      added.push(slug);
      continue;
    }
    if (prevMtime !== null && mtime !== null && mtime > prevMtime) {
      modified.push(slug);
    }
  }
  return { added, modified };
}

/**
 * 토스트 문구를 여기서 완성 문자열로 만들지 않는 이유(N10 — 영어 토스트 ko 수리) —
 * 이 파일은 React 밖의 pure helper라 next-intl `useTranslations` 에 닿지 않는다.
 * 그래서 kind + slug/count 만 구조화해서 넘기고, 실제 로케일 문구 조립은 호출자
 * (`VaultDiffToaster`, React 컴포넌트)가 `t('featuresMisc.vaultDiffToaster.*')`
 * 로 한다 — "Added: domains/refunds" 같은 하드코딩 영문 리터럴이 다시 새지 않게.
 */
export type VaultDiffToastKind = 'added' | 'edited' | 'removed' | 'digest';

export type VaultDiffToast = {
  kind: VaultDiffToastKind;
  slug?: string;
  /** digest 전용 — 세 갈래를 각각 센다. 합계 하나로 접지 않는다. */
  counts?: { added: number; modified: number; removed: number };
  variant: 'info' | 'success';
};

/**
 * **가장 오래 남는 것이 가장 많이 말해야 한다** (2026-08-01 판정).
 *
 * 종전 판은 앞 3개를 슬러그로 내고 나머지를 `+N개 더` 라는 **별도 토스트**로
 * 냈다. 토스트는 각자 만료하므로 앞의 것이 먼저 사라지면 **참조 대상을 잃은
 * 숫자만 화면에 남는다** — 소유자가 화면에서 그 상태를 잡았다(「+4개 더」 한 장).
 * 에이전트가 한 번에 34개를 쓰면 그 잔해는 「+31개 더」가 된다.
 *
 * 그래서 부채꼴을 버리고 **버스트당 한 장**으로 간다. 몇 개냐가 아니라 **무엇이
 * 달라졌느냐**를 말해야 하므로 합계로 접지 않고 추가·편집·삭제를 각각 센다.
 * 합계가 작을 때(≤ `previewLimit`)는 이름이 숫자보다 낫다 — 그대로 슬러그를 낸다.
 *
 * ## 삭제 수를 여기서 계산하지 않는 이유
 *
 * 매니페스트는 슬러그 집합이라, **rename 이 「삭제 1 + 추가 1」로 보인다**
 * (2026-08-01 실측: `appointment-booking` → `appointment-booking-renamed` 이
 * 정확히 그 모양이었고, 역참조를 가진 파일들이 덤으로 「편집」으로 잡혔다).
 * merge 도 같다. 그래서 삭제만은 **호출자가 `.ontology-atlas/activity.jsonl` 의
 * `delete_concept` 항목에서 세어 넘긴다** — 도구 이름은 의도를 알고, 슬러그
 * 집합은 모른다.
 */
export function planVaultDiffToasts(
  diff: { added: string[]; modified: string[]; removed?: number },
  previewLimit = 3,
): VaultDiffToast[] {
  const limit = Math.max(0, previewLimit);
  const removed = Math.max(0, diff.removed ?? 0);
  const total = diff.added.length + diff.modified.length + removed;
  if (total === 0) return [];

  // 작은 변화는 이름이 숫자보다 낫다. 단 삭제가 섞이면 이름을 댈 수 없으므로
  // (지워진 문서의 슬러그는 화면에서 열 수 없다) 그때는 다이제스트로 간다.
  if (total <= limit && removed === 0) {
    return [
      ...diff.added.map((slug): VaultDiffToast => ({ kind: 'added', slug, variant: 'info' })),
      ...diff.modified.map((slug): VaultDiffToast => ({ kind: 'edited', slug, variant: 'success' })),
    ];
  }

  return [
    {
      kind: 'digest',
      counts: { added: diff.added.length, modified: diff.modified.length, removed },
      variant: 'info',
    },
  ];
}
