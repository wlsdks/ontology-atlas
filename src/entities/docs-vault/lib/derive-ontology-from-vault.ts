import { deriveDisplayTitle } from '@/shared/lib/derive-display-title';
import { readDisplayLocales } from '@/shared/lib/locale-display-name';
import { humanizeCodePathTitle } from '@/shared/lib/humanize-code-path-title';
import type { VaultDoc, VaultManifest } from '../model/types';

/**
 * Derives ontology stubs straight from vault frontmatter, which is the source of truth. Relation
 * keys: `domain`, `domains` (reverse direction), `capabilities`, `elements`, `relates`,
 * `dependencies`/`depends_on`, `contains`, `describes`, `broader` (is_a).
 */

type OntologyStubSource = 'frontmatter';

/**
 * Reference → document node id by the compiler's aliases (`mcp/src/ontology-compiler.mjs`):
 * full slug, last segment, frontmatter `slug:`. An alias claimed twice is dropped, never guessed.
 */
type DocAliasIndex = ReadonlyMap<string, string>;

interface OntologyStubNode {
  /** `<kind>:<slug>`, or `unknown:<slug>` as a fallback. */
  id: string;
  title: string;
  /** Render-only short title from `deriveDisplayTitle`; search still matches the full `title`. */
  display: string;
  /** Every `display_<locale>` key verbatim; the render boundary picks one, since derivation is cached. */
  displayLocales?: Readonly<Record<string, string>>;
  kind: string;
  /** The vault document this came from. */
  sourceSlug: string;
  /**
   * Whether the node has its own `.md`. A relation-only node's `sourceSlug` is the citing
   * document's, so it cannot answer this.
   */
  hasOwnDocument: boolean;
  /** `human` or `agent:<name>`; absence means unknown, never `human`. */
  createdBy?: string;
  /**
   * For a node without its own document, the reference as written in the vault. The slugified id
   * cannot be reversed, so agents are handed this string (the compiler's edge `ref`).
   */
  ref?: string;
  source: OntologyStubSource;
  /** Free-text summary — the first body paragraph, or the `description` key. */
  summary?: string;
}

interface OntologyStubEdge {
  /** `<from>--<type>-->|<to>` */
  id: string;
  from: string;
  to: string;
  type: 'contains' | 'depends_on' | 'describes' | 'related_to' | 'is_a';
  source: OntologyStubSource;
  sourceSlug: string;
  /** Why this relation exists, from `relation_notes: {ref: why}`. */
  label?: string;
}

export interface VaultOntologyDerivation {
  nodes: OntologyStubNode[];
  edges: OntologyStubEdge[];
  /** Frontmatter `kind:` docs before relation-derived stubs are added. */
  sourceConceptCount: number;
  /** Frontmatter `kind:` docs by kind before relation-derived stubs are added. */
  sourceKindCounts: Record<string, number>;
  /** Diagnostics for the empty state when no doc produced a candidate. */
  warnings: string[];
}

const VALID_RELATION_TYPES = new Set([
  'contains',
  'depends_on',
  'describes',
  'related_to',
  'is_a',
]);

// Exported so bootstrap names domain files by the same rule derivation resolves.
export function slugifyName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  }
  // Relation keys are arrays; coercing a scalar would draw edges the MCP compiler rejects.
  return [];
}

// Vault folder name → singular kind, for folder-prefixed refs.
const FOLDER_TO_KIND: Record<string, string> = {
  projects: 'project',
  domains: 'domain',
  capabilities: 'capability',
  elements: 'element',
  documents: 'document',
};

function resolveFolderPrefixedRef(ref: string): { id: string; kind: string; title: string } | null {
  const trimmed = ref.trim();
  const slashIdx = trimmed.indexOf('/');
  if (slashIdx <= 0) return null;
  const folder = trimmed.slice(0, slashIdx);
  const tailRaw = trimmed.slice(slashIdx + 1);
  const tailSlug = slugifyName(tailRaw);
  if (!tailSlug) return null;
  const kind = FOLDER_TO_KIND[folder];
  if (!kind) return null;
  return {
    id: `${kind}:${tailSlug}`,
    kind,
    title: tailRaw.trim() || tailSlug,
  };
}

