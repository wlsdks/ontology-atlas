/**
 * 볼트의 **뼈대가 바뀐 사건** — 도메인이 생기거나 사라짐, 브릿지가 끼어듦.
 *
 * ## 왜 활동 로그가 아니라 매니페스트인가 (실측)
 *
 * 처음엔 활동 로그의 `target` 에서 `domains/…` 를 읽으면 되겠다고 봤다.
 * 실측 로그 98줄로 확인하니 **한 건도 안 잡힌다**: 도메인은 거의 항상
 * `add_concepts`(배치)로 태어나고, 배치의 target 은 `(batch)` 다
 * (`mcp/src/index.js` 의 `summarizeWrite`). 두 실측 로그에서 개별 target 으로
 * 잡힌 도메인 쓰기는 `delete_concept domains/example-domain` 하나뿐이었다.
 *
 * 그래서 이 사건들의 진실원은 **디스크의 매니페스트**다. 배치로 쓰든 한 줄씩
 * 쓰든 사람이 손으로 고치든, 볼트에 도메인이 하나 늘었으면 매니페스트에 늘어
 * 있다. 활동 로그는 「언제·누가」를, 매니페스트는 「무엇이」를 안다.
 *
 * ## 브릿지 — 원장의 정의를 그대로 잰다
 *
 * 2026-08-01 원장(「브릿지 노드를 규격의 1급 개념으로」)의 절차는 *"공유 행동을
 * 명명해 add_concept 1회 + 자식 재부모화"* 다. 그래서 여기서 브릿지는
 * **새로 생긴 노드이면서, 이미 있던 노드 둘 이상이 그리로 부모를 옮긴 것**이다.
 * 새 `kind` 를 발명하지 않는다 — 브릿지 전용 kind 는 아직 값이 없고
 * (`docs/DESIGN-SYSTEM.md` "노드 규격" §5 가 자리만 예약해 뒀다), 없는 종류를
 * 추측으로 그리는 것이 이 파일이 피하려는 바로 그 실패다.
 *
 * 둘 **이상**인 이유: 하나만 옮겨 오면 그건 계층이 는 것이 아니라 그냥
 * 부모가 바뀐 것이다. 알림은 「드물고 되돌리기 어려운」 사건의 몫이다.
 */
import { resolveLocaleDisplayName } from "./locale-display-name";

/** 매니페스트 행 중 이 파일이 보는 부분만. `VaultDoc` 의 부분집합. */
export interface VaultShapeDoc {
  slug: string;
  title?: string;
  frontmatter?: Record<string, unknown> | null;
}

/** 화면이 그대로 쓸 수 있는 노드 한 줄 — 슬러그는 링크용, 이름은 사람용. */
export interface VaultShapeNode {
  slug: string;
  /** `display_<locale>` → `title` → 슬러그 꼬리. 폴더 경로는 절대 안 들어온다. */
  name: string;
  kind?: string;
}

export interface VaultShapeSnapshot {
  nodes: Map<string, VaultShapeNode>;
  /** 슬러그 → 이 노드를 담는 상위 노드. 없으면 null. */
  parents: Map<string, string | null>;
}

/**
 * 부모를 나르는 frontmatter 키 — 앞의 것이 이긴다.
 *
 * `domain:` 이 마지막인 이유: 역량/요소는 `belongs_to` 로 브릿지에 매달리면서도
 * `domain:` 은 최상위 도메인을 그대로 들고 있을 수 있다. 그때 부모는 브릿지다.
 */
const PARENT_KEYS = ["belongs_to", "parent", "broader", "domain"] as const;

function firstStringRef(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) return item.trim();
    }
  }
  return null;
}

/**
 * 참조를 슬러그로 편다. frontmatter 는 `payment` 라고 짧게 쓰고 실제 문서는
 * `capabilities/payment` 일 수 있다 — 꼬리가 유일할 때만 이어 붙인다(모호하면
 * 잇지 않는다. 틀린 부모는 없는 부모보다 나쁘다).
 */
