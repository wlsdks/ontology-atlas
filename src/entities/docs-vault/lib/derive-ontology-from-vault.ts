import { deriveDisplayTitle } from '@/shared/lib/derive-display-title';
import { readDisplayLocales } from '@/shared/lib/locale-display-name';
import { humanizeCodePathTitle } from '@/shared/lib/humanize-code-path-title';
import type { VaultDoc, VaultManifest } from '../model/types';

/**
 * Turns the frontmatter of a local vault into ontology stubs directly — no AI
 * extraction step. The vault's frontmatter is the source of truth, so there is
 * no promote/approve stage: what this returns surfaces as the graph.
 *
 * Frontmatter keys read here:
 * - `kind` — project / domain / capability / element / document
 * - `title` — falls back to the first heading, then the last slug segment
 * - `domain` (string) — the doc hangs under that domain
 * - `domains` (string[]) — the doc is the parent; typically a project listing
 *   the domains it contains. Note the direction is the reverse of `domain`
 * - `capabilities`, `elements` (string[]) — child nodes
 * - `relates` (string[]) — related_to
 * - `dependencies` / `depends_on` (string[]) — depends_on
 * - `contains` (string[]) — contains, the key CLI/MCP `add_relation` writes
 * - `describes` (string[]) — describes
 * - `broader` (string[]) — is_a (SKOS skos:broader)
 */

type OntologyStubSource = 'frontmatter';

/**
 * Index from a frontmatter reference string to an already-registered document
 * node id.
 *
 * Measured 2026-07-26: the compiler (`mcp/src/ontology-compiler.mjs`) registers
 * each document under three aliases (full doc slug, last segment, frontmatter
 * `slug:`) and matches references against them. The web derivation had no alias
 * table and slugified every reference instead, so **seven documents that
 * declared a code path via `slug:` failed to match their own references and
 * spawned ghost twins** — the map drew one concept as a node with a document
 * and a second node without one, and the copy a user was more likely to click
 * (the one born from the reference) had no document behind it.
 *
 * Two places answering "is this reference an existing document?" will always
 * diverge, so the web uses the compiler's alias rules verbatim. When one alias
 * claims two documents (the compiler's `ambiguous-alias`) it is dropped rather
 * than guessed.
 */
type DocAliasIndex = ReadonlyMap<string, string>;

interface OntologyStubNode {
  /** `<kind>:<slug>`, or `unknown:<slug>` as a fallback. */
  id: string;
  title: string;
  /**
   * Short title for display, from `deriveDisplayTitle` (frontmatter `display:`
   * wins, otherwise the parenthetical tail of `title` is cut). Search and
   * matching still run against the full `title` — this field is render-only and
   * must never narrow what can be found.
   */
  display: string;
  /**
   * Per-locale display names (owner instruction, 2026-07-24) — every
   * `display_<locale>` frontmatter key, collected verbatim. Choosing which one
   * to show belongs to the render boundary (`derivationToInsight`): derivation
   * itself is locale-blind, because it is cached at module load.
   */
  displayLocales?: Readonly<Record<string, string>>;
  kind: string;
  /** The vault document (slug) this came from — the start of the evidence chain. */
  sourceSlug: string;
  /**
   * Whether this node has **its own `.md` document**. `sourceSlug` cannot answer
   * that: a document node (pass 1) carries its own slug, while a node that was
   * only named by a relation (pass 2) carries the slug of *whichever other
   * document cited it*. A surface that renders "open this node's document" from
   * `sourceSlug` alone therefore opens someone else's document.
   *
   * `true` = a real document with `kind:` in its frontmatter. `false` = named
   * only from a relation key and not written yet.
   */
  hasOwnDocument: boolean;
  /**
   * Who wrote this node — `human` or `agent:<name>`, the value convention from
   * the 2026-07-31 ledger entry (`mcp/src/schema.mjs`).
   *
   * **Absence is unknown, not a defect.** No path defaults a missing value to
   * `human`: inferring "no record, therefore a person" would invent a provenance
   * that does not exist. Hence optional, and screens draw the reviewed marker
   * only when the value is exactly `human`.
   */
  createdBy?: string;
  /**
   * For a node with no document of its own, the reference string **as actually
   * written in the vault** — e.g. `src/entities/docs-vault/lib/derive-ontology-from-vault.ts`.
   *
   * The id slugifies that string (`element:srcentitiesdocs-...`) and cannot be
   * reversed, so a user copying the id into the CLI or MCP would be naming
   * something the vault has never heard of. Always hand an agent this string
   * instead — it is the same value the compiler carries as the edge's `ref`.
   * Empty for nodes that have their own document, where the doc slug plays this
   * role.
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
  /** Why this relation exists, from `relation_notes: {ref: why}`. Shown under the edge popover. */
  label?: string;
}

