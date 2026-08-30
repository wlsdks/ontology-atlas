import type { VaultDoc } from '@/entities/docs-vault';
import type { OntologyTreeNode } from '@/entities/knowledge-graph';

/**
 * Realm subtree → the vault documents to export as a block.
 *
 * A tree node id (`<kind>:<tail>`) and a vault doc slug (`capabilities/mcp-server`) are
 * different coordinate systems. This reapplies, in reverse, the rule `deriveDocNode` in
 * `derive-ontology-from-vault.ts` uses going doc → id (kind plus the last segment of the
 * file slug, with frontmatter slug winning for projects), selecting only "the real `.md`
 * that owns this id". Stub nodes synthesized purely from relation references (nodes with no
 * file of their own) fall out naturally — export copies original files, so only nodes with
 * a file mean anything.
 */

export interface RealmBlockDoc {
  uid: string;
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

/** The same id-formation rule as `deriveDocNode` — `collect-realm-block.test` catches drift. */
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
    const uid = typeof doc.frontmatter.uid === 'string' ? doc.frontmatter.uid.trim() : '';
    picked.set(doc.slug, {
      uid,
      slug: doc.slug,
      kind,
      title: doc.title?.trim() || doc.slug.split('/').pop() || doc.slug,
    });
  }
  return [...picked.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