function resolveRef(ref: string, byTail: Map<string, string | null>, slugs: Set<string>): string | null {
  if (slugs.has(ref)) return ref;
  const resolved = byTail.get(ref);
  return resolved ?? null;
}

export function snapshotVaultShape(
  docs: readonly VaultShapeDoc[],
  locale?: string,
): VaultShapeSnapshot {
  const slugs = new Set(docs.map((doc) => doc.slug));
  // 꼬리가 둘 이상이면 null 을 박아 「모호함」을 기억한다.
  const byTail = new Map<string, string | null>();
  for (const doc of docs) {
    const tail = doc.slug.split("/").pop();
    if (!tail || tail === doc.slug) continue;
    byTail.set(tail, byTail.has(tail) ? null : doc.slug);
  }

  const nodes = new Map<string, VaultShapeNode>();
  const parents = new Map<string, string | null>();
  for (const doc of docs) {
    const tail = doc.slug.split("/").pop() || doc.slug;
    const title = typeof doc.title === "string" ? doc.title.trim() : "";
    const rawKind = doc.frontmatter?.kind;
    nodes.set(doc.slug, {
      slug: doc.slug,
      name: resolveLocaleDisplayName(doc.frontmatter, locale, title || tail).trim() || tail,
      kind: typeof rawKind === "string" && rawKind.trim() ? rawKind.trim() : undefined,
    });

    let parent: string | null = null;
    for (const key of PARENT_KEYS) {
      const ref = firstStringRef(doc.frontmatter?.[key]);
      if (!ref) continue;
      const resolved = resolveRef(ref, byTail, slugs);
      if (resolved && resolved !== doc.slug) {
        parent = resolved;
        break;
      }
    }
    parents.set(doc.slug, parent);
  }
  return { nodes, parents };
}

export interface VaultShapeDiff {
  domainsAdded: VaultShapeNode[];
  domainsRemoved: VaultShapeNode[];
  /** 자식을 둘 이상 데려간 새 노드. `childCount` 는 옮겨 온 자식 수. */
  bridges: (VaultShapeNode & { childCount: number })[];
}

/** 브릿지로 인정하는 최소 자식 수 — 하나는 「부모가 바뀐 것」이지 계층이 는 게 아니다. */
export const BRIDGE_MIN_CHILDREN = 2;

export function diffVaultShape(
  prev: VaultShapeSnapshot,
  next: VaultShapeSnapshot,
  { bridgeMinChildren = BRIDGE_MIN_CHILDREN }: { bridgeMinChildren?: number } = {},
): VaultShapeDiff {
  const domainsAdded: VaultShapeNode[] = [];
  const domainsRemoved: VaultShapeNode[] = [];
  const reparentedOnto = new Map<string, number>();

  for (const [slug, node] of next.nodes) {
    if (!prev.nodes.has(slug)) {
      if (node.kind === "domain") domainsAdded.push(node);
      continue;
    }
    // 이미 있던 노드가 부모를 **새로 생긴 노드**로 옮겼나.
    const before = prev.parents.get(slug) ?? null;
    const after = next.parents.get(slug) ?? null;
    if (after && after !== before && !prev.nodes.has(after)) {
      reparentedOnto.set(after, (reparentedOnto.get(after) ?? 0) + 1);
    }
  }

  for (const [slug, node] of prev.nodes) {
    if (!next.nodes.has(slug) && node.kind === "domain") domainsRemoved.push(node);
  }

  const bridges: (VaultShapeNode & { childCount: number })[] = [];
  for (const [slug, childCount] of reparentedOnto) {
    if (childCount < bridgeMinChildren) continue;
    const node = next.nodes.get(slug);
    if (node) bridges.push({ ...node, childCount });
  }

  const bySlug = (a: VaultShapeNode, b: VaultShapeNode) => a.slug.localeCompare(b.slug);
  domainsAdded.sort(bySlug);
  domainsRemoved.sort(bySlug);
  bridges.sort(bySlug);
  return { domainsAdded, domainsRemoved, bridges };
}
