/**
 * Input validation for the MCP tools. The title rule matches the
 * app's `src/views/ontology-edit/lib/is-untitled-title.ts`: non-empty after trimming,
 * so an agent cannot create untitled nodes.
 */

/**
 * A usable frontmatter `title`: a string that is non-empty after trimming.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isValidVaultTitle(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

import {
  boundaryFindings,
  definitionFinding,
  epistemicExclusionFinding,
  uncertaintyFinding,
} from './meaning-findings.mjs';
import { parseFrontmatter } from './parser.mjs';
import {
  folderForKind,
  inspectMergedUids,
  missingExpectedFields,
  nodeUidIssue,
} from './schema.mjs';
import { slugOutsideKindFolderMessage } from './construction-rules.mjs';

export const VAULT_ISSUE_CODE_VALUES = Object.freeze([
  'unclosed-frontmatter',
  'parse-zero-keys',
  'malformed-frontmatter-line',
  // An opening quote that never closes: the parser keeps it as literal text, so
  // the value renders wrong everywhere while nothing else fails.
  'malformed-quoted-scalar',
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
  // Two documents claiming one canonical slug; each file alone looks perfect.
  'duplicate-slug',
  'duplicate-uid',
  /*
   * The meaning findings the write door reports, so a person running validate
   * sees what the agent saw. Five are decided by one document's text
   * here; `folder-only-evidence` needs a repository root, so it is a whole-vault pass.
   * All warnings (construction rule 5).
   */
  'definition-missing',
  'boundary-missing',
  'epistemic-exclusion',
  'uncertainty-missing',
  'slug-outside-kind-folder',
  'folder-only-evidence',
  /*
   * Whole-vault only: needs a repository root, the cited file and the `path:` of
   * the node at the other end. A warning: a missing import is not proof of
   * independence.
   */
  'dependency-unwitnessed',
  /*
   * Whole-vault only, yet needs nothing but the vault, so it speaks even on a
   * freshly built, uncompiled vault.
   */
  'starter-example-node',
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
  // This one list drives both the canonical-sort and the dangling-reference
  // checks; the contract fixture pins `broader` in it.
  'broader',
];

/**
 * Detects silent corruption in vault frontmatter, reading the raw text so an
 * unclosed block and a zero-key parse are caught. Issue codes
 * match `src/shared/lib/validate-vault-document.ts`; a contract test blocks
 * drift. `slug-outside-kind-folder` needs `options.slug` (where the file sits), and a
 * caller holding only bytes cannot be told it.
 *
 * @param {string} raw
 * @param {{ slug?: string }} [options]
 * @returns {{ ok: boolean, issues: Array<{code: string, severity: 'error'|'warning', message: string}> }}
 */
export function validateVaultDocument(raw, options = {}) {
  const issues = [];
  // The parser's normalization: a BOM-prefixed or CRLF file must not skip every
  // check while the graph reads the same bytes as a live node.
  raw = String(raw).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
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

  const { frontmatter, body = '', diagnostics = [] } = parseFrontmatter(raw);
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
    // Expected-field advisory from schema.mjs, the dictionary UI, CLI and MCP share.
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
  pushMeaningIssues({ frontmatter, body, slug: resolveDocumentSlug(frontmatter, options), issues });

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
  };
}

/**
 * The slug this document is addressed by. The caller's value (the file's real
 * position) wins over frontmatter `slug:`, a claim that can be wrong; callers
 * holding only bytes fall back to the claim.
 */
function resolveDocumentSlug(frontmatter, options) {
  const given = typeof options?.slug === 'string' ? options.slug.trim() : '';
  if (given) return given;
  const declared = typeof frontmatter?.slug === 'string' ? frontmatter.slug.trim() : '';
  return declared;
}

/**
 * The body half, so validate_vault, `ontology-atlas validate` and the app's
 * queue report what the write door told the agent. The judgements are imported
 * from `meaning-findings.mjs`, never re-derived; all warnings (valid but
 * thin). `folder-only-evidence`, `dependency-unwitnessed` and `starter-example-node`
 * need a repository root or every other node, so they run as whole-vault passes
 * in validate_vault and the CLI.
 */
