import { deriveDisplayTitle } from '@/shared/lib/concept-display/derive-display-title';
import { readDisplayLocales } from '@/shared/lib/locale-text/locale-display-name';
import { humanizeCodePathTitle } from '@/shared/lib/concept-display/humanize-code-path-title';
import type { VaultDoc, VaultManifest } from '../model/types';

/**
 * Derives ontology stubs straight from vault frontmatter, which is the source of truth. Relation
 * keys: `domain`, `domains` (reverse direction), `capabilities`, `elements`, `relates`,
 * `dependencies`/`depends_on`, `contains`, `describes`, `broader` (is_a).
 */

type OntologyStubSource = 'frontmatter';

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
  /** Nonblank description or complete opening prose within the preview budget. */
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
  // One source for locale display names (`shared/lib/locale-text/locale-display-name`), shared with list and search.
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
    summary: doc.description?.trim() || doc.definitionPreview || undefined,
  };
}

type RelationKey =
  | 'domain'
  | 'domains'
  | 'capabilities'
  | 'elements'
  | 'contains'
  | 'relates'
  | 'describes'
  | 'dependencies'
  | 'broader';

/** One relation as written, before alias resolution: `fallback` is the id when no document claims `ref`. */
interface RelationIntent {
  key: RelationKey;
  ref: string;
  /** `null`: an unresolved ref draws nothing. */
  fallback: string | null;
}

/**
 * Everything one document contributes that does not depend on the rest of the vault. Cached by
 * document identity: an unchanged file keeps its `VaultDoc` across rebuilds, so a change re-derives
 * only the documents it touched.
 */
interface DocFacts {
  /** `deriveDocNode`, before a duplicate id is disambiguated; edges always use this id. */
  node: OntologyStubNode | null;
  /** The slug's last segment, one of the document's three aliases. */
  tail: string;
  intents: RelationIntent[];
  notes: Record<string, unknown> | null;
  /** The last assembly's resolved ids and edges, reused while the ids stay the same. */
  resolved: string[] | null;
  edges: OntologyStubEdge[] | null;
}

const EDGE_TYPE: Record<RelationKey, OntologyStubEdge['type']> = {
  domain: 'contains',
  domains: 'contains',
  capabilities: 'contains',
  elements: 'contains',
  contains: 'contains',
  relates: 'related_to',
  describes: 'describes',
  dependencies: 'depends_on',
  broader: 'is_a',
};

/** Slug under a folder ref of `kind`, else the slugified ref. */
function kindSlug(ref: string, kind: string): string {
  const folderRef = resolveFolderPrefixedRef(ref);
  return folderRef?.kind === kind ? folderRef.id.slice(kind.length + 1) : slugifyName(ref);
}

/** Last id segment of a folder ref, else the slugified ref. */
function anySlug(ref: string): string | undefined {
  const folderRef = resolveFolderPrefixedRef(ref);
  return folderRef ? folderRef.id.split(':').at(-1) : slugifyName(ref);
}