export interface VaultOntologyDerivation {
  nodes: OntologyStubNode[];
  edges: OntologyStubEdge[];
  /** Frontmatter `kind:` docs before relation-derived stubs are added. */
  sourceConceptCount: number;
  /** Frontmatter `kind:` docs by kind before relation-derived stubs are added. */
  sourceKindCounts: Record<string, number>;
  /** Diagnostics when no doc in the vault produced a candidate — rendered in the empty state. */
  warnings: string[];
}

const VALID_RELATION_TYPES = new Set([
  'contains',
  'depends_on',
  'describes',
  'related_to',
  'is_a',
]);

// Exported because bootstrap (writing domains out as files) must build file
// tails by the same rule, or derivation's `domain:slugifyName(name)` resolution
// will not meet the graph.
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
  // Relation keys are arrays in the public schema. Coercing a scalar into an
  // array for convenience would make the web map draw phantom edges the MCP
  // compiler rejects.
  return [];
}

// Vault folder name → kind. Converts a folder-prefixed slug such as
// `relates: [capabilities/mcp-server]` to the singular kind.
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

/**
 * Resolves a ref such as `capabilities/mcp-server` or `auth-platform` to an
 * existing node id: `folder/slug` → `<kind>:<slug>` when the folder is known,
 * anything else → `unknown:<slugified>`.
 */
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
  // A project's id uses the *user-facing slug* (frontmatter `slug:` wins), which
  // keeps it equal to `computeProjectSlug` and therefore to the `projectIds` the
  // containment BFS attaches. Every other kind keeps the file slug, so external
  // refs in `relates`/`depends_on` still resolve.
  let idSlug: string;
  const fmSlug = typeof fm.slug === 'string' ? fm.slug.trim() : '';
  if (rawKind === 'project' && fmSlug) {
    idSlug = fmSlug;
  } else {
    idSlug = doc.slug.split('/').pop() || doc.slug;
  }
  const id = `${rawKind}:${idSlug}`;
  const baseDisplay = deriveDisplayTitle(fm, title);
  // Element titles are often a raw code path (`src/foo/bar-baz.ts`), unreadable
  // for a non-developer. Only when neither an explicit `display:` nor a
  // parenthetical cut applied — i.e. the display is still the title verbatim —
  // is the path rewritten into a human name.
  const display =
    rawKind === 'element' && baseDisplay === title
      ? humanizeCodePathTitle(title) ?? baseDisplay
      : baseDisplay;
  // Per-locale display names come from one place, `shared/lib/locale-display-name`.
  // The doc list and quick search must call the same function, or the map says
  // "My project" while search says "My project".
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

  // Pass 1 registers every document node first, so pass 2 can resolve a
  // reference like `relates: [capabilities/mcp-server]` to the real
  // `capability:mcp-server` instead of minting a duplicate.
  let sourceConceptCount = 0;
  const sourceKindCounts: Record<string, number> = {};
  // The compiler's three aliases. An alias claimed by two documents is marked
  // null and left unresolved — a guessed link is a wrong link.
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
      // Non-project ids are `kind:` + slug tail, so two same-kind docs whose
      // filenames match (capabilities/auth.md and archive/auth.md) collided
      // and `nodes.set` silently overwrote the first — the map drew one node
      // fewer than every count surface reported and one document became
      // unreachable (bug sweep 2026-09-01). The later doc keeps its full-path
      // id (slugs are unique) and the collision is surfaced as a warning; the
      // shared tail alias resolves to neither, which the alias rule below
      // already treats as "a guessed link is a wrong link".
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
  /** Does this reference point at an existing document? If so, its node id. */
  const existingNodeIdFor = (ref: string): string | null =>
    docAliases.get(ref.trim()) ?? null;

  for (const doc of manifest.docs) {
    const docNode = deriveDocNode(doc);
    if (!docNode) continue;

    const fm = doc.frontmatter;

    // `domain: X` means "this document belongs to domain X". A `contains` edge
    // runs parent → child, so the edge must point domain → docNode for
    // capabilities and elements to hang under the domain in the tree.
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

    // `domains: [...]` is the reverse direction of singular `domain:` — here the
    // document (usually a project) is the parent listing what it contains, so
    // the `contains` edge runs docNode → domain.
    for (const dom of asStringArray(fm.domains)) {
      // A folder-prefixed ref (`domains/tasks`, the format the init starter
      // writes) went unresolved in this branch only, and slugify flattened the
      // slash into a phantom `domain:domainstasks` that never merged with the
      // real `domain:tasks` — skewing counts for every new vault. Apply the same
      // resolveFolderPrefixedRef precedence the singular branch uses.
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

    // capabilities[]
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

    // elements[]
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

    // `contains[]` is the direct parent→child relation written by CLI/MCP
    // `add_relation({type:'contains'})`. A folder-prefixed ref such as
    // `capabilities/foo` must resolve to its real kind or the web mints a
    // duplicate `unknown:` node.
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

    // `relates[]` → related_to. A `folder/slug` form (`capabilities/mcp-server`)
    // is matched against the existing doc node first, falling back to an
    // `unknown:` stub. Plain slugify would drop the `/` and produce mangled ids
    // like `capabilitiesmcp-server`.
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

    // `describes[]` → describes (document → the concept it explains).
    //
    // Measured 2026-07-27: the CLI/MCP compiler had always read this key and put
    // edges like `documents/agent-practice-research → capabilities/mcp-server`
    // into the graph, while the web derivation skipped it entirely. The three
    // entry points therefore disagreed on relation count (web 448 vs 542; 10 of
    // the difference was this key) and `document` nodes sat unconnected to what
    // they describe. The relation type itself already existed in the web's union,
    // labels, and health checks — the only thing missing was the read.
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

    // `dependencies[]` + `depends_on[]` → depends_on. The schema (`mcp/src/schema.mjs`)
    // makes `depends_on` canonical for capability/element and `dependencies`
    // canonical for project, and MCP reads both as aliases (vault.mjs
    // NEIGHBOR_KEY_ALIASES). The web derivation read only `dependencies`, so a
    // dependency an agent wrote under the canonical key vanished from the map and
    // the captions (2026-08-12) — the same shape of hole as `describes` above.
    // The same target under both keys counts once, by resolved depId.
    // Gate: tests/contract/derive-relation-keys.contract.test.ts.
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

    // `broader[]` → is_a (SKOS skos:broader). The node IS-A the broader concept,
    // so from = docNode, to = the broader one. A folder-prefixed ref
    // (`capabilities/foo`) resolves to its real kind.
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

  // Promote `relation_notes: {ref: why}` onto the matching edge's label. The key is
  // matched against both the declaring document's canonical ref and its tail.
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

  // Both endpoints may declare the same containment. Promote notes before deduping,
  // then keep the declaration carrying the recorded reason and its source document.
  // Otherwise a child's domain field can hide its parent's explicit rationale.
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

// Module-level memoization keyed by `manifest` object identity (perf sweep,
// 2026-07). `useVaultOntology`/`useOntologyInsight` used to wrap this call in
// a component-scoped `useMemo` only — every route that mounts a fresh
// component tree (`/`, `/topology`, `/projects`, `/ontology/insights`, …)
// lost that cache on unmount and re-ran the full doc scan/BFS from scratch
// even when navigating back to the SAME loaded vault (`vault.manifest`
// reference unchanged). A `WeakMap` keyed by the manifest reference survives
// across mounts while staying leak-free (entry drops once the manifest
// itself is GC'd) and preserves the freshness contract for free — a new
// vault load / file edit produces a NEW manifest object, so the cache misses
// and recomputes exactly when the data actually changed. Static dogfood mode
// keeps its own already-eager `STATIC_DERIVATION` (see
// `use-ontology-insight.ts`) which naturally hits this same cache too.
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
