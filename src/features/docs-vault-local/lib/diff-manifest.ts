import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';

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
 * 그래서 kind + 이름/개수 만 구조화해서 넘기고, 실제 로케일 문구 조립은 호출자
 * (`VaultDiffToaster`, React 컴포넌트)가 `t('featuresMisc.vaultDiffToaster.*')`
 * 로 한다 — "Added: domains/refunds" 같은 하드코딩 영문 리터럴이 다시 새지 않게.
 */
export type VaultDiffToastKind = 'added' | 'edited' | 'removed' | 'digest';

/**
 * **토스트가 슬러그를 말하지 않는 계약**(2026-08-01 소유자 지시).
 *
 * 종전엔 `편집됨: capabilities/payment-authorization` 이라고 썼다. 그 한 줄이
 * 사용자에게 주는 정보는 0에 가깝다 — `capabilities/` 는 개발자 폴더 이름이고,
 * `payment-authorization` 은 파일 이름이지 사람이 그 개념을 부르는 이름이 아니다
 * (볼트 노드는 `display_ko`/`display_en` 을 갖고 지도·INDEX·팝오버는 이미 그걸
 * 그린다 — 토스트만 원시 슬러그를 쓰고 있었다).
 *
 * 그래서 이 타입이 화면으로 나가는 세 조각을 고정한다:
 *   - `kind` — 「역량 / 도메인 / 요소 / 프로젝트」 평문으로 옮길 원본 kind.
 *     **매니페스트에 없으면 `undefined` 로 둔다. 지어내지 않는다.**
 *   - `name` — 사람이 부르는 이름. `display_<locale>` → `title` → 슬러그 꼬리.
 *     **폴더 경로는 어떤 경우에도 여기 들어오지 않는다** (`toVaultDiffNode` 가
 *     마지막 조각만 취한다).
 *   - `slug` — 화면 밖 용도(딥링크·중복 제거)로만 남긴다.
 */
export type VaultDiffNode = {
  slug: string;
  kind?: string;
  name: string;
};

/** 한 갈래(추가/편집) 안에서 종류별로 센 결과. `kind` 없는 행은 종류를 모르는 몫. */
export type VaultDiffKindCount = { kind?: string; count: number };

export type VaultDiffActionCount = {
  total: number;
  /** 총합이 0이면 빈 배열. 총합이 0이 아니면 최소 한 행이 있다. */
  byKind: VaultDiffKindCount[];
};

/**
 * digest 전용 — 세 갈래를 각각 센다. 합계 하나로 접지 않는다.
 *
 * 추가·편집은 매니페스트에서 종류를 읽을 수 있으므로 종류별로 쪼갠다
 * (「역량 3 · 요소 12 추가」가 「15개 추가」보다 낫다). **삭제는 숫자뿐이다** —
 * 지워진 문서는 매니페스트에서 사라져 kind 를 읽을 곳이 없고, 개수 자체도
 * 활동 로그의 `delete_concept` 에서 온다(아래 주석 참고).
 */
export type VaultDiffDigestCounts = {
  added: VaultDiffActionCount;
  modified: VaultDiffActionCount;
  removed: number;
};

export type VaultDiffToast = {
  kind: VaultDiffToastKind;
  node?: VaultDiffNode;
  counts?: VaultDiffDigestCounts;
  variant: 'info' | 'success';
};

/**
 * 매니페스트 행 → 화면에 낼 수 있는 조각. **슬러그가 화면으로 새는 유일한
 * 경로를 여기 하나로 모은다.**
 *
 * 이름 우선순위: `display_<locale>` → `title` → 슬러그의 **마지막 조각**.
 * 셋째는 최후 수단이고, 그때도 `capabilities/` 같은 폴더 이름은 붙지 않는다.
 * (실전에서 셋째까지 내려가는 일은 드물다 — 매니페스트의 `title` 자체가 이미
 * frontmatter title → 첫 H1 → 슬러그 꼬리 순으로 채워진다.)
 */
export function toVaultDiffNode(
  doc: {
    slug: string;
    title?: string;
    frontmatter?: Record<string, unknown> | null;
  },
  locale?: string,
): VaultDiffNode {
  const tail = doc.slug.split('/').pop() || doc.slug;
  const title = typeof doc.title === 'string' ? doc.title.trim() : '';
  const name = resolveLocaleDisplayName(doc.frontmatter, locale, title || tail);
  const rawKind = doc.frontmatter?.kind;
  const kind = typeof rawKind === 'string' && rawKind.trim() ? rawKind.trim() : undefined;
  return { slug: doc.slug, kind, name: name.trim() || tail };
}

/**
 * 종류별 집계. 종류를 모르는 몫은 **마지막 한 행으로 모은다** — 섞어 세면
 * 「역량 3」이 실제로는 4였는지 알 수 없게 되고, 버리면 합계가 안 맞는다.
 */
function countByKind(nodes: VaultDiffNode[]): VaultDiffActionCount {
  const byKind = new Map<string, number>();
  let untyped = 0;
  for (const node of nodes) {
    if (!node.kind) {
      untyped += 1;
      continue;
    }
    byKind.set(node.kind, (byKind.get(node.kind) ?? 0) + 1);
  }
  const rows: VaultDiffKindCount[] = [...byKind.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, count]) => ({ kind, count }));
  if (untyped > 0) rows.push({ count: untyped });
  return { total: nodes.length, byKind: rows };
}

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
  diff: { added: VaultDiffNode[]; modified: VaultDiffNode[]; removed?: number },
  previewLimit = 3,
): VaultDiffToast[] {
  const limit = Math.max(0, previewLimit);
  const removed = Math.max(0, diff.removed ?? 0);
  const total = diff.added.length + diff.modified.length + removed;
  if (total === 0) return [];

  // 작은 변화는 이름이 숫자보다 낫다. 단 삭제가 섞이면 이름을 댈 수 없으므로
  // (지워진 문서는 매니페스트에서 사라져 이름을 읽을 곳이 없다) 그때는
  // 다이제스트로 간다.
  if (total <= limit && removed === 0) {
    return [
      ...diff.added.map((node): VaultDiffToast => ({ kind: 'added', node, variant: 'info' })),
      ...diff.modified.map((node): VaultDiffToast => ({ kind: 'edited', node, variant: 'success' })),
    ];
  }

  return [
    {
      kind: 'digest',
      counts: {
        added: countByKind(diff.added),
        modified: countByKind(diff.modified),
        removed,
      },
      variant: 'info',
    },
  ];
}
