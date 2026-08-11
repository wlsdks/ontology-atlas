// vault frontmatter validator — src/shared/lib/validate-vault-document.ts 와
// mcp/src/validate.mjs 와 같은 contract. cli 가 별도 publish 라 cross-import
// 불가능 → 자체 copy. drift 차단은 tests/contract/validate-vault-document.
// contract.test.ts 의 fixture 매트릭스 (3-way 강제).

import { parseFrontmatter } from './parse-frontmatter.mjs';
import { inspectMergedUids, missingExpectedFields, nodeUidIssue } from './schema.mjs';

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
  // `broader` (is_a / SKOS) — 공방과 함께 도입됐는데 이 리스트에서 빠져
  // 있었다(감사 2026-07-25). 이 리스트는 canonical 정렬 검사와 dangling ref
  // 검사를 **동시에** 구동하므로, 누락은 에이전트가 broader 에 오타 슬러그를
  // 써도 CI 는 green 을 뜻했다. contract fixture 가 이 drift 를 고정한다.
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
    return { ok: true, issues };
  }

  const { frontmatter } = parseFrontmatter(raw);
  const keys = Object.keys(frontmatter);

  if (keys.length === 0) {
    issues.push({
      code: 'parse-zero-keys',
      severity: 'warning',
      message:
        'frontmatter 블록은 있지만 key 가 하나도 추출되지 않았습니다: 들여쓰기 또는 콜론 누락 의심.',
    });
    return { ok: true, issues };
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
    // R14 — kind 별 expected 필드 (capability/element 의 domain) advisory.
    // mcp/src/validate.mjs 와 동일 schema 모듈 사용.
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

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
  };
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
