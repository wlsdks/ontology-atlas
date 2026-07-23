import type { VaultDoc } from '@/entities/docs-vault';
import type { OntologyTreeNode } from '@/shared/lib/ontology-tree';

/**
 * 영역(realm) 서브트리 → 블록 export 대상 vault 문서 선택.
 *
 * 트리 노드 id (`<kind>:<tail>`) 와 vault doc slug (`capabilities/mcp-server`)
 * 는 서로 다른 좌표계다. `derive-ontology-from-vault.ts` 의 `deriveDocNode`
 * 가 doc → id 로 갈 때 쓰는 규칙(kind + 파일 slug 마지막 segment, project 는
 * frontmatter slug 우선)을 여기서 역방향으로 재적용해 "이 id 를 소유한 실제
 * .md 파일"만 고른다. 관계 참조로만 합성된 stub 노드(자기 파일이 없는 노드)
 * 는 자연히 제외된다 — export 는 원본 파일 복사이므로 파일 있는 노드만
 * 의미가 있다.
 */

export interface RealmBlockDoc {
  slug: string;
  kind: string;
  title: string;
}

export function collectSubtreeNodeIds(subtree: OntologyTreeNode): Set<string> {
  const ids = new Set<string>();
  const stack: OntologyTreeNode[] = [subtree];
  while (stack.length > 0) {
    const entry = stack.pop()!;
    ids.add(entry.node.id);
    for (const child of entry.children) stack.push(child);
  }
  return ids;
}

/** `deriveDocNode` 와 같은 id 형성 규칙 — drift 시 collect-realm-block.test 가 잡는다. */
function docNodeId(doc: VaultDoc): string | null {
  const fm = doc.frontmatter;
  const kind = typeof fm.kind === 'string' ? fm.kind.trim() : '';
  if (!kind) return null;
  const fmSlug = typeof fm.slug === 'string' ? fm.slug.trim() : '';
  const idSlug =
    kind === 'project' && fmSlug ? fmSlug : doc.slug.split('/').pop() || doc.slug;
  return `${kind}:${idSlug}`;
}

export function selectRealmBlockDocs(
  subtreeIds: ReadonlySet<string>,
  docs: readonly VaultDoc[],
): RealmBlockDoc[] {
  const picked = new Map<string, RealmBlockDoc>();
  for (const doc of docs) {
    const id = docNodeId(doc);
    if (!id || !subtreeIds.has(id)) continue;
    if (picked.has(doc.slug)) continue;
    const kind = (doc.frontmatter.kind as string).trim();
    picked.set(doc.slug, {
      slug: doc.slug,
      kind,
      title: doc.title?.trim() || doc.slug.split('/').pop() || doc.slug,
    });
  }
  return [...picked.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
