/**
 * Studio CREATE (만들기) mode — pure, deterministic model for assembling a
 * brand-new ontology node and its typed relations, then serializing that draft
 * two ways: (1) a vault `.md` document for the DIRECT-APPLY path (written to the
 * user's disk via `createDoc`), and (2) a copyable MCP command packet for the
 * DELEGATE path (`에이전트에게 맡기기`).
 *
 * Slice 2 of the Ontology Studio track. Enhance (Slice 1) reads ONE existing
 * node; Create ASSEMBLES a new one by clicking relation cards. The two apply
 * routes keep the single source of truth intact — the vault (or the agent that
 * runs the packet) is always the writer; this module only produces strings.
 *
 * Frontmatter relation keys are the ones the RUNTIME derivation
 * (`deriveOntologyFromVault`) actually reads so a direct-applied node shows up
 * on the map immediately:
 *   - contains   → `contains`
 *   - dependsOn  → `dependencies`  (matches the dogfood vault convention +
 *                  runtime derive — schema.mjs's `depends_on` alias is a known
 *                  drift; the validator accepts both)
 *   - relates    → `relates`
 *   - isA        → `broader`       (S3 additive — the runtime does not derive an
 *                  is_a edge yet; the key is written so S3 can wire validation)
 * The definition is written as `definition:` (S3 additive — full validation lands
 * in S3; today it is an inert, portable frontmatter fact).
 */

import { slugify } from "@/shared/lib/slugify";
import { canonicalizeDomainRef } from "@/shared/lib/canonicalize-domain-ref";
import { vaultFolderForKind } from "@/entities/docs-vault";

/** The four node kinds a user can assemble in Create mode (project → element). */
export const CREATE_NODE_KINDS = ["project", "domain", "capability", "element"] as const;
export type CreateNodeKind = (typeof CREATE_NODE_KINDS)[number];

/**
 * Relation cards, in display order: is_a (the new axis) first, then the three
 * relations the enhance surface already renders as gems.
 */
export const CREATE_RELATION_TYPES = ["isA", "dependsOn", "contains", "relates"] as const;
export type CreateRelationType = (typeof CREATE_RELATION_TYPES)[number];

/** Relation type → the frontmatter array key the runtime derivation reads. */
export const RELATION_FRONTMATTER_KEY: Record<CreateRelationType, string> = {
  contains: "contains",
  dependsOn: "dependencies",
  relates: "relates",
  isA: "broader",
};

/**
 * Non-is_a relation type → the MCP `add_relation` edge type (agent packet).
 * `isA` is deliberately absent: the MCP write surface has no `is_a` edge type,
 * so is-a is applied via the `broader` frontmatter key (add_concept extra for a
 * new node, patch_concept for an existing one) — see `buildMcpPacket` /
 * `buildFillPacket`.
 */
export const RELATION_EDGE_TYPE: Record<Exclude<CreateRelationType, "isA">, string> = {
  contains: "contains",
  dependsOn: "depends_on",
  relates: "related_to",
};

/** A pickable existing node — the frontmatter-writable `ref` is precomputed. */
export interface CreateCandidate {
  /** Graph node id, e.g. `capability:mcp-server`. */
  id: string;
  /** 화면에 보이는 이름 — 현재 로케일의 표시 이름(`display ?? title`). */
  title: string;
  /**
   * frontmatter 의 canonical `title` — 검색/매칭의 단일 진실원(AGENTS.md).
   * 표시 이름은 화면용 레이어라 매칭 범위를 줄여서는 안 된다(#66). 구 후보와의
   * 하위 호환을 위해 optional.
   */
  canonicalTitle?: string;
  kind: string;
  /** Folder-prefixed ref the derivation resolves, e.g. `capabilities/mcp-server`. */
  ref: string;
}

export interface PendingRelation {
  type: CreateRelationType;
  candidate: CreateCandidate;
}

export interface CreateDraft {
  kind: CreateNodeKind;
  title: string;
  /** Parent domain tail-slug (e.g. `views`) — null for project/domain kinds. */
  domainValue: string | null;
  definition: string;
  relations: PendingRelation[];
  /**
   * C12③ — per-locale display names (locale → name), written as `display_<locale>`
   * frontmatter (map/INDEX/popover render the screen-locale name; `title` stays
   * the search/matching truth). Empty/absent → no `display_*` keys, same as today
   * (other-locale viewers just see `title`). Keys are serialized in sorted order
   * so the doc + MCP packet are deterministic.
   */
  localeLabels?: Record<string, string>;
}

