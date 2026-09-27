import { createHash, randomUUID } from 'node:crypto';

/**
 * Vault kind schema: the per-kind frontmatter shape add_concept and the CLI both
 * apply (`cli/src/lib/schema.mjs` loads this file). `arrayDefaults` are always
 * emitted, as empty arrays when unsupplied; `optional` keys are never
 * auto-emitted. `relation_notes` (`{ <ref>: "one sentence" }` on the source
 * document, keyed as the relation array spells the ref) is optional on every
 * kind; a key naming no declared relation is `orphaned-relation-note` in
 * validate.mjs. Missing `requiredExtras` are validator warnings, not errors, so
 * existing vaults keep working.
 */

export const VAULT_KINDS = ['project', 'domain', 'capability', 'element', 'document'];

/** The public meaning contract for choosing a kind or relation; this schema owns only mechanical shape. */
export const ONTOLOGY_META_MODEL_REFERENCE =
  'https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind';

function metaModelStarterLine() {
  return `Kind and relation contract: ${ONTOLOGY_META_MODEL_REFERENCE}\n`;
}

/**
 * The `uid` is the immutable machine identity: random, because slug, title and path
 * may all change; UUIDv4 needs no allocator and implies no branch order.
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

/** Identities absorbed by a merge: lookup aliases only, never endpoints, URLs, file names or graph ids. */
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