function relationIntents(fm: Record<string, unknown>, nodeKind: string): RelationIntent[] {
  const intents: RelationIntent[] = [];
  // `domain: X` puts this doc under X, so the contains edge runs domain → doc.
  if (typeof fm.domain === 'string' && fm.domain.trim() !== '') {
    const domainSlug = kindSlug(fm.domain, 'domain');
    if (domainSlug) intents.push({ key: 'domain', ref: fm.domain, fallback: `domain:${domainSlug}` });
  }
  // `domains:` is the reverse: this doc contains the listed domains. Folder-prefixed refs
  // (`domains/tasks`) resolve like the singular branch, or slugify mints a phantom.
  for (const dom of asStringArray(fm.domains)) {
    const folderRef = resolveFolderPrefixedRef(dom);
    const fallback = folderRef?.kind === 'domain' ? folderRef.id : `domain:${slugifyName(dom)}`;
    intents.push({ key: 'domains', ref: dom, fallback });
  }
  for (const cap of asStringArray(fm.capabilities)) {
    const capSlug = kindSlug(cap, 'capability');
    if (capSlug) intents.push({ key: 'capabilities', ref: cap, fallback: `capability:${capSlug}` });
  }
  for (const el of asStringArray(fm.elements)) {
    const elSlug = kindSlug(el, 'element');
    if (elSlug) intents.push({ key: 'elements', ref: el, fallback: `element:${elSlug}` });
  }
  // `contains[]` as written by `add_relation`; folder-prefixed refs keep their real kind.
  for (const contained of asStringArray(fm.contains)) {
    const containedSlug = anySlug(contained);
    if (!containedSlug) continue;
    const fallback = resolveFolderPrefixedRef(contained)?.id ?? `unknown:${containedSlug}`;
    intents.push({ key: 'contains', ref: contained, fallback });
  }
  // `relates[]` → related_to; a `folder/slug` ref matches the existing doc node before an `unknown:` stub.
  for (const rel of asStringArray(fm.relates)) {
    intents.push({ key: 'relates', ref: rel, fallback: resolveRelatesRef(rel) });
  }
  // `describes[]` → describes (document → the concept it explains), as the compiler reads it.
  for (const described of asStringArray(fm.describes)) {
    const fallback = resolveFolderPrefixedRef(described)?.id ?? resolveRelatesRef(described);
    intents.push({ key: 'describes', ref: described, fallback });
  }
  // `dependencies[]` and `depends_on[]` are aliases (`mcp/src/vault/` NEIGHBOR_KEY_ALIASES); one
  // target counts once. Gate: tests/contract/analysis/derive-relation-keys.contract.test.ts.
  for (const dep of [...asStringArray(fm.dependencies), ...asStringArray(fm.depends_on)]) {
    const depSlug = anySlug(dep);
    if (!depSlug) continue;
    // Dependencies usually point between nodes of the same kind, so guess that.
    const fallback = resolveFolderPrefixedRef(dep)?.id ?? `${nodeKind}:${depSlug}`;
    intents.push({ key: 'dependencies', ref: dep, fallback });
  }
  // `broader[]` → is_a from this doc to the broader concept.
  for (const broaderRef of asStringArray(fm.broader)) {
    const broaderSlug = anySlug(broaderRef);
    if (!broaderSlug) continue;
    const fallback = resolveFolderPrefixedRef(broaderRef)?.id ?? `${nodeKind}:${broaderSlug}`;
    intents.push({ key: 'broader', ref: broaderRef, fallback });
  }
  return intents;
}

const docFactsCache = new WeakMap<VaultDoc, DocFacts>();

function docFacts(doc: VaultDoc): DocFacts {
  const cached = docFactsCache.get(doc);
  if (cached) return cached;
  const node = deriveDocNode(doc);
  const fm = doc.frontmatter as Record<string, unknown>;
  const notes = fm.relation_notes;
  const facts: DocFacts = {
    node,
    tail: doc.slug.split('/').pop() ?? doc.slug,
    intents: node ? relationIntents(fm, node.kind) : [],
    notes: notes && typeof notes === 'object' && !Array.isArray(notes) ? (notes as Record<string, unknown>) : null,
    resolved: null,
    edges: null,
  };
  docFactsCache.set(doc, facts);
  return facts;
}

/** A relation-named node without its own document, titled by the first document that names it. */
function stubNode(intent: RelationIntent, id: string, sourceSlug: string, nodeKind: string): OntologyStubNode {
  const { key, ref } = intent;
  const folderRef = resolveFolderPrefixedRef(ref);
  let kind: string;
  let title: string;
  let display: string | undefined;
  switch (key) {
    case 'domain':
      kind = 'domain';
      title = folderRef?.kind === 'domain' ? folderRef.title : ref.trim();
      break;
    case 'domains':
    case 'capabilities':
    case 'elements': {
      kind = key === 'domains' ? 'domain' : key === 'capabilities' ? 'capability' : 'element';
      title = folderRef?.kind === kind ? folderRef.title : ref;
      if (key === 'elements') display = humanizeCodePathTitle(ref) ?? deriveDisplayTitle(undefined, title);
      break;
    }
    case 'relates':
      kind = 'unknown';
      title = ref;
      break;
    case 'contains':
    case 'describes':
      kind = folderRef?.kind ?? 'unknown';
      title = folderRef?.title ?? ref;
      break;
    default:
      kind = folderRef?.kind ?? nodeKind;
      title = folderRef?.title ?? ref;
  }
  return {
    id,
    title,
    display: display ?? deriveDisplayTitle(undefined, title),
    kind,
    sourceSlug,
    hasOwnDocument: false,
    ref: ref.trim(),
    source: 'frontmatter',
  };
}

/** `relation_notes` keys match the declaring doc's canonical ref or its tail. */
function relationLabel(notes: Record<string, unknown> | null, to: string): string | undefined {
  if (!notes) return undefined;
  const toTail = to.split(':').pop() ?? '';
  for (const [ref, why] of Object.entries(notes)) {
    if (typeof why !== 'string' || !why.trim()) continue;
    const refTail = ref.split('/').pop();
    if (ref === toTail || refTail === toTail || slugifyName(ref) === toTail || (refTail && slugifyName(refTail) === toTail)) {
      return why.trim();
    }
  }
  return undefined;
}

