import { randomUUID } from 'node:crypto';

/**
 * Vault kind schema — per-kind frontmatter shape that AI agents and the CLI
 * both follow when they create new ontology nodes. Single source of truth for
 * `add_concept` (MCP) and `ontology-atlas add` (CLI).
 *
 * The mirror copy lives at `cli/src/lib/schema.mjs`; a contract test
 * (`tests/contract/vault-schema.contract.test.ts`) keeps the two in lock-step.
 *
 * Why a schema beyond the existing templates?
 *
 *   - The example .md templates under `cli/templates/vault/` are seeds for
 *     `cli init` only — they don't constrain `cli add` or `add_concept`.
 *   - Without per-kind defaults, an agent calling `add_concept(kind:
 *     'capability', slug, title)` produced a node missing `domain:` and
 *     `elements: []`, which silently degraded downstream tooling.
 *   - This schema makes "what fields belong on what kind" explicit and
 *     mechanically applied so external `.md` ingestion later (cli import)
 *     can normalize the same way.
 *
 * Two field categories:
 *   - `arrayDefaults`: keys that should be present as an empty array if not
 *     supplied. Always emitted so AI agents and humans can read/edit them.
 *   - `optional`: keys that may appear but are not auto-emitted.
 *
 * `requiredExtras` is the *expected* set beyond `slug/kind/title`. Missing
 * extras are surfaced as validator warnings (not hard errors) — they are
 * advisory in v0.x to avoid breaking pre-existing vaults.
 */

export const VAULT_KINDS = ['project', 'domain', 'capability', 'element', 'document'];

/**
 * Public semantic contract for choosing a kind or relation.
 *
 * The schema below owns mechanical frontmatter shape. It deliberately does not
 * duplicate the human/agent meaning tests: every authoring channel points to
 * the one public contract instead.
 */
export const ONTOLOGY_META_MODEL_REFERENCE =
  'https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind';

function metaModelStarterLine() {
  return `Kind and relation contract: ${ONTOLOGY_META_MODEL_REFERENCE}\n`;
}

/**
 * Node identity v1 (2026-08-02 decision ledger).
 *
 * `uid` is the immutable machine identity. It is deliberately random rather
 * than derived from slug/title/path, because all three are allowed to change.
 * UUIDv4 is locally generatable, has no central allocator, and does not create
 * branch-order semantics like a sequential number would.
 */
export const NODE_UID_PATTERN =
  '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const NODE_UID_RE = new RegExp(NODE_UID_PATTERN);

export function generateNodeUid() {
  return randomUUID();
}

export function nodeUidIssue(uid) {
  if (typeof uid !== 'string' || !NODE_UID_RE.test(uid)) {
    return (
      '`uid:` must be a lowercase UUIDv4 generated once for this node ' +
      '(example: 01890f3e-7b5d-4c0a-8f14-123456789abc). It is immutable and must not be derived from slug, title, or path.'
    );
  }
  return null;
}

/**
 * Absorbed identities retained by the surviving node after merge.
 * They are lookup aliases only: they never become relation endpoints, URLs,
 * file names, or graph node IDs.
 */
export function inspectMergedUids(uid, mergedUids) {
  if (mergedUids === undefined) return { canonical: [], invalidIssue: null, nonCanonical: false };
  if (!Array.isArray(mergedUids)) {
    return {
      canonical: [],
      invalidIssue: '`merged_uids:` must be an array of lowercase UUIDv4 values.',
      nonCanonical: false,
    };
  }
  for (const value of mergedUids) {
    if (nodeUidIssue(value)) {
      return {
        canonical: [],
        invalidIssue: '`merged_uids:` may contain only lowercase UUIDv4 values.',
        nonCanonical: false,
      };
    }
    if (value === uid) {
      return {
        canonical: [],
        invalidIssue: '`merged_uids:` must not repeat the surviving node\'s `uid:`.',
        nonCanonical: false,
      };
    }
  }
  const canonical = [...new Set(mergedUids)].sort((a, b) => a.localeCompare(b, 'en'));
  return {
    canonical,
    invalidIssue: null,
    nonCanonical:
      canonical.length !== mergedUids.length ||
      canonical.some((value, index) => value !== mergedUids[index]),
  };
}