function normalizeMergedUids(uid, mergedUids) {
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
 * Authorship provenance: `human` or `agent:<name>`, stamped at write time on the
 * actor the call path proves, never inferred afterwards (git blame, missing log
 * lines). Optional, and absence means unknown: no warning, and nothing defaults
 * it to `human`.
 */
export const CREATED_BY_KEY = 'created_by';
export const CREATED_BY_HUMAN = 'human';
export const CREATED_BY_AGENT_PREFIX = 'agent:';
/** The call path proves an agent wrote it but not which one; unknown stays unknown, never `human`. */
export const CREATED_BY_AGENT_UNKNOWN = `${CREATED_BY_AGENT_PREFIX}unknown`;

/** Agent name → `agent:<name>`. With no name, `agent:unknown`. */
export function agentCreatedBy(agentName) {
  const name = typeof agentName === 'string' ? agentName.trim() : '';
  return name ? `${CREATED_BY_AGENT_PREFIX}${name}` : CREATED_BY_AGENT_UNKNOWN;
}

/**
 * Human judgment (`docs/benchmark/FINDINGS-2026-09-02-review-marks.md`): two facts,
 * not one enum, because they go stale in opposite directions. `human_decides`
 * reserves the node and must survive content changes; only a person clears
 * it. `confirmed` judges the content of its time and must expire when it changes,
 * or it launders a rewrite as accepted. Absence is unknown, never a defect: no
 * warning and no "unreviewed" wall (`docs/DECISIONS.md`, record 93 §5).
 */
export const REVIEW_STATE_KEY = 'review_state';
export const REVIEW_NOTE_KEY = 'review_note';
export const REVIEWED_BY_KEY = 'reviewed_by';
export const REVIEWED_AT_KEY = 'reviewed_at';
const REVIEWED_DIGEST_KEY = 'reviewed_digest';

/** Reserved for a person. An agent may raise this; only a person clears it. */
export const REVIEW_STATE_HUMAN_DECIDES = 'human_decides';
/** A person judged this node's meaning. Written only by a path that proves a person. */
export const REVIEW_STATE_CONFIRMED = 'confirmed';

export const REVIEW_STATES = Object.freeze([
  REVIEW_STATE_HUMAN_DECIDES,
  REVIEW_STATE_CONFIRMED,
]);

/**
 * Keys only a person may write: an agent setting them asserts a judgment, and the
 * file cannot tell that from a recorded one.
 */
export const HUMAN_ONLY_REVIEW_KEYS = Object.freeze([
  REVIEWED_BY_KEY,
  REVIEWED_AT_KEY,
  REVIEWED_DIGEST_KEY,
]);

const REVIEW_KEYS = Object.freeze([
  REVIEW_STATE_KEY,
  REVIEW_NOTE_KEY,
  ...HUMAN_ONLY_REVIEW_KEYS,
]);

/**
 * Presentation keys the digest ignores: a localized display name and a canvas
 * position change no claim, and including them would expire approvals on a
 * translation or a drag. A denylist on purpose: an unlisted key counts as
 * meaning, so a new presentation key yields a false "changed", never a missed one.
 */
const DIGEST_IGNORED_KEY_PREFIXES = ['display', 'canvasPosition'];

/**
 * 32 lowercase hex characters, the only binding this module writes. Anything else
 * never set a baseline, and reporting drift against it would accuse a person of
 * a change nobody made.
 */
const REVIEWED_DIGEST_PATTERN = /^[0-9a-f]{32}$/;

/**
 * The currentness binding of an approval. A timestamp only orders events and
 * mtime does not survive a clone; the digest travels in the file. Optional, so a
 * person can record a judgment in a text editor without Atlas running.
 */
function reviewDigest(frontmatter, body) {
  const meaning = {};
  for (const [key, value] of Object.entries(frontmatter ?? {})) {
    if (REVIEW_KEYS.includes(key)) continue;
    if (DIGEST_IGNORED_KEY_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}_`))) continue;
    meaning[key] = value;
  }
  const ordered = Object.keys(meaning)
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((key) => [key, meaning[key]]);
  const payload = JSON.stringify([ordered, String(body ?? '').trim()]);
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 32);
}

/**
 * Has the node changed since a person confirmed it? `unknown` means the file
 * never carried a binding, a different fact from "still matches".
 */
export function reviewCurrentness(frontmatter, body) {
  const state = frontmatter?.[REVIEW_STATE_KEY];
  if (state !== REVIEW_STATE_CONFIRMED) return 'not-confirmed';
  const recorded = frontmatter?.[REVIEWED_DIGEST_KEY];
  if (typeof recorded !== 'string' || !REVIEWED_DIGEST_PATTERN.test(recorded)) return 'unknown';
  return recorded === reviewDigest(frontmatter, body) ? 'current' : 'changed-since-review';
}

/**
 * Node-eligibility gate values (`docs/DECISIONS.md`, Ontology Construction
 * Specification); logic in `vault.mjs`, wording in `construction-rules.mjs`.
 * None is a limit: each answers "when is a question worth asking", never "how
 * many children"; never phrase a derived value as "keep under N", since a cap is
 * gamed with empty buckets.
 */
export const NODE_ELIGIBILITY_GATE = Object.freeze({
  /**
   * One unresolved graph reference is worth a sentence: it is evidence sitting in a
   * meaning slot, not a small child, so there is no acceptable amount.
   */
  NOTICE_THRESHOLD: 1,
  /** After the first notice, quiet until the count crosses a multiple: a channel that always talks is filtered. */
  NOTICE_REPEAT_MULTIPLE: 10,
  /**
   * Siblings born under one parent in one machine batch before the gate asks
   * whether they are distinct roles. Provenance, not population, which only the
   * write path can see.
   */
  BULK_PROVENANCE_SIBLING_TRIGGER: 5,
  /** Refs one message names before "and N more": a pasted wall of paths is not read. */
  REFERENCE_SAMPLE_LIMIT: 5,
  /**
   * Cold-start dense-parent triggers until a vault has enough parents of a kind
   * for a live percentile. Not caps: "they are interchangeable, leave it alone" is
   * an accepted answer. A researched starting range (schema.org `Thing`, this
   * vault's domain median, `docs/DECISIONS.md` amendment), not a measured law.
   * No `project→domain`: the sample is too small for any number.
   */
  BOOTSTRAP_FANOUT_TRIGGER: Object.freeze({
    domain_to_capability: 8,
    capability_to_element: 6,
  }),
  /** Below this many parents of a kind the vault's percentile is noise, so the bootstrap value stands in. */
  MIN_PARENTS_FOR_LIVE_PERCENTILE: 10,
  /**
   * A dense parent is mentioned only when most of its references are broken; above
   * this rate the width is real structure (schema.org's `CreativeWork` is wide and
   * healthy), and firing anyway would bring the cap back by the side door.
   */
  DENSE_PARENT_RESOLUTION_FLOOR: 0.7,
});

export const VAULT_KIND_SCHEMA = {
  project: {
    folder: '',
    arrayDefaults: ['domains', 'capabilities', 'elements'],
    // `display` is the short name labels draw when `title` is long. Without it the
    // renderer derives one from `title` before " ("
    // (`deriveDisplayTitle`, `src/shared/lib/derive-display-title.ts`); search keeps the full title.
    optional: ['dependencies', 'relates', 'relation_notes', 'description', 'status', 'display', CREATED_BY_KEY, ...REVIEW_KEYS],
    requiredExtras: [],
    // Key order for a human reading the file; unknown keys go last.
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
      ...REVIEW_KEYS,
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
    optional: ['depends_on', 'relates', 'broader', 'relation_notes', 'description', 'display', CREATED_BY_KEY, ...REVIEW_KEYS],
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
      ...REVIEW_KEYS,
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `Describe the stable responsibility or problem boundary, what it includes, ` +
      `what it excludes, and the evidence that makes it more than a folder or team.\n\n` +
      `## Includes\n\n` +
      `- <one responsibility this domain owns>\n\n` +
      `## Excludes\n\n` +
      `- <one neighbouring responsibility this domain does not own>\n\n` +
      `## Evidence\n\n` +
      `- <what makes this more than a folder or a team name>\n\n` +
      `## Uncertainty\n\n` +
      `- <what you did not read or could not check>\n\n` +
      metaModelStarterLine(),
  },
  capability: {
    folder: 'capabilities/',
    arrayDefaults: ['elements'],
    optional: ['path', 'depends_on', 'relates', 'broader', 'relation_notes', 'description', 'display', CREATED_BY_KEY, ...REVIEW_KEYS],
    // `domain` is the tree parent; without it the capability floats as an orphan.
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
      'depends_on',
      'elements',
      'path',
      CREATED_BY_KEY,
      ...REVIEW_KEYS,
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `Describe the observable, implementation-independent ability, its boundary, ` +
      `and the evidence or scenario that proves the product or system can perform it.\n\n` +
      `## Includes\n\n` +
      `- <one thing this capability can do>\n\n` +
      `## Excludes\n\n` +
      `- <one nearby ability this capability does not provide>\n\n` +
      `## Evidence\n\n` +
      `- path: <file> — what it proves\n\n` +
      `## Uncertainty\n\n` +
      `- <what you did not read or could not check>\n\n` +
      metaModelStarterLine(),
  },
  element: {
    folder: 'elements/',
    arrayDefaults: [],
    optional: ['path', 'depends_on', 'relates', 'broader', 'relation_notes', 'description', 'display', CREATED_BY_KEY, ...REVIEW_KEYS],
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
      ...REVIEW_KEYS,
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `Describe the distinct implementation role, what it realizes or proves, and ` +
      `the source path or interface that supports the claim. A path alone is evidence, not a node.\n\n` +
      `## Includes\n\n` +
      `- <one part of the role this element plays>\n\n` +
      `## Excludes\n\n` +
      `- <one nearby role this element does not play>\n\n` +
      `## Evidence\n\n` +
      `- path: <file> — what it proves\n\n` +
      `## Uncertainty\n\n` +
      `- <what you did not read or could not check>\n\n` +
      metaModelStarterLine(),
  },
  document: {
    folder: '',
    arrayDefaults: [],
    optional: ['describes', 'relates', 'relation_notes', 'display', CREATED_BY_KEY, ...REVIEW_KEYS],
    requiredExtras: [],
    preferredOrder: ['uid', 'merged_uids', 'slug', 'kind', 'title', 'display', 'describes', 'relates', CREATED_BY_KEY, ...REVIEW_KEYS],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `State what this narrative or reference artifact explains and which graph concept it describes.\n\n` +
      metaModelStarterLine(),
  },
};

/**
 * Kind-named lists (spec §5): what their entries are and which kinds keep them.
 * Every rewriter after a kind change (`redirectBacklinks` in `vault.mjs`, the
 * app's `rename-ref-rewrites.ts`) asks this table, or an element stays listed
 * under `capabilities:`, resolves silently, and is counted as a capability. The
 * same-kind bridge spec §5 allows is absent: a bridge is a person's decision.
 * The app copy `src/shared/lib/containment-keys.ts` is compared over every kind
 * pair by `tests/contract/vault-schema.contract.test.ts`.
 */
export const CONTAINMENT_KEY_FOR_KIND = Object.freeze({
  domain: 'domains',
  capability: 'capabilities',
  element: 'elements',
});

const CONTAINMENT_HOLDER_KINDS = Object.freeze({
  domains: Object.freeze(['project']),
  capabilities: Object.freeze(['project', 'domain']),
  elements: Object.freeze(['project', 'domain', 'capability']),
});

/** The list a node of `holderKind` keeps a `childKind` node in, or null when it keeps none. */
export function containmentKeyFor(holderKind, childKind) {
  const key = CONTAINMENT_KEY_FOR_KIND[childKind];
  if (!key) return null;
  return CONTAINMENT_HOLDER_KINDS[key].includes(holderKind) ? key : null;
}

/**
 * An emptied relation list is `[]` when add_concept writes that key empty for
 * this kind (`arrayDefaults`), else `null` (the key is deleted), so a removal
 * leaves the shape creation would have. The app's `ontology-relation-edit.ts`
 * and the CLI's `remove-relation` follow the same rule.
 */
export function emptiedRelationListValue(kind, key) {
  const name = typeof kind === 'string' ? kind.trim() : '';
  const schema = Object.hasOwn(VAULT_KIND_SCHEMA, name) ? VAULT_KIND_SCHEMA[name] : undefined;
  return schema?.arrayDefaults.includes(key) ? [] : null;
}

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
 * Normalized frontmatter for a new node: `{ slug, kind, title }`, arrayDefaults
 * as [] when not supplied, other keys passed through. Throws on an unknown kind.
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
  const ordered = {};
  for (const key of schema.preferredOrder) {
    if (key in accumulator) ordered[key] = accumulator[key];
    // Locale display names (`display_ko`, …) sit right after `display`.
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
 * A slug under a kind folder must be flat (`elements/<name>`; `docs/DECISIONS.md`,
 * "A slug is a flat identifier"): path-style slugs collide on a shared basename
 * and different nodes fold into one. Nesting outside a kind folder is the user's
 * own convention and left alone. Location belongs in `path:`. A hard error at
 * add, rename and reclassify: shape validity, cheap to fix only at creation.
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

/** The kind's starter markdown, used when no body is passed, so a first file explains itself. */
export function defaultBody(kind, title) {
  const schema = VAULT_KIND_SCHEMA[kind];
  if (!schema) throw new Error(`Unknown kind: ${kind}`);
  return schema.bodyTemplate(title);
}

/** Folder prefix for `--auto-prefix` (`capabilities/foo`); project and document stay at the root. */
export function folderForKind(kind) {
  const schema = VAULT_KIND_SCHEMA[kind];
  if (!schema) return '';
  return schema.folder;
}

export const VAULT_SOURCES_DIR = 'sources';

export function isVaultSourcePath(relativePath) {
  return typeof relativePath === 'string' && relativePath.startsWith(`${VAULT_SOURCES_DIR}/`);
}

export function rawSourceFileForSlug(slug) {
  return /\.[^/.]+$/.test(slug) ? slug : `${slug}.md`;
}

export function rawSourceSlugIssue(slug) {
  if (!isVaultSourcePath(slug)) return null;
  return (
    `slug "${slug}" must not name a file under ${VAULT_SOURCES_DIR}/: every file there is a raw source, never a node. ` +
    'Write or move a node into a kind folder such as domains/ or capabilities/, ' +
    `and read the source with read_source({ path: "${rawSourceFileForSlug(slug)}" }).`
  );
}

/** The `requiredExtras` a frontmatter lacks; advisory. */
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
 * Maps `labels: { ko, en }` → `display_ko`, `display_en`. `title` stays the
 * locale-independent identity for search and matching; only render surfaces
 * read `display_<locale>`. Anything but a two-letter code with a non-empty string is
 * dropped silently, so a wrong key cannot pollute the vault.
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