/** Sorted, trimmed, non-empty `display_<locale>` entries from a draft. */
function localeLabelEntries(draft: CreateDraft): Array<[string, string]> {
  const raw = draft.localeLabels ?? {};
  return Object.entries(raw)
    .map(([locale, name]) => [locale.trim(), name.trim()] as [string, string])
    .filter(([locale, name]) => /^[a-z]{2}$/.test(locale) && name !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Turn an insight graph node (`id = kind:tail`) into a pickable candidate with a
 * folder-prefixed `ref` the vault derivation can resolve. Falls back to
 * slugifying the id tail when the id is not `kind:tail` shaped.
 */
export function candidateFromNode(node: {
  id: string;
  kind: string;
  title: string;
  display?: string;
}): CreateCandidate {
  const prefix = `${node.kind}:`;
  const tail = node.id.startsWith(prefix) ? node.id.slice(prefix.length) : slugify(node.id);
  const ref = `${vaultFolderForKind(node.kind)}/${tail || slugify(node.title)}`;
  return {
    id: node.id,
    title: node.display ?? node.title,
    // 표시 이름과 별개로 원문을 함께 싣는다 — 예전엔 여기서 버려져 `display_ko`
    // 가 달린 노드를 원문 title 로 검색할 수 없었다(#66).
    canonicalTitle: node.title,
    kind: node.kind,
    ref,
  };
}

/** Whether `kind` expects a parent domain (capability / element). */
export function kindExpectsDomain(kind: CreateNodeKind): boolean {
  return kind === "capability" || kind === "element";
}

/** The vault slug the new node will occupy, or null when the title is unusable. */
export function buildCreateNodeSlug(draft: Pick<CreateDraft, "kind" | "title">): string | null {
  const tail = slugify(draft.title);
  if (!tail) return null;
  return `${vaultFolderForKind(draft.kind)}/${tail}`;
}

/**
 * Resolve the node that already owns CREATE's deterministic target path.
 * Near-duplicate titles remain a soft nudge; an exact path match is a hard
 * conflict because `createDoc` cannot succeed until the draft name changes.
 */
export function findCreateSlugCollision(
  draft: Pick<CreateDraft, "kind" | "title">,
  candidates: readonly CreateCandidate[],
): CreateCandidate | null {
  const slug = buildCreateNodeSlug(draft);
  if (!slug) return null;
  return candidates.find((candidate) => candidate.ref === slug) ?? null;
}

function quoteYamlScalar(v: string): string {
  return /[:#[\]{}"',&|*!%@`]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

/** Dedupe pending relations by (type, candidate.id) preserving first-seen order. */
function dedupeRelations(relations: readonly PendingRelation[]): PendingRelation[] {
  const seen = new Set<string>();
  const out: PendingRelation[] = [];
  for (const rel of relations) {
    const key = `${rel.type}:${rel.candidate.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rel);
  }
  return out;
}

/** Group deduped relation refs by their frontmatter key, in card order. */
export function groupRelationRefs(relations: readonly PendingRelation[]): Array<{
  key: string;
  refs: string[];
}> {
  const deduped = dedupeRelations(relations);
  const out: Array<{ key: string; refs: string[] }> = [];
  for (const type of CREATE_RELATION_TYPES) {
    const refs = deduped.filter((r) => r.type === type).map((r) => r.candidate.ref);
    if (refs.length > 0) out.push({ key: RELATION_FRONTMATTER_KEY[type], refs });
  }
  return out;
}

/**
 * Serialize the draft into a vault `.md` document (slug + markdown). Reuses the
 * shared `buildNewNodeDoc` base serialization (identical to /docs + the builder)
 * and injects the definition + relation-array keys before the closing `---`, so
 * the base frontmatter (slug/kind/domain/title) stays byte-identical.
 */
export function buildCreateNodeDoc(draft: CreateDraft): { slug: string; markdown: string } {
  const title = draft.title.trim();
  if (!title) throw new Error("title must not be empty");
  const slug = buildCreateNodeSlug({ kind: draft.kind, title });
  if (!slug) throw new Error("title produced an empty slug");

  const extra: string[] = [];
  // C12③ — per-locale display names right under `title:`.
  for (const [locale, name] of localeLabelEntries(draft)) {
    extra.push(`display_${locale}: ${quoteYamlScalar(name)}`);
  }
  const definition = draft.definition.trim();
  if (definition) extra.push(`definition: ${quoteYamlScalar(definition)}`);
  for (const { key, refs } of groupRelationRefs(draft.relations)) {
    extra.push(`${key}: [${refs.join(", ")}]`);
  }

  const lines: string[] = ["---", `slug: ${slug}`, `kind: ${draft.kind}`];
  // C7 — canonical bare tail-slug `domain:` (shared with the map writer).
  const domain = canonicalizeDomainRef(draft.domainValue);
  if (domain && kindExpectsDomain(draft.kind)) lines.push(`domain: ${quoteYamlScalar(domain)}`);
  lines.push(`title: ${quoteYamlScalar(title)}`);
  lines.push(...extra);
  lines.push("---", "", `# ${title}`, "");
  if (definition) lines.push(definition, "");

  return { slug, markdown: lines.join("\n") };
}

/**
 * C2 — the ORIGIN relation for a CREATE-from-socket flow: the focal node A the
 * user came from (A --relation--> the new node). Recorded IN THE SAME operation
 * as the node create so "새로 만들기" from A's socket never drops the A→new link.
 * `broaderRefsAfter` is A's full post-add `broader` array (is_a only, since MCP
 * has no is_a edge — the caller supplies it from A's existing is_a neighbors).
 */
export interface CreateOrigin {
  /** A's write-target doc slug (frontmatter lives here). */
  focalSlug: string;
  relation: CreateRelationType;
  broaderRefsAfter?: readonly string[];
}

/**
 * Build the copyable MCP command packet for the DELEGATE path. This is the ONLY
 * active write route in read-only / sample mode — the agent runs these calls
 * against the vault it is registered on. With an `origin` (C2), the packet also
 * records A --relation--> new node so the whole intent lands in ONE paste.
 */
export function buildMcpPacket(draft: CreateDraft, origin?: CreateOrigin): string {
  const title = draft.title.trim();
  const slug = buildCreateNodeSlug({ kind: draft.kind, title }) ?? `${draft.kind}s/new-node`;
  const q = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

  const conceptArgs = [`slug: ${q(slug)}`, `kind: ${q(draft.kind)}`, `title: ${q(title)}`];
  // C12③ — per-locale display names as `labels: { ko, en }` (add_concept's
  // documented locale-label input; mirrors the doc's `display_<locale>` keys).
  const localeEntries = localeLabelEntries(draft);
  if (localeEntries.length > 0) {
    const pairs = localeEntries.map(([locale, name]) => `${locale}: ${q(name)}`);
    conceptArgs.push(`labels: { ${pairs.join(", ")} }`);
  }
  // C7 — canonical bare tail-slug `domain:` in the MCP packet too.
  const domain = canonicalizeDomainRef(draft.domainValue);
  if (domain && kindExpectsDomain(draft.kind)) conceptArgs.push(`domain: ${q(domain)}`);
  const definition = draft.definition.trim();
  if (definition) conceptArgs.push(`definition: ${q(definition)}`);

  const deduped = dedupeRelations(draft.relations);
  // is-a lands as a `broader:` frontmatter array on the new node itself (MCP has
  // no is_a edge type). Non-is_a relations are add_relation edges.
  const broaderRefs = deduped.filter((r) => r.type === "isA").map((r) => r.candidate.ref);
  if (broaderRefs.length > 0) {
    conceptArgs.push(`broader: [${broaderRefs.map((r) => q(r)).join(", ")}]`);
  }

  const lines: string[] = [`add_concept(${conceptArgs.join(", ")})`];
  for (const rel of deduped) {
    if (rel.type === "isA") continue;
    lines.push(
      `add_relation(from: ${q(slug)}, to: ${q(rel.candidate.ref)}, type: ${q(RELATION_EDGE_TYPE[rel.type])})`,
    );
  }
  // C2 — the origin relation A --relation--> new node, in the same packet.
  if (origin) {
    if (origin.relation === "isA") {
      // A is_a new → append new to A's broader (MCP has no is_a edge type).
      const refs = origin.broaderRefsAfter ?? [slug];
      lines.push(
        `patch_concept(slug: ${q(origin.focalSlug)}, frontmatter: { broader: [${refs
          .map((r) => q(r))
          .join(", ")}] })`,
      );
    } else {
      lines.push(
        `add_relation(from: ${q(origin.focalSlug)}, to: ${q(slug)}, type: ${q(
          RELATION_EDGE_TYPE[origin.relation],
        )})`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * Single-socket MCP command for the ENHANCE read-only fallback — filling one
 * relation on an EXISTING focal node. is-a patches the `broader` frontmatter
 * key (MCP has no is_a edge type); the rest are `add_relation` edges.
 */
export function buildFillPacket(
  focalSlug: string,
  relation: CreateRelationType,
  candidateRef: string,
): string {
  const q = (v: string) => `"${v.replace(/"/g, '\\"')}"`;
  if (relation === "isA") {
    return `patch_concept(slug: ${q(focalSlug)}, frontmatter: { broader: [${q(candidateRef)}] })`;
  }
  return `add_relation(from: ${q(focalSlug)}, to: ${q(candidateRef)}, type: ${q(RELATION_EDGE_TYPE[relation])})`;
}

/**
 * ── 지지대 편집 (Slice 1) MCP packets — read-only vault fallback ────────────
 * When the vault is read-only (sample / dogfood), edits to EXISTING relations
 * are emitted as copyable MCP command packets instead of a direct frontmatter
 * write. is_a has no MCP edge type (same as `buildFillPacket`), so any change
 * that touches the `broader` array is applied via `patch_concept` with the FULL
 * post-change array the caller supplies in `broaderRefsAfter` — the builder
 * stays a dumb serializer and never has to re-derive vault state.
 */

/**
 * Remove one existing relation from the focal node.
 *  - non-is_a → `remove_relation(from, to, type, confirm:true)`.
 *  - is_a     → `patch_concept(slug, frontmatter:{ broader:[…post-remove] })`
 *    (MCP has no is_a edge type). Pass the remaining broader refs.
 */
export function buildRemovePacket(
  focalSlug: string,
  relation: CreateRelationType,
  candidateRef: string,
  opts: { broaderRefsAfter?: readonly string[] } = {},
): string {
  const q = (v: string) => `"${v.replace(/"/g, '\\"')}"`;
  if (relation === "isA") {
    const refs = opts.broaderRefsAfter ?? [];
    return `patch_concept(slug: ${q(focalSlug)}, frontmatter: { broader: [${refs.map((r) => q(r)).join(", ")}] })`;
  }
  return `remove_relation(from: ${q(focalSlug)}, to: ${q(candidateRef)}, type: ${q(RELATION_EDGE_TYPE[relation])}, confirm: true)`;
}

/**
 * Retype one existing relation — move a neighbor from one bearing to another.
 *  - non-is_a → non-is_a: single atomic `replace_relation(...)`.
 *  - is_a on either side: composed, because is_a lives in the `broader` array
 *    rather than as an MCP edge. Whichever side touches `broader` needs the FULL
 *    post-change array in `broaderRefsAfter`.
 */
export function buildEditPacket(
  focalSlug: string,
  fromRelation: CreateRelationType,
  toRelation: CreateRelationType,
  candidateRef: string,
  opts: { broaderRefsAfter?: readonly string[] } = {},
): string {
  const q = (v: string) => `"${v.replace(/"/g, '\\"')}"`;
  const broaderLine = () =>
    `patch_concept(slug: ${q(focalSlug)}, frontmatter: { broader: [${(opts.broaderRefsAfter ?? [])
      .map((r) => q(r))
      .join(", ")}] })`;

  // is_a → other: drop from broader, add the new edge.
  if (fromRelation === "isA" && toRelation !== "isA") {
    return [
      broaderLine(),
      `add_relation(from: ${q(focalSlug)}, to: ${q(candidateRef)}, type: ${q(RELATION_EDGE_TYPE[toRelation])})`,
    ].join("\n");
  }
  // other → is_a: remove the old edge, append to broader.
  if (toRelation === "isA" && fromRelation !== "isA") {
    return [
      `remove_relation(from: ${q(focalSlug)}, to: ${q(candidateRef)}, type: ${q(RELATION_EDGE_TYPE[fromRelation])}, confirm: true)`,
      broaderLine(),
    ].join("\n");
  }
  // non-is_a → non-is_a: atomic replace, same target, new type.
  return `replace_relation(from: ${q(focalSlug)}, oldTo: ${q(candidateRef)}, oldType: ${q(
    RELATION_EDGE_TYPE[fromRelation as Exclude<CreateRelationType, "isA">],
  )}, newTo: ${q(candidateRef)}, newType: ${q(
    RELATION_EDGE_TYPE[toRelation as Exclude<CreateRelationType, "isA">],
  )}, confirm: true)`;
}

/**
 * Six completeness checkpoints (name · definition · is_a · depends · contains ·
 * relates) drive the rising gauge. Deterministic so the gauge and the pips never
 * disagree. Percent = round(filled / 6 · 100).
 */
export const CREATE_CHECKPOINTS = 6;

export interface CreateCompleteness {
  percent: number;
  filledCount: number;
  total: number;
  /** One state per checkpoint: the first unfilled after the filled ones is `next`. */
  pips: Array<"on" | "next" | "off">;
}

export function computeCreateCompleteness(draft: CreateDraft): CreateCompleteness {
  const has = (type: CreateRelationType) => draft.relations.some((r) => r.type === type);
  const checks = [
    draft.title.trim().length > 0,
    draft.definition.trim().length > 0,
    has("isA"),
    has("dependsOn"),
    has("contains"),
    has("relates"),
  ];
  const filledCount = checks.filter(Boolean).length;
  let nextAssigned = false;
  const pips = checks.map((filled) => {
    if (filled) return "on" as const;
    if (!nextAssigned) {
      nextAssigned = true;
      return "next" as const;
    }
    return "off" as const;
  });
  return {
    percent: Math.round((filledCount / CREATE_CHECKPOINTS) * 100),
    filledCount,
    total: CREATE_CHECKPOINTS,
    pips,
  };
}