export function normalizeMergedUids(uid, mergedUids) {
  const inspected = inspectMergedUids(uid, mergedUids);
  if (inspected.invalidIssue) throw new Error(inspected.invalidIssue);
  return inspected.canonical;
}

export function mergeNodeIdentityHistory(fromFrontmatter, intoFrontmatter) {
  const fromUidIssue = nodeUidIssue(fromFrontmatter?.uid);
  const intoUidIssue = nodeUidIssue(intoFrontmatter?.uid);
  if (fromUidIssue || intoUidIssue) {
    throw new Error('Both merge_concepts nodes must have valid lowercase UUIDv4 identities.');
  }
  const fromMerged = normalizeMergedUids(fromFrontmatter.uid, fromFrontmatter.merged_uids);
  const intoMerged = normalizeMergedUids(intoFrontmatter.uid, intoFrontmatter.merged_uids);
  const sourceClaims = [fromFrontmatter.uid, ...fromMerged];
  const survivorClaims = new Set([intoFrontmatter.uid, ...intoMerged]);
  const overlap = sourceClaims.find((uid) => survivorClaims.has(uid));
  if (overlap) throw new Error(`UID collision during merge: ${overlap} is already claimed by both nodes.`);
  return {
    survivorUid: intoFrontmatter.uid,
    absorbedUids: sourceClaims,
    merged_uids: [...new Set([...intoMerged, ...sourceClaims])].sort((a, b) => a.localeCompare(b, 'en')),
  };
}

/**
 * Authorship provenance (decision ledger 2026-07-31 — 「사람이 만든 노드 표기」,
 * marking human-authored nodes).
 *
 * The value is either `human` or `agent:<name>`, nothing else. **The stamp is
 * applied at write time, to the actor the call path proves** — provenance does not
 * exist retroactively ("no log means a human", git blame): 98 nodes carried 4
 * activity-log lines, and the git user is a single person. Therefore:
 *
 *   - This key is **optional**. It is not in `requiredExtras`.
 *   - **Absence is unknown, not a defect.** No validator warning is attached, and
 *     no path defaults an absent value to `human`.
 */
export const CREATED_BY_KEY = 'created_by';
export const CREATED_BY_HUMAN = 'human';
export const CREATED_BY_AGENT_PREFIX = 'agent:';
/**
 * For when the call path proves «an agent wrote this» but not its **name** (no
 * activity heartbeat, for instance). Falling back to the human side because the
 * name is unknown would be exactly the retroactive inference this decision
 * forbids, so unknown is recorded as unknown.
 */
export const CREATED_BY_AGENT_UNKNOWN = `${CREATED_BY_AGENT_PREFIX}unknown`;

/** Agent name → `agent:<name>`. With no name, `agent:unknown`. */
export function agentCreatedBy(agentName) {
  const name = typeof agentName === 'string' ? agentName.trim() : '';
  return name ? `${CREATED_BY_AGENT_PREFIX}${name}` : CREATED_BY_AGENT_UNKNOWN;
}

/**
 * Node-eligibility gate — the numbers half (2026-07-31 council, `docs/DECISIONS.md`
 * 「온톨로지 구축 규격」). The gate logic lives in `mcp/src/vault.mjs`, the wording in
 * `mcp/src/construction-rules.mjs`; only the values live here.
 *
 * ⚠️ **None of these is a limit.** The council removed the fan-out cap in every
 * form, including per-kind caps: a number a model can be told to stay under is a
 * number it games with empty buckets while the graph gets no better. Each value
 * below answers "when is it worth *asking* a question", never "how many children
 * may a node have". Do not phrase anything derived from these as "keep under N".
 *
 * They live in the schema module because it is already the two-package value
 * canon: `cli/src/lib/schema.mjs` carries a literal mirror (the packages have
 * zero cross-imports by design) and `tests/contract/vault-schema.contract.test.ts`
 * fails the build when the two drift.
 */
