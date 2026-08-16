/**
 * MCP 도구 입력 validation helpers.
 *
 * UI 와 parity 유지: src/views/ontology-edit/lib/is-untitled-title.ts 의
 * Inspector 검증과 같은 룰 — 비-empty, trim 후 비-empty 강제. AI agent 가
 * silent pollution (untitled / blank-title 노드) 만들지 못하게.
 */

/**
 * vault frontmatter 의 title 으로 안전한 값인지 판정.
 * 비-string, undefined, null, 빈 문자열, 공백-only 모두 reject.
 *
 * 사용처: addConcept (필수 입력), patchConcept (frontmatter 에 title 포함 시).
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
 * R11 #23 — vault frontmatter silent corruption 검출. src/shared/lib/
 * validate-vault-document.ts 와 같은 issue codes 보장 (drift 시 contract
 * test 가 차단). raw 까지 보고 unclosed/parse-zero 검출.
 *
 * issue codes:
 *  - unclosed-frontmatter (error)
 *  - empty-kind (error)
 *  - missing-kind (warning)
 *  - unknown-kind (warning)
 *  - missing-expected-field (warning) — R14
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
  // 두 문서가 같은 canonical slug 를 주장하는 상태 (2026-07-29 실측).
  // 파일 단위 검사로는 원리적으로 못 잡는다 — 한 파일만 보면 완벽히 정상이다.
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

  if (!hasKindKey) {
    issues.push({
      code: 'missing-kind',
      severity: 'warning',
      message:
        'frontmatter 에 `kind:` 가 없습니다: graph 노드가 되려면 kind 가 필요합니다.',
    });
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
    // R14 — kind 별 expected 필드 누락 (capability/element 의 domain) advisory.
    // schema.mjs 가 single source — UI/CLI/MCP 셋이 같은 dict 사용.
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
 * **이유 하나가 다음 이유들을 통째로 삼킨 자국**을 찾는다.
 *
 * ## 왜 (2026-08-16 검수 — 우리 볼트에서 실제로 발견)
 *
 * `domains/agent-integration.md` 는 관계 이유를 셋 선언해 뒀는데 읽어 보면
 * **하나**였다. 나머지 둘이 첫 값 안으로 글자로 삼켜져 있었다:
 *
 * ```
 * capabilities/acp-runtime: "…permission gate., capabilities/skill-process-handoff: …"
 * ```
 *
 * 원인은 값 안의 **작은따옴표 한 개**(`user's`)였다. 값이 따옴표로 안 감싸여
 * 있으면 그 한 글자가 따옴표 상태를 열고, 그 뒤의 쉼표는 더 이상 구분자로
 * 안 읽힌다. 쓰는 쪽 규칙은 같은 날 고쳤지만(작은따옴표도 감싸게), **이미
 * 생긴 자국은 그대로 남는다.**
 *
 * 그리고 그때 `validate` 는 **`issue 0`** 이라고 답했다 — 관계 배열은 멀쩡해서
 * 그래프는 정상이고, 사라진 것은 이유뿐이라 아무 검사도 볼 것이 없었다.
 * 「왜 그렇게 이었는지」는 이 제품이 가장 중요하게 여기는 기록인데, 그것이
 * 조용히 사라지는 길이 열려 있었던 것이다.
 *
 * 판정: 어떤 이유 값 안에 **이 노드가 실제로 선언한 다른 관계 대상**이
 * `대상: ` 꼴로 들어 있으면, 그건 문장이 아니라 삼켜진 항목이다. 이 조건은
 * 좁다 — 우연히 자기 이웃의 슬러그를 콜론까지 붙여 인용하는 문장은 없다.
 */
function pushSwallowedRelationNoteIssues(frontmatter, issues) {
  const notes = frontmatter.relation_notes;
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return;

  // 이 노드가 어디로 이어져 있다고 선언했는지 — 삼켜졌다면 그중 하나가 값 안에 있다.
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
 * **포함이 세워 준 부모** — 다른 노드가 이 슬러그를 담고 있으면 트리에서 부모가 있다.
 *
 * 2026-08-11: 북극성 여정을 걸어 보다 나왔다. `init --quick-start` 가 만든 볼트가
 * 자기 검사기를 통과하지 못했는데, 경고는 하나(`missing-expected-field: domain`)였고
 * 그 하나가 `health` · `mcp-verify` · `agent-brief` 셋을 빨갛게 만들었다. 그런데 그
 * 경고의 문구가 *"트리에서 부모를 찾을 수 있습니다"* 이고, 정작 그 볼트의 프로젝트
 * 노드는 이미 `contains:` 로 그 역량들을 담고 있었다 — **부모가 있는데 없다고 말한
 * 것이다.** 검사기가 파일 하나만 보기 때문이고, 그래서 볼트 단위에서 좁힌다.
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

/** 포함이 부모를 세워 주는 키들 — 프로젝트/도메인이 아래를 담는 방향만 본다. */
const CONTAINMENT_KEYS = ['contains', 'capabilities', 'elements', 'domains'];

/**
 * 부모가 이미 있는 노드에서 **`domain:` 누락 경고만** 지운다.
 *
 * ⚠️ 없애는 것이 아니라 **좁히는 것**이다 — 아무도 안 담은 노드에는 그대로 남고,
 * 그때는 진짜로 부모가 없다. 다른 코드의 경고와 `domain` 이 아닌 기대 필드는
 * 건드리지 않는다(포함이 세워 주는 것은 부모뿐이다).
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