/** `folder/slug` → `<kind>:<slug>` for a known folder; anything else → `unknown:<slugified>`. */
function resolveRelatesRef(rel: string): string | null {
  const trimmed = rel.trim();
  if (!trimmed) return null;
  const folderRef = resolveFolderPrefixedRef(trimmed);
  if (folderRef) {
    return folderRef.id;
  }
  const slug = slugifyName(trimmed);
  if (!slug) return null;
  return `unknown:${slug}`;
}

function deriveDocNode(doc: VaultDoc): OntologyStubNode | null {
  const fm = doc.frontmatter;
  const rawKind = typeof fm.kind === 'string' ? fm.kind.trim() : '';
  if (!rawKind) return null;
  const title = doc.title?.trim() || doc.slug.split('/').pop() || doc.slug;
  // A project id uses the frontmatter slug so it equals `computeProjectSlug` and the containment
    // `projectIds`; other kinds keep the file slug so external refs still resolve.
  let idSlug: string;
  const fmSlug = typeof fm.slug === 'string' ? fm.slug.trim() : '';
  if (rawKind === 'project' && fmSlug) {
    idSlug = fmSlug;
  } else {
    idSlug = doc.slug.split('/').pop() || doc.slug;
  }
  const id = `${rawKind}:${idSlug}`;
  const baseDisplay = deriveDisplayTitle(fm, title);
  // Only an element whose display is still its raw title gets a readable name from the path.
  const display =
    rawKind === 'element' && baseDisplay === title
      ? humanizeCodePathTitle(title) ?? baseDisplay
      : baseDisplay;
  // One source for locale display names (`shared/lib/locale-display-name`), shared with list and search.
  const displayLocales = readDisplayLocales(fm);
  return {
    id,
    title,
    display,
    displayLocales,
    kind: rawKind,
    sourceSlug: doc.slug,
    hasOwnDocument: true,
    createdBy: typeof fm.created_by === 'string' ? fm.created_by.trim() : undefined,
    source: 'frontmatter',
    summary: doc.description ?? doc.excerpt ?? undefined,
  };
}

