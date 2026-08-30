/**
 * Input validation helpers for the MCP tools.
 *
 * Kept at parity with the UI: the same rule as the Inspector check in
 * `src/views/ontology-edit/lib/is-untitled-title.ts` — non-empty, and still
 * non-empty after trimming — so an agent cannot create silent pollution
 * (untitled or blank-title nodes).
 */

/**
 * Whether a value is safe as a vault frontmatter `title`. Rejects non-strings,
 * undefined, null, the empty string, and whitespace-only values.
 *
 * Used by addConcept (required input) and patchConcept (when the frontmatter
 * carries `title`).
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isValidVaultTitle(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

import { parseFrontmatter } from './parser.mjs';
import { inspectMergedUids, missingExpectedFields, nodeUidIssue } from './schema.mjs';

/**
 * Detects silent corruption in vault frontmatter. Guarantees the same issue codes
 * as `src/shared/lib/validate-vault-document.ts` (a contract test blocks drift),
 * and reads the raw text too so unclosed blocks and zero-key parses are caught.
 *
 * issue codes:
 *  - unclosed-frontmatter (error)
 *  - empty-kind (error)
 *  - missing-kind (warning)
 *  - unknown-kind (warning)
 *  - missing-expected-field (warning)
 *  - non-canonical-graph-array (warning)
 *  - parse-zero-keys (warning)
 *  - malformed-frontmatter-line (error)
 *  - dangling-graph-reference (warning) — whole-vault graph validation
 *
 * @param {string} raw
 * @returns {{ ok: boolean, issues: Array<{code: string, severity: 'error'|'warning', message: string}> }}
 */
export const VAULT_ISSUE_CODE_VALUES = Object.freeze([
  'unclosed-frontmatter',
  'parse-zero-keys',
  'malformed-frontmatter-line',
  'missing-kind',
  'empty-kind',
  'unknown-kind',
  'missing-uid',
  'invalid-uid',
  'invalid-merged-uids',
  'non-canonical-merged-uids',
  'missing-expected-field',
  'non-canonical-graph-array',
  'dangling-graph-reference',
  // Two documents claiming the same canonical slug (measured 2026-07-29).
  // A per-file check cannot catch it in principle — either file alone looks perfect.
  'duplicate-slug',
  'duplicate-uid',
]);

export const KNOWN_VAULT_KINDS = [
  'project',
  'domain',
  'capability',
  'element',
  'document',
  'vault-readme',
];

const ARCHITECTURE_PROFILE_SCHEMA = 'architecture-profile/v1';

const GRAPH_ARRAY_KEYS = [
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
  // `broader` (is_a / SKOS) was missing from this list when it was introduced
  // (audit 2026-07-25). This one list drives **both** the canonical-sort check and
  // the dangling-reference check, so the omission meant CI stayed green while an
  // agent wrote a typo slug into `broader`. The contract fixture pins it.
  'broader',
];

export function validateVaultDocument(raw) {
  const issues = [];
  const startsWithDelim = raw.startsWith('---');
  const closingIndex = startsWithDelim ? raw.indexOf('\n---', 3) : -1;

  if (startsWithDelim && closingIndex === -1) {
    issues.push({
      code: 'unclosed-frontmatter',
      severity: 'error',
      message:
        'frontmatter opens with `---` but never closes: this file is not read as a node.',
    });
    return { ok: false, issues };
  }

  if (!startsWithDelim) {
    return { ok: !issues.some((issue) => issue.severity === 'error'), issues };
  }

  const { frontmatter, diagnostics = [] } = parseFrontmatter(raw);
  pushFrontmatterDiagnostics(diagnostics, issues);
  const keys = Object.keys(frontmatter);

  if (keys.length === 0) {
    issues.push({
      code: 'parse-zero-keys',
      severity: 'warning',
      message:
        'a frontmatter block is present but no key could be read: suspect indentation or a missing colon.',
    });
    return { ok: !issues.some((issue) => issue.severity === 'error'), issues };
  }

  const rawKind = frontmatter.kind;
  const hasKindKey = 'kind' in frontmatter;
  const isArchitectureProfile = frontmatter.architecture_schema === ARCHITECTURE_PROFILE_SCHEMA;

  if (!hasKindKey) {
    if (!isArchitectureProfile) {
      issues.push({
        code: 'missing-kind',
        severity: 'warning',
        message:
          'frontmatter has no `kind:`: a file needs one to become a graph node.',
      });
    }
  } else if (typeof rawKind !== 'string' || rawKind.trim() === '') {
    issues.push({
      code: 'empty-kind',
      severity: 'error',
      message: '`kind:` is empty: this file is not read as a graph node.',
    });
  } else if (!KNOWN_VAULT_KINDS.includes(rawKind.trim())) {
    issues.push({
      code: 'unknown-kind',
      severity: 'warning',
      message: `\`kind: ${rawKind.trim()}\` is not a recognised value.`,
    });
  } else {
    // Advisory for a kind's expected field being absent (a capability's or
    // element's `domain`). schema.mjs is the single source, so UI, CLI, and MCP
    // all read the same dictionary.
    const trimmedKind = rawKind.trim();
    for (const key of missingExpectedFields(trimmedKind, frontmatter)) {
      issues.push({
        code: 'missing-expected-field',
        severity: 'warning',
        message: `\`${key}:\` is empty: a kind=${trimmedKind} node needs it to find its parent in the tree.`,
      });
    }
  }

  if (typeof rawKind === 'string' && rawKind.trim()) {
    pushUidIssues(frontmatter, issues);
  }

  pushNonCanonicalGraphArrayIssues(frontmatter, issues);
  pushSwallowedRelationNoteIssues(frontmatter, issues);

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
  };
}