export const NODE_ELIGIBILITY_GATE = Object.freeze({
  /**
   * A node with this many unresolved graph references is worth one sentence.
   * One is enough: an entry that resolves to nothing is not a small version of a
   * child, it is a different category of thing (evidence) sitting in a meaning
   * slot. There is no "acceptable amount" to tune down to.
   */
  NOTICE_THRESHOLD: 1,
  /**
   * After the first notice, stay quiet until the count crosses a multiple of
   * this. Repeating the same sentence on every write is how `missing-expected-field`
   * became invisible — the reader filters a channel that always talks.
   */
  NOTICE_REPEAT_MULTIPLE: 10,
  /**
   * Siblings born under one parent inside a single machine batch before the gate
   * asks whether they name distinct roles. Provenance, not population: five nodes
   * a person wrote over five days say nothing, five the same batch emitted say
   * a directory listing was transcribed. A static vault scan cannot tell the two
   * apart, which is why this check can only exist on the write path.
   */
  BULK_PROVENANCE_SIBLING_TRIGGER: 5,
  /**
   * How many offending refs a single message names before it says "and N more".
   * A warning that pastes 92 paths is a wall, and a wall is not read.
   */
  REFERENCE_SAMPLE_LIMIT: 5,
  /**
   * Cold-start defaults for the dense-parent trigger, used only until this vault
   * has enough parents of a kind for a live percentile to mean anything.
   *
   * NOT a cap — the gate never blocks on count; it asks the writer to name why
   * siblings are not interchangeable, and "they are, leave it alone" is an
   * accepted answer. Sources: schema.org `Thing` (11 direct subtypes after
   * fifteen production years), this vault's non-hub domain median (4), and its
   * one healthy wide capability (`topology-kind-legibility`, 7 elements all
   * resolving to real nodes); see `docs/DECISIONS.md` 2026-07-31 amendment.
   * Recalibrate after the vault regeneration stage — these are a researched
   * starting range promoted from descriptive statistics, not a measured law.
   *
   * `project→domain` is deliberately absent: the sample is too small for any
   * number to mean anything, and inventing one would be the guess this block
   * exists to avoid.
   */
  BOOTSTRAP_FANOUT_TRIGGER: Object.freeze({
    domain_to_capability: 8,
    capability_to_element: 6,
  }),
  /**
   * Below this many parents of a kind, a percentile computed from this vault is
   * describing noise, so the bootstrap value stands in. At or above it, the
   * vault's own p90 wins — a mature vault knows its own shape better than any
   * constant shipped from outside it.
   */
  MIN_PARENTS_FOR_LIVE_PERCENTILE: 10,
  /**
   * A dense parent is only worth mentioning when its references are mostly
   * broken. Above this resolution rate the width is load-bearing structure, not
   * a transcribed directory listing — schema.org's `CreativeWork` carries 67
   * direct subtypes and is not sick. Without this condition the check would fire
   * on every legitimately wide parent, and a warning that cries wolf is filtered
   * out by the reader, which is how the fan-out cap would come back by the side
   * door.
   */
  DENSE_PARENT_RESOLUTION_FLOOR: 0.7,
});