function pushMeaningIssues({ frontmatter, body, slug, issues }) {
  const kind = typeof frontmatter?.kind === 'string' ? frontmatter.kind.trim() : '';
  if (!kind || !KNOWN_VAULT_KINDS.includes(kind)) return;
  const title = typeof frontmatter?.title === 'string' ? frontmatter.title : '';
  const findings = [
    definitionFinding({ kind, slug, title, body }),
    ...boundaryFindings({ kind, slug, title, body }),
    uncertaintyFinding({ kind, slug, title, body }),
    epistemicExclusionFinding({ kind, slug, title, body }),
  ];
  for (const finding of findings) {
    if (!finding) continue;
    issues.push({ code: finding.code, severity: 'warning', message: finding.message });
  }
  pushSlugOutsideKindFolderIssue({ kind, slug, issues });
}

/**
 * A node written outside its kind folder. Silent without a known slug (guessing
 * would accuse every byte-only document) and for project and document, which
 * live at the root.
 */
function pushSlugOutsideKindFolderIssue({ kind, slug, issues }) {
  if (!slug) return;
  const folder = folderForKind(kind);
  if (!folder || slug.startsWith(folder)) return;
  issues.push({
    code: 'slug-outside-kind-folder',
    severity: 'warning',
    message: slugOutsideKindFolderMessage({
      slug,
      kind,
      canonicalSlug: `${folder}${slug}`,
    }),
  });
}

/**
 * Finds a relation note that swallowed the entries after it: an unquoted value
 * with an apostrophe opens a quote state and the following commas stop
 * separating, while the relation arrays stay intact and nothing else fails.
 * Value side: a note containing `target: ` for another target this node declares
 * is a swallowed entry (narrow; prose does not quote a neighbour's slug to the
 * colon). Key side: a comma ends an unquoted value early and turns the rest into
 * a pseudo-key naming no declared relation (`orphaned-relation-note`).
 */
function pushSwallowedRelationNoteIssues(frontmatter, issues) {
  const notes = frontmatter.relation_notes;
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return;

  // Every relation array entry plus the inline `domain` parent.
  const declared = new Set();
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === 'relation_notes') continue;
    if (key === 'domain' && typeof value === 'string' && value.trim()) declared.add(value.trim());
    if (!Array.isArray(value)) continue;
    for (const item of value) if (typeof item === 'string' && item.trim()) declared.add(item.trim());
  }
  // A note may spell its target as the full slug or the tail alias.
  const isDeclared = (key) =>
    declared.has(key) ||
    [...declared].some((ref) => ref.endsWith(`/${key}`) || key.endsWith(`/${ref}`));

  // Slug-shaped targets only, so a short alias such as `b` cannot match prose.
  const targets = new Set([...declared].filter((ref) => ref.includes('/')));
  for (const key of Object.keys(notes)) targets.add(key);

  for (const [key, value] of Object.entries(notes)) {
    // A note key naming no declared relation is carried by no edge, so every
    // reader drops its sentence.
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

/** Parser diagnostics that are vault issues: frontmatter the reader cannot honour, so errors. */
const SURFACED_DIAGNOSTIC_CODES = new Set([
  'malformed-frontmatter-line',
  'malformed-quoted-scalar',
]);

function pushFrontmatterDiagnostics(diagnostics, issues) {
  for (const diagnostic of diagnostics) {
    if (!diagnostic || !SURFACED_DIAGNOSTIC_CODES.has(diagnostic.code)) continue;
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
 * Slugs another node contains, which therefore have a tree parent. The per-file
 * check cannot see containment, so the missing-`domain:` warning is narrowed at
 * vault level; otherwise a `contains:` project fails its own health gate.
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

/** Downward containment keys: a project or domain holding what is below it. */
const CONTAINMENT_KEYS = ['contains', 'capabilities', 'elements', 'domains'];

/**
 * A `missing-kind` on a wiki page is the contract, not a defect: a page must carry
 * no `kind:` to stay off the map (`docs/DECISIONS.md`). Only that code, only in
 * that folder; `wiki-schema.mjs` judges the page's own contract.
 */
function isLibraryPageSlug(slug) {
  return typeof slug === 'string' && slug.startsWith('wiki/');
}

/** Drops `missing-kind` from wiki pages, where the absence is the rule. */
export function suppressLibraryKindIssues(issuesBySlug) {
  for (const [slug, issues] of issuesBySlug) {
    if (!isLibraryPageSlug(slug) || !Array.isArray(issues)) continue;
    const kept = issues.filter((issue) => issue?.code !== 'missing-kind');
    if (kept.length !== issues.length) issuesBySlug.set(slug, kept);
  }
  return issuesBySlug;
}

/**
 * Clears only the missing-`domain:` warning on a node that already has a parent.
 * A node nothing contains keeps it; other codes and other expected fields stay.
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