/** Resolved target per intent, `''` where nothing is drawn; a repeated dependency target counts once. */
function resolveIntents(intents: readonly RelationIntent[], aliasOf: (ref: string) => string | null): string[] {
  const resolved: string[] = new Array(intents.length);
  let seenDeps: Set<string> | null = null;
  for (let at = 0; at < intents.length; at += 1) {
    const intent = intents[at];
    const id = aliasOf(intent.ref) ?? intent.fallback;
    if (!id || (intent.key === 'domains' && id === 'domain:')) {
      resolved[at] = '';
      continue;
    }
    if (intent.key === 'dependencies') {
      seenDeps ??= new Set();
      if (seenDeps.has(id)) {
        resolved[at] = '';
        continue;
      }
      seenDeps.add(id);
    }
    resolved[at] = id;
  }
  return resolved;
}

function sameStrings(a: readonly string[] | null, b: readonly string[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let at = 0; at < a.length; at += 1) if (a[at] !== b[at]) return false;
  return true;
}

/** This doc's edges for `resolved`, reusing the previous objects when nothing it points at moved. */
function docEdges(doc: VaultDoc, facts: DocFacts, resolved: string[]): OntologyStubEdge[] {
  if (facts.edges && sameStrings(facts.resolved, resolved)) return facts.edges;
  const nodeId = facts.node!.id;
  const edges: OntologyStubEdge[] = [];
  facts.intents.forEach((intent, at) => {
    const target = resolved[at];
    if (!target) return;
    const type = EDGE_TYPE[intent.key];
    const [from, to] = intent.key === 'domain' ? [target, nodeId] : [nodeId, target];
    const label = relationLabel(facts.notes, to);
    edges.push({
      id: `${from}--${type}-->${to}`,
      from,
      to,
      type,
      source: 'frontmatter',
      sourceSlug: doc.slug,
      ...(label ? { label } : {}),
    });
  });
  facts.resolved = resolved;
  facts.edges = edges;
  return edges;
}

/** Full assembly from per-document facts: O(documents + relations) map operations. */
function assembleOntology(docs: readonly VaultDoc[]): DerivationRun {
  const nodes = new Map<string, OntologyStubNode>();
  const nodeAt = new Int32Array(docs.length).fill(-1);
  const warnings: string[] = [];

  // Pass 1 registers every document node so pass 2 resolves refs instead of minting duplicates.
  let sourceConceptCount = 0;
  const sourceKindCounts: Record<string, number> = {};
  // The compiler's three aliases (`mcp/src/ontology-compiler.mjs`): full slug, last segment and
  // frontmatter `slug:`. One claimed by two documents becomes null, never guessed.
  const aliasClaims = new Map<string, string | null>();
  const claimAlias = (alias: string | undefined, nodeId: string) => {
    const key = alias?.trim();
    if (!key) return;
    const claimed = aliasClaims.get(key);
    if (claimed === undefined) aliasClaims.set(key, nodeId);
    else if (claimed !== nodeId) aliasClaims.set(key, null);
  };
  docs.forEach((doc, at) => {
    const facts = docFacts(doc);
    const derived = facts.node;
    if (!derived) return;
    let docNode = derived;
    // Two same-kind docs with the same tail would collide: the later keeps its full-path id, a
    // warning is raised, and the shared tail alias resolves to neither.
    if (nodes.has(docNode.id)) {
      warnings.push(
        `two documents derive the node id "${docNode.id}"; ${doc.slug} keeps its full-path id`,
      );
      docNode = { ...docNode, id: `${docNode.kind}:${doc.slug}` };
    }
    nodeAt[at] = nodes.size;
    nodes.set(docNode.id, docNode);
    sourceConceptCount += 1;
    sourceKindCounts[docNode.kind] = (sourceKindCounts[docNode.kind] ?? 0) + 1;
    claimAlias(doc.slug, docNode.id);
    claimAlias(facts.tail, docNode.id);
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string') claimAlias(fmSlug, docNode.id);
  });
  const aliasOf = (ref: string): string | null => aliasClaims.get(ref.trim()) ?? null;

  // Notes are applied per edge before containment dedup, which keeps the declaration carrying a reason.
  const dedupedById = new Map<string, OntologyStubEdge>();
  for (const doc of docs) {
    const facts = docFacts(doc);
    if (!facts.node) continue;
    const resolved = resolveIntents(facts.intents, aliasOf);
    facts.intents.forEach((intent, at) => {
      const id = resolved[at];
      if (id && !nodes.has(id)) nodes.set(id, stubNode(intent, id, doc.slug, facts.node!.kind));
    });
    for (const edge of docEdges(doc, facts, resolved)) {
      const existing = dedupedById.get(edge.id);
      if (!existing || (!existing.label && edge.label)) dedupedById.set(edge.id, edge);
    }
  }

  if (nodes.size === 0) {
    warnings.push(
      'vault 의 .md 어디에도 frontmatter `kind:` 가 없어 ontology 후보가 비어있습니다. 문서 상단 `---` 블록에 `kind: project` (또는 domain / capability / element / document) 추가 시 즉시 노드로 자랍니다.',
    );
  }

  return {
    docs,
    nodeAt,
    derivation: {
      nodes: Array.from(nodes.values()),
      edges: Array.from(dedupedById.values()),
      sourceConceptCount,
      sourceKindCounts,
      warnings,
    },
  };
}

