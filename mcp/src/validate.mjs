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
        'frontmatter 시작 `---` 만 있고 끝 `---` 가 없습니다: 노드로 인식되지 않습니다.',
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
        'frontmatter 블록은 있지만 key 가 하나도 추출되지 않았습니다: 들여쓰기 또는 콜론 누락 의심.',
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
          'frontmatter 에 `kind:` 가 없습니다: graph 노드가 되려면 kind 가 필요합니다.',
      });
    }
  } else if (typeof rawKind !== 'string' || rawKind.trim() === '') {
    issues.push({
      code: 'empty-kind',
      severity: 'error',
      message: '`kind:` 값이 비어있습니다: graph 노드로 인식되지 않습니다.',
    });
  } else if (!KNOWN_VAULT_KINDS.includes(rawKind.trim())) {
    issues.push({
      code: 'unknown-kind',
      severity: 'warning',
      message: `\`kind: ${rawKind.trim()}\` 는 인식되지 않는 값입니다.`,
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
        message: `\`${key}:\` 가 비어있습니다: kind=${trimmedKind} 노드는 ${key} 가 있어야 트리에서 부모를 찾을 수 있습니다.`,
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
 */
function pushSwallowedRelationNoteIssues(frontmatter, issues) {
  const notes = frontmatter.relation_notes;
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return;

  // Where this node declared it connects to — if something was swallowed, one of these is inside a value.
  const targets = new Set();
  for (const value of Object.values(frontmatter)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) if (typeof item === 'string' && item.includes('/')) targets.add(item);
  }
  for (const key of Object.keys(notes)) targets.add(key);

  for (const [key, value] of Object.entries(notes)) {
    if (typeof value !== 'string') continue;
    const swallowed = [...targets].filter(
      (target) => target !== key && value.includes(`${target}: `),
    );
    if (swallowed.length === 0) continue;
    issues.push({
      code: 'swallowed-relation-note',
      severity: 'error',
      message:
        `relation_notes 의 \`${key}\` 값 안에 다른 항목이 글자로 들어가 있습니다 ` +
        `(${swallowed.join(' · ')}). 값에 따옴표가 없어 구분자가 안 읽힌 자국입니다 — ` +
        '그 항목들의 이유가 사라진 상태입니다. 값을 큰따옴표로 감싸고 항목을 나눠 주세요.',
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
      message: '`uid:`가 없습니다: 모든 ontology 노드는 생성 후 바뀌지 않는 lowercase UUIDv4 영구 식별자를 가져야 합니다.',
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
      message: '`merged_uids:`는 중복 없이 오름차순으로 정렬된 UUIDv4 set이어야 합니다.',
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
        message: `\`${key}:\` graph 배열이 정렬/중복제거된 canonical set 이 아닙니다: add_relation 또는 patch_concept 로 다시 저장하면 정리됩니다.`,
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