/**
 * Finds **the mark left when one reason swallowed the reasons after it**.
 *
 * **Why** (review 2026-08-16 — found in our own vault):
 * `domains/agent-integration.md` declared three relation reasons, but reading it
 * there was **one**. The other two had been swallowed as text inside the first value:
 *
 * ```
 * capabilities/acp-runtime: "…permission gate., capabilities/skill-process-handoff: …"
 * ```
 *
 * The cause was **a single apostrophe** inside the value (`user's`). When a value
 * is not wrapped in quotes, that one character opens a quote state and the commas
 * after it stop reading as separators. The writing rule was fixed the same day
 * (apostrophes now force wrapping), but **marks already made stay**.
 *
 * And at that moment `validate` answered **`issue 0`** — the relation arrays were
 * intact so the graph was fine, and only the reasons were gone, which no check
 * looked at. «Why it was connected this way» is the record this product values
 * most, and the path for it to vanish silently was open.
 *
 * The test: if a reason value contains **another relation target this node
 * actually declared**, in `target: ` form, that is a swallowed entry rather than a
 * sentence. The condition is narrow — no sentence coincidentally quotes its own
 * neighbour's slug down to the colon.
 *
 * The second test covers the key side: every `relation_notes` key must name a
 * relation this node declares. A comma inside an unquoted value ends the entry
 * early and turns the remainder plus the next slug into a pseudo-key, which the
 * value test cannot see. That key is reported as `orphaned-relation-note`.
 */
function pushSwallowedRelationNoteIssues(frontmatter, issues) {
  const notes = frontmatter.relation_notes;
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return;

  // Where this node declared it connects to: every relation array entry plus the
  // inline `domain` parent. A note key must name one of these, and if something
  // was swallowed, one of these is inside a value.
  const declared = new Set();
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === 'relation_notes') continue;
    if (key === 'domain' && typeof value === 'string' && value.trim()) declared.add(value.trim());
    if (!Array.isArray(value)) continue;
    for (const item of value) if (typeof item === 'string' && item.trim()) declared.add(item.trim());
  }
  // A note may spell its target as the full slug while the array holds the tail
  // alias, or the other way round; both address one node.
  const isDeclared = (key) =>
    declared.has(key) ||
    [...declared].some((ref) => ref.endsWith(`/${key}`) || key.endsWith(`/${ref}`));

  // Slug-shaped targets only for the value test, so a short alias such as `b`
  // cannot match ordinary prose by accident.
  const targets = new Set([...declared].filter((ref) => ref.includes('/')));
  for (const key of Object.keys(notes)) targets.add(key);

  for (const [key, value] of Object.entries(notes)) {
    // The key side of the same accident (found 2026-08-30 in
    // `capabilities/acp-runtime.md`): an unquoted value containing a comma ends at
    // the comma, and the rest of the sentence plus the NEXT entry's slug become the
    // next KEY. The value test below cannot see it because the swallowed slug sits
    // in a key, not in a value. Any key that names no declared relation is a note
    // no edge can carry, so every reader silently drops the sentence.
    if (!isDeclared(key)) {
      issues.push({
        code: 'orphaned-relation-note',
        severity: 'error',
        message:
          `the relation_notes key \`${key}\` names no relation this node declares` +
          (declared.size > 0 ? ` (declared: ${[...declared].join(' · ')})` : '') +
          '. No edge carries this note, so every reader drops the sentence. ' +
          'If the key is a swallowed entry (an unquoted value ran past its comma), wrap that value in double quotes and split the entries; ' +
          'otherwise declare the relation or remove the note.',
      });
    }
    if (typeof value !== 'string') continue;
    const swallowed = [...targets].filter(
      (target) => target !== key && value.includes(`${target}: `),
    );
    if (swallowed.length === 0) continue;
    issues.push({
      code: 'swallowed-relation-note',
      severity: 'error',
      message:
        `the \`${key}\` value in relation_notes has swallowed other entries as text ` +
        `(${swallowed.join(' · ')}). The value is unquoted, so the separator was never read -- ` +
        'those entries have lost their rationale. Wrap the value in double quotes and split the entries.',
    });
  }
}