export const VAULT_KIND_SCHEMA = {
  project: {
    folder: '',
    arrayDefaults: ['domains', 'capabilities', 'elements'],
    // `display` — the short name the topology label, INDEX, popover, and detail
    // header draw when `title` is long (carrying a parenthesised gloss, say).
    // Without it the renderer derives one from the part of `title` before " ("
    // (`deriveDisplayTitle`, `src/shared/lib/derive-display-title.ts`), so most
    // titles never need this key. Search and matching keep using the full title.
    optional: ['dependencies', 'relates', 'description', 'status', 'display', CREATED_BY_KEY],
    requiredExtras: [],
    // Recommended key order, for a human reading the file. buildFrontmatter sorts
    // by this order and appends undefined keys (an external import's custom_field,
    // for instance) at the end.
    preferredOrder: [
      'uid',
      'merged_uids',
      'slug',
      'kind',
      'title',
      'display',
      'description',
      'status',
      'dependencies',
      'domains',
      'capabilities',
      'elements',
      CREATED_BY_KEY,
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `One- or two-line summary of this project: *what / for whom / why*.\n\n` +
      `## How it grows\n\n` +
      `- Fill \`domains: [...]\` in the frontmatter and the domain nodes hang\n` +
      `  off the project tree automatically.\n` +
      `- Each domain's capabilities and elements follow the same pattern.\n\n` +
      metaModelStarterLine(),
  },
  domain: {
    folder: 'domains/',
    arrayDefaults: ['capabilities'],
    optional: ['depends_on', 'relates', 'broader', 'description', 'display', CREATED_BY_KEY],
    requiredExtras: [],
    preferredOrder: [
      'uid',
      'merged_uids',
      'slug',
      'kind',
      'title',
      'display',
      'description',
      'depends_on',
      'capabilities',
      CREATED_BY_KEY,
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `Describe the stable responsibility or problem boundary, what it includes, ` +
      `what it excludes, and the evidence that makes it more than a folder or team.\n\n` +
      metaModelStarterLine(),
  },
  capability: {
    folder: 'capabilities/',
    arrayDefaults: ['elements'],
    optional: ['path', 'depends_on', 'relates', 'broader', 'description', 'display', CREATED_BY_KEY],
    // `domain` is the parent in the tree hierarchy — left empty, the capability
    // floats as an orphan and adds distribution noise to the user's insights. The
    // validator warns.
    requiredExtras: ['domain'],
    // A capability's core identity is "one function inside a domain", so `domain`
    // ranks above the arrays. Its children (elements / depends_on) come next.
    preferredOrder: [
      'uid',
      'merged_uids',
      'slug',
      'kind',
      'title',
      'display',
      'description',
      'domain',
      'depends_on',
      'elements',
      'path',
      CREATED_BY_KEY,
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `Describe the observable, implementation-independent ability, its boundary, ` +
      `and the evidence or scenario that proves the product or system can perform it.\n\n` +
      metaModelStarterLine(),
  },
  element: {
    folder: 'elements/',
    arrayDefaults: [],
    optional: ['path', 'depends_on', 'relates', 'broader', 'description', 'display', CREATED_BY_KEY],
    // An element is the unit some capability inside some domain uses — with
    // `domain` missing it floats as a sink in the tree.
    requiredExtras: ['domain'],
    preferredOrder: [
      'uid',
      'merged_uids',
      'slug',
      'kind',
      'title',
      'display',
      'description',
      'domain',
      'path',
      'depends_on',
      CREATED_BY_KEY,
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `Describe the distinct implementation role, what it realizes or proves, and ` +
      `the source path or interface that supports the claim. A path alone is evidence, not a node.\n\n` +
      metaModelStarterLine(),
  },
  document: {
    folder: '',
    arrayDefaults: [],
    optional: ['describes', 'relates', 'display', CREATED_BY_KEY],
    requiredExtras: [],
    preferredOrder: ['uid', 'merged_uids', 'slug', 'kind', 'title', 'display', 'describes', 'relates', CREATED_BY_KEY],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `State what this narrative or reference artifact explains and which graph concept it describes.\n\n` +
      metaModelStarterLine(),
  },
};

const GRAPH_ARRAY_KEYS = new Set([
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
  'broader',
]);

function normalizeGraphArray(key, value) {
  if (!GRAPH_ARRAY_KEYS.has(key) || !Array.isArray(value)) return value;
  const seen = new Set();
  const refs = [];
  const passthrough = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      passthrough.push(item);
      continue;
    }
    const ref = item.trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
  }
  refs.sort((a, b) => a.localeCompare(b, 'en'));
  return [...refs, ...passthrough];
}

/**
 * Build a normalized frontmatter object for a new node.
 *
 *   - Always: { slug, kind, title }
 *   - Add arrayDefaults as [] if not provided.
 *   - Pass-through any other supplied keys (so callers can also set
 *     `domain`, `capabilities`, `elements`, `dependencies`, custom keys …).
 *
 * Throws if kind is unknown.
 */
export function buildFrontmatter(input) {
  const { uid, slug, kind, title, ...extras } = input;
  if (!VAULT_KIND_SCHEMA[kind]) {
    throw new Error(
      `Unknown kind: ${kind}. Expected one of ${VAULT_KINDS.join(' / ')}.`,
    );
  }
  const schema = VAULT_KIND_SCHEMA[kind];
  const nodeUid = uid ?? generateNodeUid();
  const uidIssue = nodeUidIssue(nodeUid);
  if (uidIssue) throw new Error(uidIssue);
  const accumulator = { uid: nodeUid, slug, kind, title };
  // Caller-supplied keys win over arrayDefaults — explicit values aren't
  // overwritten by an empty array.
  for (const key of schema.arrayDefaults) {
    accumulator[key] = Array.isArray(extras[key]) ? normalizeGraphArray(key, extras[key]) : [];
  }
  for (const [key, value] of Object.entries(extras)) {
    if (value === undefined || value === null) continue;
    if (key in accumulator && Array.isArray(accumulator[key]) && Array.isArray(value)) {
      accumulator[key] = normalizeGraphArray(key, value);
      continue;
    }
    accumulator[key] = normalizeGraphArray(key, value);
  }
  if ('merged_uids' in accumulator) {
    const mergedUids = normalizeMergedUids(nodeUid, accumulator.merged_uids);
    if (mergedUids.length > 0) accumulator.merged_uids = mergedUids;
    else delete accumulator.merged_uids;
  }
  // Sort keys by the schema's preferredOrder for human readability. Keys with no
  // definition (a custom_field from frontmatter the user imported, for instance)
  // are appended at the end.
  const ordered = {};
  for (const key of schema.preferredOrder) {
    if (key in accumulator) ordered[key] = accumulator[key];
    // Per-locale display names (`display_ko` and friends) are grouped right after
    // `display`, so the name-family keys are not scattered when a human opens the
    // file (2026-07-24).
    if (key === 'display') {
      for (const localeKey of Object.keys(accumulator)) {
        if (/^display_[a-z]{2}$/.test(localeKey)) ordered[localeKey] = accumulator[localeKey];
      }
    }
  }
  for (const [key, value] of Object.entries(accumulator)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  return ordered;
}

/**
 * Slug flatness gate (2026-08-01 verdict 「슬러그는 평평한 식별자다」 — "a slug is a
 * flat identifier", `docs/DECISIONS.md`). It retired the earlier two-pattern
 * element slug (flat / path-style): the moment two files share a basename, a
 * path-style slug makes their tail aliases collide, and three surfaces — web
 * derivation, unique-tail resolution, and deep links — fold different nodes into
 * one. Measured on a regenerated vault, 2026-08-01: the three
 * `elements/src/{entities,views,widgets}/docs-vault` nodes merged into one on
 * screen and four relations vanished silently — 68 compiled vs 66 on screen.
 *
 * The rule is measured **only inside a schema folder**: a slug starting with
 * `folderForKind(kind)` must be flat after that prefix (`elements/<name>`, no
 * inner `/`). Nesting outside a schema folder (`services/auth/api` — the user's
 * own folder convention in their vault) is not this gate's business: the
 * local-first contract respects the structure of the user's disk, and a real tail
 * collision is caught by the compiler's `ambiguous-alias` warning.
 *
 * Location is carried by `path:`, not by the slug — the same sentence from the
 * 2026-07-31 construction rules ("a path is evidence for a concept, not the
 * concept") applied to identity. This function is a hard error at the write gates
 * (add / rename / reclassify): unlike the fan-out gate this is shape validity
 * rather than a judgement of meaning (the same class as a duplicate slug or an
 * unknown kind), and repairing it at creation costs one slug choice while
 * repairing it afterwards costs a rename cascade.
 */
export function flatSlugIssue(kind, slug) {
  if (typeof kind !== 'string' || typeof slug !== 'string') return null;
  const folder = VAULT_KIND_SCHEMA[kind]?.folder;
  if (!folder) return null;
  if (!slug.startsWith(folder)) return null;
  const rest = slug.slice(folder.length);
  if (!rest.includes('/') && !rest.includes('\\')) return null;
  const tail = rest.split(/[\\/]/).filter(Boolean).pop() ?? rest;
  return (
    `slug "${slug}" nests a path under ${folder}: a slug is the node's NAME, not a location. ` +
    `Node identity is resolved by the slug tail on three surfaces (web derivation, unique-tail lookup, deep links), ` +
    `so path-style slugs silently merge distinct nodes the moment two files share a basename. ` +
    `Use a flat slug under the kind folder (e.g. "${folder}${tail}") and record the file location in path: instead.`
  );
}

/**
 * Body helper — when the caller passes no body explicitly, fill in the schema's
 * per-kind starter markdown so the user's first `.md` alone conveys what belongs
 * in it.
 */
export function defaultBody(kind, title) {
  const schema = VAULT_KIND_SCHEMA[kind];
  if (!schema) throw new Error(`Unknown kind: ${kind}`);
  return schema.bodyTemplate(title);
}

/**
 * Automatic folder prefix — with `--auto-prefix` on, `ontology-atlas add
 * capability foo` normalises the slug to `capabilities/foo`. `project` and
 * `document` stay at root level (no prefix).
 */
export function folderForKind(kind) {
  const schema = VAULT_KIND_SCHEMA[kind];
  if (!schema) return '';
  return schema.folder;
}

/**
 * Validator helper — whether existing frontmatter is missing the schema's
 * `requiredExtras`. Returns the array of missing keys (empty when none). Advisory,
 * not a hard error.
 */
export function missingExpectedFields(kind, frontmatter) {
  const schema = VAULT_KIND_SCHEMA[kind];
  if (!schema) return [];
  const missing = [];
  for (const key of schema.requiredExtras) {
    const value = frontmatter[key];
    if (value === undefined || value === null) {
      missing.push(key);
      continue;
    }
    if (typeof value === 'string' && value.trim() === '') {
      missing.push(key);
    }
  }
  return missing;
}

/**
 * Per-locale display-name normalisation (owner decision, 2026-07-24) —
 * `labels: { ko, en }` → the `{ display_ko, display_en }` frontmatter keys.
 *
 * Why this is a separate layer: `title` is the single source of truth for search,
 * matching, and file identity, so it must not vary by locale. Only the render
 * surfaces (map labels, INDEX, popovers) read the `display_<locale>` matching the
 * screen locale (`src/features/vault-ontology/model/use-ontology-insight.ts`).
 *
 * Only a two-letter locale code with a non-empty string passes; anything else is
 * ignored silently, so a wrong key from an agent cannot pollute the vault.
 */
export function normalizeLocaleLabels(labels) {
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return {};
  const out = {};
  for (const [locale, value] of Object.entries(labels)) {
    if (!/^[a-z]{2}$/.test(locale)) continue;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out[`display_${locale}`] = trimmed;
  }
  return out;
}

/** Extracts just the locale codes from a `normalizeLocaleLabels` result, for warning text. */
export function localeLabelCodes(normalized) {
  return Object.keys(normalized)
    .map((key) => key.slice('display_'.length))
    .sort();
}