function sameIntents(a: readonly RelationIntent[], b: readonly RelationIntent[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, at) => x.key === b[at].key && x.ref === b[at].ref && x.fallback === b[at].fallback);
}

function sameNotes(a: Record<string, unknown> | null, b: Record<string, unknown> | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const left = Object.entries(a);
  const right = Object.entries(b);
  return left.length === right.length && left.every(([key, value], at) => key === right[at][0] && value === right[at][1]);
}

/**
 * True when swapping `before` for `after` changes only the node's own fields: same id, kind,
 * aliases, relations and notes, so every other node, every edge and every warning stays.
 */
function sameShape(before: VaultDoc, after: VaultDoc): boolean {
  if (before.slug !== after.slug || before.frontmatter.slug !== after.frontmatter.slug) return false;
  const old = docFacts(before);
  const now = docFacts(after);
  if (!old.node || !now.node) return !old.node && !now.node;
  return old.node.id === now.node.id && old.node.kind === now.node.kind &&
    sameIntents(old.intents, now.intents) && sameNotes(old.notes, now.notes);
}

/** Past this many replaced documents a full assembly is as cheap as patching. */
const PATCH_MAX_CHANGED_DOCS = 64;

interface DerivationRun {
  docs: readonly VaultDoc[];
  derivation: VaultOntologyDerivation;
  /** Index in `derivation.nodes` of each document's node, -1 without one. */
  nodeAt: Int32Array;
}

let lastRun: DerivationRun | null = null;

/**
 * O(changed) when the new document list differs from the last one only by documents of the same
 * shape (an edited body, title or summary): copy the node list, swap those nodes, keep the rest.
 */
function patchedFromLastRun(docs: readonly VaultDoc[]): DerivationRun | null {
  const run = lastRun;
  if (!run || run.docs.length !== docs.length) return null;
  const changed: number[] = [];
  for (let at = 0; at < docs.length; at += 1) {
    if (docs[at] === run.docs[at]) continue;
    if (changed.length === PATCH_MAX_CHANGED_DOCS || !sameShape(run.docs[at], docs[at])) return null;
    changed.push(at);
  }
  if (changed.length === 0) return { ...run, docs };
  const nodes = run.derivation.nodes.slice();
  for (const at of changed) {
    const before = docFacts(run.docs[at]);
    const after = docFacts(docs[at]);
    if (!after.node) continue;
    const index = run.nodeAt[at];
    const previous = nodes[index];
    nodes[index] = previous.id === after.node.id ? after.node : { ...after.node, id: previous.id };
    after.resolved = before.resolved;
    after.edges = before.edges;
  }
  return { docs, nodeAt: run.nodeAt, derivation: { ...run.derivation, nodes } };
}

function deriveOntologyFromVaultUncached(manifest: VaultManifest): VaultOntologyDerivation {
  lastRun = patchedFromLastRun(manifest.docs) ?? assembleOntology(manifest.docs);
  return lastRun.derivation;
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

const arrivedCache = new WeakMap<VaultManifest, VaultOntologyDerivation>();

export function deriveArrivedOntology(manifest: VaultManifest): VaultOntologyDerivation {
  const cached = arrivedCache.get(manifest);
  if (cached) return cached;
  const full = deriveOntologyFromVault(manifest);
  const nodes = full.nodes.filter((node) => node.hasOwnDocument);
  const ids = new Set(nodes.map((node) => node.id));
  const derivation = {
    ...full,
    nodes,
    edges: full.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
  };
  arrivedCache.set(manifest, derivation);
  return derivation;
}