function pushFrontmatterDiagnostics(diagnostics, issues) {
  for (const diagnostic of diagnostics) {
    if (!diagnostic || diagnostic.code !== 'malformed-frontmatter-line') continue;
    issues.push({
      code: diagnostic.code,
      severity: 'error',
      message: diagnostic.message,
    });
  }
}

function pushUidIssues(frontmatter, issues) {
  const uid = frontmatter.uid;
  if (uid === undefined || uid === null || uid === '') {
    issues.push({
      code: 'missing-uid',
      severity: 'error',
      message: '`uid:` is missing: every ontology node carries a permanent lowercase UUIDv4 that never changes after it is minted.',
    });
    return;
  }
  const uidIssue = nodeUidIssue(uid);
  if (uidIssue) {
    issues.push({ code: 'invalid-uid', severity: 'error', message: uidIssue });
    return;
  }
  const merged = inspectMergedUids(uid, frontmatter.merged_uids);
  if (merged.invalidIssue) {
    issues.push({ code: 'invalid-merged-uids', severity: 'error', message: merged.invalidIssue });
  } else if (merged.nonCanonical) {
    issues.push({
      code: 'non-canonical-merged-uids',
      severity: 'warning',
      message: '`merged_uids:` must be an ascending, duplicate-free set of UUIDv4 values.',
    });
  }
}

function pushNonCanonicalGraphArrayIssues(frontmatter, issues) {
  for (const key of GRAPH_ARRAY_KEYS) {
    const value = frontmatter[key];
    if (!Array.isArray(value)) continue;
    const refs = value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim());
    const canonical = [...new Set(refs.filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
    if (
      refs.length !== canonical.length ||
      refs.some((item, index) => item !== canonical[index])
    ) {
      issues.push({
        code: 'non-canonical-graph-array',
        severity: 'warning',
        message: `\`${key}:\` is not a canonical set -- sorted and deduplicated. Writing it again through add_relation or patch_concept normalises it.`,
      });
    }
  }
}

/**
 * **A parent established by containment** — when another node contains this slug,
 * it has a parent in the tree.
 *
 * 2026-08-11, found walking the north-star journey: a vault created by
 * `init --quick-start` failed its own gate. There was a single warning
 * (`missing-expected-field: domain`), and that one warning turned `health`,
 * `mcp-verify`, and `agent-brief` red. But the warning's wording was *"a parent
 * can be found in the tree"*, and that vault's project node already held those
 * capabilities under `contains:` — **it said there was no parent when there was
 * one.** The gate sees one file at a time, so the narrowing happens at vault level.
 */
export function parentedSlugs(docs) {
  const parented = new Set();
  for (const doc of docs ?? []) {
    const frontmatter = doc?.frontmatter;
    if (!frontmatter || typeof frontmatter !== 'object') continue;
    for (const key of CONTAINMENT_KEYS) {
      const value = frontmatter[key];
      if (!Array.isArray(value)) continue;
      for (const ref of value) {
        if (typeof ref === 'string' && ref.trim()) parented.add(ref.trim());
      }
    }
  }
  return parented;
}

/** The keys through which containment establishes a parent — only the downward direction, a project or domain holding what is below it. */
const CONTAINMENT_KEYS = ['contains', 'capabilities', 'elements', 'domains'];

/**
 * Clears **only the missing-`domain:` warning** on a node that already has a parent.
 *
 * ⚠️ This **narrows** rather than removes — a node nothing contains keeps the
 * warning, and there the parent really is absent. Warnings with other codes and
 * expected fields other than `domain` are untouched: containment establishes a
 * parent, nothing more.
 */
export function suppressParentedExpectedFieldIssues(issuesBySlug, docs) {
  const parented = parentedSlugs(docs);
  if (parented.size === 0) return issuesBySlug;
  for (const [slug, issues] of issuesBySlug) {
    if (!parented.has(slug) || !Array.isArray(issues)) continue;
    const kept = issues.filter(
      (issue) => !(issue?.code === 'missing-expected-field' && /^`domain:`/.test(issue?.message ?? '')),
    );
    if (kept.length !== issues.length) issuesBySlug.set(slug, kept);
  }
  return issuesBySlug;
}