function deriveOntologyFromVaultUncached(
  manifest: VaultManifest,
): VaultOntologyDerivation {
  const nodes = new Map<string, OntologyStubNode>();
  const edges: OntologyStubEdge[] = [];
  const warnings: string[] = [];

  // Pass 1 registers every document node so pass 2 resolves refs instead of minting duplicates.
  let sourceConceptCount = 0;
  const sourceKindCounts: Record<string, number> = {};
  // The compiler's three aliases; one claimed by two documents becomes null.
  const aliasClaims = new Map<string, string | null>();
  const claimAlias = (alias: string | undefined, nodeId: string) => {
    const key = alias?.trim();
    if (!key) return;
    const claimed = aliasClaims.get(key);
    if (claimed === undefined) aliasClaims.set(key, nodeId);
    else if (claimed !== nodeId) aliasClaims.set(key, null);
  };
  for (const doc of manifest.docs) {
    const derived = deriveDocNode(doc);
    if (derived) {
      let docNode = derived;
      // Two same-kind docs with the same tail would collide: the later keeps its full-path id, a
            // warning is raised, and the shared tail alias resolves to neither.
      if (nodes.has(docNode.id)) {
        const disambiguated = `${docNode.kind}:${doc.slug}`;
        warnings.push(
          `two documents derive the node id "${docNode.id}"; ${doc.slug} keeps its full-path id`,
        );
        docNode = { ...docNode, id: disambiguated };
      }
      nodes.set(docNode.id, docNode);
      sourceConceptCount += 1;
      sourceKindCounts[docNode.kind] = (sourceKindCounts[docNode.kind] ?? 0) + 1;
      claimAlias(doc.slug, docNode.id);
      claimAlias(doc.slug.split('/').pop(), docNode.id);
      const fmSlug = doc.frontmatter.slug;
      if (typeof fmSlug === 'string') claimAlias(fmSlug, docNode.id);
    }
  }
  const docAliases: DocAliasIndex = new Map(
    [...aliasClaims].filter((entry): entry is [string, string] => entry[1] !== null),
  );
  const existingNodeIdFor = (ref: string): string | null =>
    docAliases.get(ref.trim()) ?? null;

  for (const doc of manifest.docs) {
    const docNode = deriveDocNode(doc);
    if (!docNode) continue;

    const fm = doc.frontmatter;

    // `domain: X` puts this doc under X, so the contains edge runs domain → doc.
    if (typeof fm.domain === 'string' && fm.domain.trim() !== '') {
      const folderRef = resolveFolderPrefixedRef(fm.domain);
      const domainSlug = folderRef?.kind === 'domain'
        ? folderRef.id.slice('domain:'.length)
        : slugifyName(fm.domain);
      if (domainSlug) {
        const domainId = existingNodeIdFor(fm.domain) ?? `domain:${domainSlug}`;
        if (!nodes.has(domainId)) {
          nodes.set(domainId, {
            id: domainId,
            title: folderRef?.kind === 'domain' ? folderRef.title : fm.domain.trim(),
            display: deriveDisplayTitle(undefined, folderRef?.kind === 'domain' ? folderRef.title : fm.domain.trim()),
            kind: 'domain',
            sourceSlug: doc.slug,
            hasOwnDocument: false,
            ref: fm.domain.trim(),
            source: 'frontmatter',
          });
        }
        edges.push({
          id: `${domainId}--contains-->${docNode.id}`,
          from: domainId,
          to: docNode.id,
          type: 'contains',
          source: 'frontmatter',
          sourceSlug: doc.slug,
        });
      }
    }

    // `domains:` is the reverse: this doc contains the listed domains.
    for (const dom of asStringArray(fm.domains)) {
      // Folder-prefixed refs (`domains/tasks`) resolve like the singular branch, or slugify mints a phantom.
      const folderRef = resolveFolderPrefixedRef(dom);
      const domId =
        existingNodeIdFor(dom) ??
        (folderRef?.kind === 'domain' ? folderRef.id : `domain:${slugifyName(dom)}`);
      if (domId === 'domain:') continue;
      if (!nodes.has(domId)) {
        nodes.set(domId, {
          id: domId,
          title: folderRef?.kind === 'domain' ? folderRef.title : dom,
          display: deriveDisplayTitle(undefined, folderRef?.kind === 'domain' ? folderRef.title : dom),
          kind: 'domain',
          sourceSlug: doc.slug,
          hasOwnDocument: false,
          ref: dom.trim(),
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--contains-->${domId}`,
        from: docNode.id,
        to: domId,
        type: 'contains',
        source: 'frontmatter',
        sourceSlug: doc.slug,
      });
    }

    for (const cap of asStringArray(fm.capabilities)) {
      const folderRef = resolveFolderPrefixedRef(cap);
      const capSlug = folderRef?.kind === 'capability'
        ? folderRef.id.slice('capability:'.length)
        : slugifyName(cap);
      if (!capSlug) continue;
      const capId = existingNodeIdFor(cap) ?? `capability:${capSlug}`;
      if (!nodes.has(capId)) {
        nodes.set(capId, {
          id: capId,
          title: folderRef?.kind === 'capability' ? folderRef.title : cap,
          display: deriveDisplayTitle(undefined, folderRef?.kind === 'capability' ? folderRef.title : cap),
          kind: 'capability',
          sourceSlug: doc.slug,
          hasOwnDocument: false,
          ref: cap.trim(),
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--contains-->${capId}`,
        from: docNode.id,
        to: capId,
        type: 'contains',
        source: 'frontmatter',
        sourceSlug: doc.slug,
      });
    }

    for (const el of asStringArray(fm.elements)) {
      const folderRef = resolveFolderPrefixedRef(el);
      const elSlug = folderRef?.kind === 'element'
        ? folderRef.id.slice('element:'.length)
        : slugifyName(el);
      if (!elSlug) continue;
      const elId = existingNodeIdFor(el) ?? `element:${elSlug}`;
      if (!nodes.has(elId)) {
        nodes.set(elId, {
          id: elId,
          title: folderRef?.kind === 'element' ? folderRef.title : el,
          display:
            humanizeCodePathTitle(el) ??
            deriveDisplayTitle(undefined, folderRef?.kind === 'element' ? folderRef.title : el),
          kind: 'element',
          sourceSlug: doc.slug,
          hasOwnDocument: false,
          ref: el.trim(),
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--contains-->${elId}`,
        from: docNode.id,
        to: elId,
        type: 'contains',
        source: 'frontmatter',
        sourceSlug: doc.slug,
      });
    }

    // `contains[]` as written by `add_relation`; folder-prefixed refs keep their real kind.
    for (const contained of asStringArray(fm.contains)) {
      const folderRef = resolveFolderPrefixedRef(contained);
      const containedSlug = folderRef
        ? folderRef.id.split(':').at(-1)
        : slugifyName(contained);
      if (!containedSlug) continue;
      const containedId = existingNodeIdFor(contained) ?? folderRef?.id ?? `unknown:${containedSlug}`;
      if (!nodes.has(containedId)) {
        nodes.set(containedId, {
          id: containedId,
          title: folderRef?.title ?? contained,
          display: deriveDisplayTitle(undefined, folderRef?.title ?? contained),
          kind: folderRef?.kind ?? 'unknown',
          sourceSlug: doc.slug,
          hasOwnDocument: false,
          ref: contained.trim(),
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--contains-->${containedId}`,
        from: docNode.id,
        to: containedId,
        type: 'contains',
        source: 'frontmatter',
        sourceSlug: doc.slug,
      });
    }

    // `relates[]` → related_to; a `folder/slug` ref matches the existing doc node before an `unknown:` stub.
    for (const rel of asStringArray(fm.relates)) {
      const relId = existingNodeIdFor(rel) ?? resolveRelatesRef(rel);
      if (!relId) continue;
      if (!nodes.has(relId)) {
        nodes.set(relId, {
          id: relId,
          title: rel,
          display: deriveDisplayTitle(undefined, rel),
          kind: 'unknown',
          sourceSlug: doc.slug,
          hasOwnDocument: false,
          ref: rel.trim(),
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--related_to-->${relId}`,
        from: docNode.id,
        to: relId,
        type: 'related_to',
        source: 'frontmatter',
        sourceSlug: doc.slug,
      });
    }

    // `describes[]` → describes (document → the concept it explains), as the compiler reads it.
    for (const described of asStringArray(fm.describes)) {
      const folderRef = resolveFolderPrefixedRef(described);
      const describedId = existingNodeIdFor(described) ?? folderRef?.id ?? resolveRelatesRef(described);
      if (!describedId) continue;
      if (!nodes.has(describedId)) {
        nodes.set(describedId, {
          id: describedId,
          title: folderRef?.title ?? described,
          display: deriveDisplayTitle(undefined, folderRef?.title ?? described),
          kind: folderRef?.kind ?? 'unknown',
          sourceSlug: doc.slug,
          hasOwnDocument: false,
          ref: described.trim(),
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--describes-->${describedId}`,
        from: docNode.id,
        to: describedId,
        type: 'describes',
        source: 'frontmatter',
        sourceSlug: doc.slug,
      });
    }

    // `dependencies[]` and `depends_on[]` are aliases (`mcp/src/vault.mjs` NEIGHBOR_KEY_ALIASES); one
        // target counts once. Gate: tests/contract/derive-relation-keys.contract.test.ts.
    const seenDepIds = new Set<string>();
    for (const dep of [...asStringArray(fm.dependencies), ...asStringArray(fm.depends_on)]) {
      const folderRef = resolveFolderPrefixedRef(dep);
      const depSlug = folderRef
        ? folderRef.id.split(':').at(-1)
        : slugifyName(dep);
      if (!depSlug) continue;
      // Dependencies usually point between nodes of the same kind, so guess that.
      const depId = existingNodeIdFor(dep) ?? folderRef?.id ?? `${docNode.kind}:${depSlug}`;
      if (seenDepIds.has(depId)) continue;
      seenDepIds.add(depId);
      if (!nodes.has(depId)) {
        nodes.set(depId, {
          id: depId,
          title: folderRef?.title ?? dep,
          display: deriveDisplayTitle(undefined, folderRef?.title ?? dep),
          kind: folderRef?.kind ?? docNode.kind,
          sourceSlug: doc.slug,
          hasOwnDocument: false,
          ref: dep.trim(),
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--depends_on-->${depId}`,
        from: docNode.id,
        to: depId,
        type: 'depends_on',
        source: 'frontmatter',
        sourceSlug: doc.slug,
      });
    }

    // `broader[]` → is_a from this doc to the broader concept.
    for (const broaderRef of asStringArray(fm.broader)) {
      const folderRef = resolveFolderPrefixedRef(broaderRef);
      const broaderSlug = folderRef
        ? folderRef.id.split(':').at(-1)
        : slugifyName(broaderRef);
      if (!broaderSlug) continue;
      const broaderId =
        existingNodeIdFor(broaderRef) ?? folderRef?.id ?? `${docNode.kind}:${broaderSlug}`;
      if (!nodes.has(broaderId)) {
        nodes.set(broaderId, {
          id: broaderId,
          title: folderRef?.title ?? broaderRef,
          display: deriveDisplayTitle(undefined, folderRef?.title ?? broaderRef),
          kind: folderRef?.kind ?? docNode.kind,
          sourceSlug: doc.slug,
          hasOwnDocument: false,
          ref: broaderRef.trim(),
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--is_a-->${broaderId}`,
        from: docNode.id,
        to: broaderId,
        type: 'is_a',
        source: 'frontmatter',
        sourceSlug: doc.slug,
      });
    }
  }

  if (nodes.size === 0) {
    warnings.push(
      'vault 의 .md 어디에도 frontmatter `kind:` 가 없어 ontology 후보가 비어있습니다. 문서 상단 `---` 블록에 `kind: project` (또는 domain / capability / element / document) 추가 시 즉시 노드로 자랍니다.',
    );
  }

  // `relation_notes` keys match the declaring doc's canonical ref or its tail.
  {
    const noteByDoc = new Map<string, Record<string, string>>();
    for (const doc of manifest.docs) {
      const fm = doc.frontmatter as Record<string, unknown>;
      const notes = fm.relation_notes;
      if (notes && typeof notes === 'object' && !Array.isArray(notes)) {
        noteByDoc.set(doc.slug, notes as Record<string, string>);
      }
    }
    if (noteByDoc.size > 0) {
      for (const edge of edges) {
        const notes = noteByDoc.get(edge.sourceSlug);
        if (!notes) continue;
        const toTail = edge.to.split(':').pop() ?? '';
        for (const [ref, why] of Object.entries(notes)) {
          if (typeof why !== 'string' || !why.trim()) continue;
          const refTail = ref.split('/').pop();
          if (ref === toTail || refTail === toTail || slugifyName(ref) === toTail || (refTail && slugifyName(refTail) === toTail)) {
            (edge as { label?: string }).label = why.trim();
            break;
          }
        }
      }
    }
  }

  // Notes are promoted before containment dedup, which keeps the declaration carrying a reason.
  const dedupedById = new Map<string, OntologyStubEdge>();
  for (const edge of edges) {
    if (!VALID_RELATION_TYPES.has(edge.type)) continue;
    const existing = dedupedById.get(edge.id);
    if (!existing || (!existing.label && edge.label)) dedupedById.set(edge.id, edge);
  }

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(dedupedById.values()),
    sourceConceptCount,
    sourceKindCounts,
    warnings,
  };
}

// Keyed by manifest identity so the derivation survives remounts; any vault change is a new manifest.
const derivationCache = new WeakMap<VaultManifest, VaultOntologyDerivation>();

export function deriveOntologyFromVault(
  manifest: VaultManifest,
): VaultOntologyDerivation {
  const cached = derivationCache.get(manifest);
  if (cached) return cached;
  const derivation = deriveOntologyFromVaultUncached(manifest);
  derivationCache.set(manifest, derivation);
  return derivation;
}
