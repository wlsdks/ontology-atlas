// vault helpers — 디렉토리 walking + .md 읽기/쓰기. 동기 fs 만 사용 (MCP
// tool 호출 빈도가 낮아 async 오버헤드 불필요).

import {
  accessSync,
  closeSync,
  constants as fsConstants,
  fsyncSync,
  openSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';

import { parseFrontmatter, buildMarkdown } from './parser.mjs';
import {
  NODE_ELIGIBILITY_GATE,
  flatSlugIssue,
  generateNodeUid,
  inspectMergedUids,
  nodeUidIssue,
} from './schema.mjs';
import {
  bulkProvenanceMessage,
  capabilityWithoutEvidenceMessage,
  danglingGraphReferenceMessage,
  denseParentActionMessage,
  looksLikeEvidencePath,
  looksLikePath,
  pathShapedReferenceMessage,
  pathShapedTitleMessage,
} from './construction-rules.mjs';
import { hasCapabilityImplementationEvidence } from './capability-evidence.mjs';

/**
 * 외부 변경 감지 (R11 #8). 사람 GUI · 외부 에디터 · 다른 AI MCP 가 같은 .md
 * 를 동시에 만질 때 silent overwrite 차단.
 *
 * 동작: caller 가 옵션으로 `expectedMtime` 을 넘기면 write 직전 현재 mtime 과
 * 비교. 다르면 ConflictError throw — caller 가 사용자에게 알리고 강행 여부
 * 결정. 옵션 미지정이면 검증 skip (회귀 회피 — 기존 호출자 호환).
 *
 * mtime 은 ms 정밀 정수. fs 파일시스템마다 정밀도가 다르지만 MCP 호출 빈도
 * 낮아 1s 단위 변경 감지로도 충분.
 */
export class VaultConflictError extends Error {
  constructor(slug, expectedMtime, currentMtime) {
    super(
      `Vault conflict: "${slug}" was modified externally between read and write. ` +
        `expectedMtime=${expectedMtime} currentMtime=${currentMtime}. ` +
        // **없는 복구법을 알려주지 않는다** (2026-07-29 실측).
        //
        // 종전 문구는 `force:true` 로 덮어쓰라고 했는데, 이 오류를 내는 여덟
        // 개 쓰기 도구 중 **일곱은 `force` 를 아예 선언하지 않는다** — 그대로
        // 시도하면 `unknown_argument` 다. 유일하게 `force` 를 받는
        // `delete_concept` 조차 그 뜻은 "백링크가 있어도 지운다" 이지 "mtime 을
        // 무시한다" 가 아니라, 역시 `vault_conflict` 로 되돌아온다.
        //
        // 즉 여덟 도구 전부에서 **안내된 복구 경로가 죽어 있었다.** 에이전트는
        // 그 말을 그대로 믿고 한 번 더 실패한다. 실제로 되는 길만 적는다.
        `Re-read the doc with get_concept to get the current expected_mtime, then retry the write.`,
    );
    this.name = 'VaultConflictError';
    this.code = 'VAULT_CONFLICT';
    this.slug = slug;
    this.expectedMtime = expectedMtime;
    this.currentMtime = currentMtime;
  }
}

/**
 * 파일 mtime (ms). 파일 없으면 null. caller 가 read-modify-write 흐름에서
 * read 직후 캡처해 후속 write 호출에 expectedMtime 으로 전달.
 */
export function getFileMtime(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * write 직전 mtime 검증. expected !== current 면 ConflictError throw.
 * expected 가 null/undefined 면 검증 skip.
 */
function assertMtime(slug, filePath, expectedMtime) {
  if (expectedMtime === null || expectedMtime === undefined) return;
  const current = getFileMtime(filePath);
  if (current === null) return; // 파일 자체가 없으면 후속 write 가 어차피 throw
  // mtime 비교는 1ms 미만 정밀도 차이를 무시 — 일부 fs 가 ms 미만 truncate.
  if (Math.abs(current - expectedMtime) >= 1) {
    throw new VaultConflictError(slug, expectedMtime, current);
  }
}

function assertPlainObject(value, name) {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${name} must be an object.`);
  }
}

function assertOptionalPlainObject(value, name) {
  if (value === undefined) return;
  assertPlainObject(value, name);
}

function assertBoundedNonNegativeInteger(value, name, { max }) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  if (value > max) {
    throw new Error(`${name} must be <= ${max}.`);
  }
}

/**
 * frontmatter 의 array 키 중 *그래프 엣지로 해석되는* 키. 새 edge 타입을
 * 추가하면 (e.g. 'aggregates', 'implements') 여기만 갱신하면 findOrphans /
 * findPath 등 모두 자동 cover. 예전에 두 함수가 각자 로컬로 같은 배열을
 * 들고 있어 drift 위험.
 */
const NEIGHBOR_KEYS = Object.freeze([
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'relates',
  'contains',
  'describes',
  'broader',
]);

const INLINE_NEIGHBOR_KEYS = Object.freeze(['domain']);
const NEIGHBOR_KEY_ALIASES = Object.freeze({
  depends_on: 'dependencies',
});
export const GRAPH_ARRAY_KEYS = Object.freeze([
  ...NEIGHBOR_KEYS,
  ...Object.keys(NEIGHBOR_KEY_ALIASES),
]);
const GRAPH_ARRAY_KEY_SET = new Set(GRAPH_ARRAY_KEYS);

/**
 * Graph relation arrays should be stable on disk. Agent writes can arrive in
 * different orders, but the same edge set should serialize the same way.
 */
export function normalizeRelationRefs(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const refs = [];
  const passthrough = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      passthrough.push(value);
      continue;
    }
    const ref = value.trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
  }
  refs.sort((a, b) => a.localeCompare(b, 'en'));
  return [...refs, ...passthrough];
}

function normalizeFrontmatterValue(key, value) {
  if (GRAPH_ARRAY_KEY_SET.has(key) && Array.isArray(value)) {
    return normalizeRelationRefs(value);
  }
  return value;
}

export function collectNeighborRefs(doc) {
  const refs = [];
  const seen = new Set();
  const pushRef = (key, ref) => {
    if (typeof ref !== 'string') return;
    const trimmed = ref.trim();
    if (!trimmed) return;
    const canonicalKey = NEIGHBOR_KEY_ALIASES[key] || key;
    const seenKey = `${canonicalKey}\0${trimmed}`;
    if (seen.has(seenKey)) return;
    seen.add(seenKey);
    refs.push({ key: canonicalKey, ref: trimmed });
  };
  for (const key of NEIGHBOR_KEYS) {
    const value = doc.frontmatter[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) {
      pushRef(key, ref);
    }
  }
  for (const key of Object.keys(NEIGHBOR_KEY_ALIASES)) {
    const value = doc.frontmatter[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) {
      pushRef(key, ref);
    }
  }
  for (const key of INLINE_NEIGHBOR_KEYS) {
    pushRef(key, doc.frontmatter[key]);
  }
  return refs;
}

/**
 * `ref` 를 **관계 키에서 이름으로 부르는 문서들**을 찾는다.
 *
 * 왜 필요한가 (2026-07-26 실측) — 웹 지도는 개념을 289개 보여주는데 컴파일된
 * 그래프의 노드는 96개다. 차이 193개는 *문서가 아직 없고 다른 문서의 관계
 * 키에만 이름이 적힌 개념*이다. 지도에서 그 이름을 베껴 `get_concept` 을
 * 부르면 종전에는 `Doc not found` 로 끝났다 — 볼트가 그 이름을 **알고 있는데도**
 * 모른다고 답한 셈이라, 사용자는 화면의 숫자를 믿을 수 없게 된다.
 *
 * 이 함수는 노드를 만들어내지 않는다(그래프 census 는 그대로 96이다). "이
 * 이름을 볼트의 어느 문서가 어떤 키로 적어 두었는가" 라는 사실만 돌려주고,
 * 호출자가 그 사실을 오류 대신 답으로 바꾼다.
 */
export function findGraphReferences(docs, ref) {
  const target = String(ref ?? '').trim();
  if (!target) return [];
  const hits = [];
  for (const doc of docs ?? []) {
    if (doc.slug === target) continue;
    for (const { key, ref: candidate } of collectNeighborRefs(doc)) {
      if (candidate !== target) continue;
      hits.push({ slug: doc.slug, via: key });
      break;
    }
  }
  return hits.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * body 에서 *prose 한 단락* 만 뽑아 excerpt 로. AI agent 가 get_concept 응답
 * 에서 받는 body 미리보기를 markdown 표 / 코드블록 syntax 가 아니라 *사람이
 * 의도해서 쓴 첫 설명문* 으로 받게 한다.
 *
 * 알고리즘 (단순 line-based):
 *   1. 빈 줄 / heading / 코드블록 / 표 / 이미지 / 구분선 / 리스트 / 인용은 skip.
 *   2. 첫 nonempty line 이 prose 면 (= 위 block 아님) 그 paragraph 끝
 *      (다음 빈 줄 또는 block 시작) 까지 모음.
 *   3. 어떤 prose 도 못 찾으면 fallback — body.slice(0, maxLen).
 *   4. cap maxLen (기본 800자) — 넘치면 trim + '…'.
 *
 * NEIGHBOR_KEYS 같은 graph schema 와 무관 — 단순 문자열 추출 helper.
 * 단위 테스트 가능 (export).
 */
export function extractSummaryExcerpt(body, maxLen = 800) {
  if (typeof body !== 'string' || body.length === 0) return '';
  const lines = body.split('\n');
  const isBlockStart = (line) => {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    if (trimmed.startsWith('```')) return true; // 코드블록
    if (trimmed.startsWith('|')) return true; // 표
    if (trimmed.startsWith('#')) return true; // heading
    if (trimmed.startsWith('![')) return true; // 이미지
    if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) return true; // thematic break
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return true; // 리스트
    if (/^\d+[.)]\s+/.test(trimmed)) return true; // ordered list
    if (trimmed.startsWith('> ')) return true; // 인용
    return false;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || isBlockStart(line)) {
      // 코드블록 안쪽도 통째로 skip — 다음 ``` 찾기
      if (trimmed.startsWith('```')) {
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith('```')) i += 1;
      }
      i += 1;
      continue;
    }
    // prose 단락 시작 — 다음 빈 줄 또는 block 시작 까지 모음
    const para = [];
    while (i < lines.length) {
      const cur = lines[i];
      if (cur.trim() === '' || isBlockStart(cur)) break;
      para.push(cur.trim());
      i += 1;
    }
    if (para.length > 0) {
      const text = para.join(' ');
      return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text;
    }
  }
  // prose 한 줄도 못 찾음 — 원본 fallback
  const trimmedBody = body.trim();
  return trimmedBody.length > maxLen
    ? trimmedBody.slice(0, maxLen).trimEnd() + '…'
    : trimmedBody;
}

/**
 * `body: 'full'` 이 한 번에 돌려주는 최대 글자 수.
 *
 * 왜 상한이 있나 — vault 안의 `.md` 는 사용자 디스크의 아무 파일이고, 붙여넣은
 * 로그 하나가 수백 KB 일 수 있다. 그런 문서 하나가 에이전트의 컨텍스트를
 * 통째로 먹는 것을 막는다. 실측한 볼트들의 본문은 1–3 KB 라 이 상한에 닿는
 * 문서는 사실상 없고, 닿으면 {@link describeBodyDelivery} 가 잘렸다고 말한다.
 */
export const FULL_BODY_MAX_CHARS = 40_000;

/**
 * `get_concepts({ body: "full" })` 한 호출의 selector 상한.
 *
 * 전체 본문은 행당 페이로드가 커서 일반 batch 50개보다 좁다. 의미 수선처럼
 * 실행 가능한 read workflow를 만드는 코드도 같은 값을 사용해야, 서버가 거절할
 * 호출을 handoff에 내보내지 않는다.
 */
export const GET_CONCEPTS_FULL_BODY_MAX = 20;

/**
 * **본문을 얼마나 돌려줬고 무엇을 안 돌려줬는지**를 같이 실어 보낸다.
 *
 * ## 왜 이게 따로 있나 (2026-08-01 실측)
 *
 * 볼트만 넘겨받은 에이전트가 이렇게 답했다 — *"MCP `get_concept` 은 본문을
 * 발췌로만 돌려줍니다. 각 노드 본문에 더 많은 코드 증거가 적혀 있을 수 있는데,
 * 그 부분은 이번 읽기 범위에서 확인하지 못했습니다."* 구축 규격은 근거·확신도·
 * 포함/제외를 **본문에 적으라고 시키는데**, 읽기 도구는 첫 단락만 돌려주고
 * **잘렸다는 말을 하지 않았다.** 무엇이 남았는지 모르면 다시 요청할 수도 없다 —
 * 그래서 쓴 글의 절반이 도달 불가였다.
 *
 * 그래서 이 helper 의 계약은 두 줄이다:
 *
 * 1. 잘렸으면 `truncated: true` 와 **안 준 글자 수**를 말한다.
 * 2. 잘렸을 때만 `hint` 에 **나머지를 받는 정확한 호출**을 적는다. 안 잘렸으면
 *    `hint` 자체가 없다 — 멀쩡한 응답에 페이로드를 붙이지 않는다.
 *
 * @param {string} body 원본 markdown 본문
 * @param {object} [options]
 * @param {'excerpt'|'full'} [options.mode] 기본 `'excerpt'`
 * @param {number} [options.maxLen] excerpt 상한 (기본 800)
 * @param {string} [options.hint] 잘렸을 때 붙일 후속 호출 안내
 * @returns {{ text: string, info: { mode: string, totalChars: number, returnedChars: number, truncated: boolean, omittedChars?: number, hint?: string } }}
 */
export function describeBodyDelivery(body, options = {}) {
  const { mode = 'excerpt', maxLen = 800, hint } = options;
  const source = typeof body === 'string' ? body : '';
  const totalChars = source.length;
  let text;
  if (mode === 'full') {
    text =
      totalChars > FULL_BODY_MAX_CHARS
        ? source.slice(0, FULL_BODY_MAX_CHARS)
        : source;
  } else {
    text = extractSummaryExcerpt(source, maxLen);
  }
  // 발췌는 줄을 공백으로 이어 붙이므로 **글자 수 비교로는 판정할 수 없다** —
  // 줄바꿈 하나 차이로 멀쩡히 다 실은 본문이 "잘렸다" 가 된다. 그래서 공백을
  // 정규화한 뒤 비교한다: 표·코드블록·둘째 단락을 건너뛴 경우만 잘린 것이고,
  // 한 단락짜리 본문을 통째로 실었으면 잘리지 않은 것이다.
  const returnedChars = text.length;
  const flatten = (value) => value.replace(/\s+/g, ' ').trim();
  const truncated =
    mode === 'full'
      ? totalChars > FULL_BODY_MAX_CHARS
      : flatten(text) !== flatten(source);
  const info = { mode, totalChars, returnedChars, truncated };
  if (truncated) {
    info.omittedChars = Math.max(0, totalChars - returnedChars);
    if (hint) info.hint = hint;
  }
  return { text, info };
}

/**
 * vault root 안의 모든 `.md` 파일 walk. dotfile / node_modules 등 제외.
 * 반환: 각 파일의 절대 경로.
 */
export function walkMd(rootPath) {
  const out = [];
  const stack = [rootPath];
  const SKIP_DIRS = new Set([
    'node_modules',
    '.next',
    '.git',
    'out',
    'build',
    'dist',
    '.serena',
  ]);
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(join(dir, entry.name));
      } else if (entry.name.endsWith('.md')) {
        out.push(join(dir, entry.name));
      }
    }
  }
  return out;
}

/**
 * file path → vault-relative slug (`projects/foo.md` → `projects/foo`).
 */
/**
 * 파일 경로 → vault-relative slug.
 *
 * **NFC 로 정규화한다** (2026-07-29 실측). macOS 는 파일 이름의 한글을 NFD
 * (자모 분해)로 넘겨주는 경로가 흔한데(HFS+ 복사본, 압축 해제, 비-macOS
 * 툴체인이 만든 zip), 사용자가 프론트매터에 타이핑하는 값은 NFC 다. 두
 * 문자열은 **글자가 완전히 같은데 바이트가 다르다.**
 *
 * 그래서 종전에는 이런 일이 났다:
 *
 *   validate: `한글` 가 vault 의 어떤 node 로도 resolve 되지 않습니다
 *   list:     domain  한글  NFD file        ← 바로 다음 줄에 그 노드가 있다
 *
 * 컴파일러도 같이 실패해서 그 노드로 들어오는 엣지가 `resolved: false` 로
 * 떨어졌다 — **한글 이름 노드가 관계를 잃는다**, 이 제품의 주 플랫폼에서.
 * 눈으로는 구별할 수 없으니 사용자가 고칠 수도 없다.
 *
 * 정규화는 **식별자에만** 한다. 디스크 경로는 손대지 않는다 — 파일은 NFD
 * 그대로 있고 그걸로 읽는다.
 */
export function pathToSlug(rootPath, filePath) {
  const rel = relative(rootPath, filePath).replace(/\\/g, '/');
  return rel.replace(/\.md$/, '').normalize('NFC');
}

/**
 * vault-relative slug → file path (확장자 자동 부착).
 *
 * 보안: AI agent / prompt injection 으로 악의적인 slug
 * (\`../../etc/passwd\` 등) 가 들어와도 vault root 바깥의 파일을
 * 가리키지 못하도록 normalize 후 root 포함 검사. 위반 시 throw —
 * 호출자 (writeDoc / readDoc / patchFrontmatter / updateDoc /
 * deleteDoc) 가 모두 실패하므로 vault 외부 read/write 모두 차단.
 */
export function slugToPath(rootPath, slug) {
  if (typeof slug !== 'string' || slug.length === 0) {
    throw new Error('slug must be a non-empty string');
  }
  // null byte injection 차단 — Node fs API 가 일부 환경에서 truncate 됨.
  if (slug.includes('\0')) {
    throw new Error('slug must not contain a null byte');
  }
  const candidate = resolve(rootPath, `${slug}.md`);
  const normalizedRoot = resolve(rootPath);
  // candidate 가 rootPath 의 prefix 와 sep 로 이어지는지 확인.
  // 정확히 normalizedRoot 자체이거나, normalizedRoot + sep 로 시작해야.
  if (
    candidate !== normalizedRoot &&
    !candidate.startsWith(normalizedRoot + sep)
  ) {
    throw new Error(`slug points outside the vault root: "${slug}"`);
  }
  // **문자열 검사만으로는 심볼릭 링크를 못 막는다** (2026-07-29 실측).
  //
  // 위 검사는 slug 를 `resolve()` 한 **경로 문자열**이 root 안에 있는지만 본다.
  // 그런데 vault 안의 `escape.md` 가 vault 밖 파일을 가리키는 링크면, 문자열은
  // 완벽히 root 안이고 `writeFileSync` 는 링크를 따라 **밖에 쓴다.** 실측:
  // `relate escape real --vault /tmp/sym/vault` 가 `/tmp/sym/outside.md` 를
  // 고치고는 `wrote /tmp/sym/vault/escape.md` 라고 보고했다 — 사용자는 자기
  // 편집을 그 경로에서 찾을 수 없다.
  //
  // 이 함수의 주석이 스스로 *"AI agent / prompt injection 으로 악의적인 slug 가
  // vault root 바깥의 파일을 가리키지 못하도록"* 이라고 적어 둔 바로 그 위협이,
  // slug 가 아니라 **파일시스템 쪽에서** 열려 있었다.
  //
  // 존재하는 경로만 realpath 한다 — 새 파일 생성(아직 없는 경로)은 정상이고,
  // 그 부모 디렉터리는 아래에서 함께 확인한다.
  assertRealPathInside(candidate, normalizedRoot, slug);
  return candidate;
}

/**
 * 실제 경로(심볼릭 링크 해소 후)가 여전히 vault 안인지. 파일이 아직 없으면
 * 가장 가까운 **존재하는 조상**을 기준으로 본다 — 링크된 디렉터리 안에 새
 * 파일을 만드는 경로도 같은 탈출이기 때문이다.
 */
function assertRealPathInside(candidate, normalizedRoot, slug) {
  let realRoot;
  try {
    realRoot = realpathSync(normalizedRoot);
  } catch {
    // root 자체를 해소할 수 없으면 문자열 검사까지가 우리가 할 수 있는 전부다.
    return;
  }
  let probe = candidate;
  for (;;) {
    try {
      const real = realpathSync(probe);
      if (real !== realRoot && !real.startsWith(realRoot + sep)) {
        throw new Error(
          `slug resolves outside the vault root through a symlink: "${slug}"`,
        );
      }
      return;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('slug resolves outside')) throw error;
      const parent = dirname(probe);
      // 루트까지 올라갔는데도 존재하는 조상이 없다 — 더 볼 것이 없다.
      if (parent === probe) return;
      probe = parent;
    }
  }
}

/**
 * vault 안에 주어진 slug 의 .md 파일이 실재하는지. add_relation 같은
 * AI agent 입력 검증에 사용 — typo / hallucinated slug 가 frontmatter
 * array 에 dangling reference 로 silently 추가되는 걸 차단.
 *
 * slug 자체가 잘못된 형태 (빈 문자열 / null byte / vault 외부) 면 false
 * 반환 (slugToPath 가 throw 하는 대신 — caller 가 boolean 만 보고
 * 분기 가능). 진짜 fs 오류는 caller 가 후속 read 에서 자연스럽게 잡음.
 */
export function vaultSlugExists(rootPath, slug) {
  if (typeof slug !== 'string' || slug.length === 0) return false;
  let candidate;
  try {
    candidate = slugToPath(rootPath, slug);
  } catch {
    return false;
  }
  return existsSync(candidate);
}

/**
 * 한 .md 파일을 읽어 { slug, frontmatter, body, raw, mtime }.
 *
 * mtime: read 시점의 파일 mtimeMs. caller 가 후속 write 의 `expectedMtime`
 * 으로 전달해 conflict 감지 가능 (R11 #8).
 */
export function readDoc(rootPath, filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const { frontmatter, body, diagnostics } = parseFrontmatter(raw);
  const result = {
    slug: pathToSlug(rootPath, filePath),
    frontmatter,
    body,
    raw,
    mtime: getFileMtime(filePath),
  };
  if (diagnostics?.length) result.diagnostics = diagnostics;
  return result;
}

/**
 * vault 의 모든 doc 을 manifest 형태로 로드. 호출자가 필요한 필터를 직접
 * 적용한다. 큰 vault 에서는 무겁지만 MCP 호출 빈도가 낮아 OK.
 */
export function loadVaultDocs(rootPath) {
  const files = walkMd(rootPath);
  return files.map((path) => readDoc(rootPath, path));
}

/**
 * vault 에서 badSlug 와 비슷한 slug 후보를 반환 — AI agent 가 오타 / 접두 누락
 * 으로 not-found 를 받았을 때 다음 액션 후보를 제시.
 *
 * 매칭 단계 (먼저 hit 되는 게 우선):
 *  1. tail 정확 일치 — `auth` 입력 → `capabilities/auth`, `domains/auth` 등.
 *  2. tail substring 양방향 — `auth` ⊂ `auth-platform`, `oauth` ⊃ `auth`.
 *  3. tail prefix — 사용자가 일부만 친 경우.
 *
 * 자기 자신 (badSlug) 은 후보에서 제외. limit (기본 3) 까지 반환.
 *
 * 가벼운 substring 비교만 — Levenshtein 같은 distance 는 큰 vault 에서
 * 비싸고 false positive 도 많다. 이 helper 는 "did you mean" 을 만드는
 * 게 목표가 아니라 "이런 slug 들이 vault 에 있어요" 를 1 호출에 보여주는 게 목표.
 */
export function suggestSimilarSlugs(rootPath, badSlug, limit = 3) {
  if (typeof badSlug !== 'string' || badSlug.length === 0) return [];
  const docs = loadVaultDocs(rootPath);
  const all = docs.map((d) => d.slug).filter((s) => s !== badSlug);
  const tail = badSlug.split('/').pop() || badSlug;
  const lowerTail = tail.toLowerCase();
  const lowerBad = badSlug.toLowerCase();
  const tier1 = []; // exact tail match
  const tier2 = []; // substring (either direction)
  const tier3 = []; // prefix match on tail or full slug
  for (const slug of all) {
    const candTail = (slug.split('/').pop() || slug).toLowerCase();
    if (candTail === lowerTail) {
      tier1.push(slug);
      continue;
    }
    if (
      candTail.includes(lowerTail)
      || lowerTail.includes(candTail)
      || slug.toLowerCase().includes(lowerBad)
    ) {
      tier2.push(slug);
      continue;
    }
    if (candTail.startsWith(lowerTail) || slug.toLowerCase().startsWith(lowerBad)) {
      tier3.push(slug);
    }
  }
  return [...tier1, ...tier2, ...tier3].slice(0, limit);
}

/**
 * AI agent 가 not-found / dup 에러를 받을 때 다음 액션을 곧바로 결정할 수
 * 있도록 actionable suffix 를 만든다. caller 는 에러 메시지에 이 결과를 붙임.
 */
function notFoundSuffix(rootPath, slug) {
  const suggestions = suggestSimilarSlugs(rootPath, slug);
  const lines = [
    `Use list_concepts() to see all slugs, or find_evidence({title:${JSON.stringify(slug)}}) to search by title.`,
  ];
  if (suggestions.length > 0) {
    lines.push(`Similar slugs in this vault: ${suggestions.map((s) => `"${s}"`).join(', ')}.`);
  }
  return lines.join(' ');
}

/* ------------------------------------------------------------------------- *
 * Node-eligibility gate (2026-07-31 council — `docs/DECISIONS.md`)
 *
 * This is the **logic canon** of the ontology construction spec. Values live in
 * `schema.mjs`, wording in `construction-rules.mjs`, and the judgement lives
 * here because here is the only place all three write doors meet.
 *
 * That last part is the whole reason the gate exists at all. The measured defect
 * was 92 `elements:` entries on one capability, 92 of which resolved to nothing
 * — and they did not arrive through `add_concept`, which is where every existing
 * warning lived. They accumulated through `patch_concept`, and `add_relation` is
 * a third door again. Guidance aimed at the creation path never met the growth
 * path. So the gate sits below all three, in `commitDoc`, and no door can opt out
 * by construction rather than by discipline.
 *
 * What it does NOT do:
 *
 *   - It never blocks a write. Every finding is advisory, following the
 *     `missing-expected-field` precedent. A rejection would strand an agent
 *     mid-batch with half a graph written and no way forward, and agents route
 *     around tools that punish them.
 *   - It never enforces a child count. There is no cap here in any form,
 *     per-kind or otherwise — a number a model can be told to stay under is a
 *     number it satisfies with two empty buckets named "Group A" and "Group B".
 * ------------------------------------------------------------------------- */

/**
 * Session state. Two jobs, both of which need memory the compiled vault cannot
 * have: *how often we have already spoken* about a node, and *what this machine
 * created in this run* (provenance — a static scan cannot distinguish five nodes
 * a person wrote over a week from five one batch emitted).
 */
const GATE = {
  findings: [],
  /** `slug\0code\0key` → the count we last spoke about. */
  noticed: new Map(),
  /** parent ref → slugs created under it during this session. */
  createdUnderParent: new Map(),
  /** parent ref → the sibling count we last spoke about. */
  noticedBulk: new Map(),
  /**
   * parent slug → child refs this session's writes ADDED to its graph arrays.
   *
   * The other provenance map watches children declaring a parent; this one
   * watches a parent's own list growing, which is the direction the 92 actually
   * came from (`patch_concept` on `elements:`, never a child announcing itself).
   */
  parentGrewBy: new Map(),
  /** Lazy slug index: { rootPath, names: Set<string> }. */
  index: null,
};

/** Test seam, and the reset a long-lived server would need if the vault root moved. */
export function resetNodeEligibilityGate() {
  GATE.findings = [];
  GATE.noticed.clear();
  GATE.createdUnderParent.clear();
  GATE.noticedBulk.clear();
  GATE.parentGrewBy.clear();
  GATE.index = null;
}

/**
 * Take the findings produced since the last drain, and clear them.
 *
 * Destructive on purpose: the caller turns them into one `postWriteMaintenance`
 * payload per tool response, and a finding delivered twice is a finding the
 * reader starts filtering.
 */
export function drainNodeEligibilityFindings() {
  const findings = GATE.findings;
  GATE.findings = [];
  return findings;
}

/**
 * Every name the vault answers to: canonical slugs, their tails, and frontmatter
 * `slug:` aliases — the same three the MCP resolver accepts, so the gate cannot
 * call "unresolved" something `get_concept` would happily return.
 */
function buildGateIndex(rootPath) {
  const names = new Set();
  for (const doc of loadVaultDocs(rootPath)) {
    names.add(doc.slug);
    const tail = doc.slug.split('/').pop();
    if (tail) names.add(tail);
    const fmSlug = doc.frontmatter?.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim()) names.add(fmSlug.trim());
  }
  return { rootPath, names };
}

function gateIndex(rootPath, { rebuild = false } = {}) {
  if (rebuild || !GATE.index || GATE.index.rootPath !== rootPath) {
    GATE.index = buildGateIndex(rootPath);
  }
  return GATE.index;
}

/**
 * Resolve a reference against the vault, paying for a full scan only when the
 * cheap answer would be bad news.
 *
 * The index is a cache, and a cache can be stale in exactly one direction that
 * matters: a doc written by a human editor or another agent since we built it
 * would look missing. So a miss is never trusted — it triggers one rebuild and a
 * re-check. A clean vault therefore costs one scan per session; a dirty one
 * costs one scan per warning, which is the write nobody minds paying for.
 */
function gateResolves(rootPath, ref) {
  const name = String(ref).normalize('NFC');
  if (gateIndex(rootPath).names.has(name)) return true;
  return gateIndex(rootPath, { rebuild: true }).names.has(name);
}

/** Keep the cache warm across a batch instead of rebuilding on every row. */
function noteGateWrite(rootPath, slug) {
  if (!GATE.index || GATE.index.rootPath !== rootPath) return;
  GATE.index.names.add(slug);
  const tail = slug.split('/').pop();
  if (tail) GATE.index.names.add(tail);
}

/**
 * Speak on the first crossing, then only when the count crosses a new multiple.
 *
 * The council left the firing frequency open and this is the resolution default:
 * a channel that repeats itself on every write is the channel
 * `missing-expected-field` became — technically present, actually invisible.
 */
function shouldNotice(ledger, key, count, { threshold, multiple }) {
  if (count < threshold) return false;
  const last = ledger.get(key) ?? 0;
  if (last === 0) {
    ledger.set(key, count);
    return true;
  }
  if (Math.floor(count / multiple) > Math.floor(last / multiple)) {
    ledger.set(key, count);
    return true;
  }
  if (count > last) ledger.set(key, count);
  return false;
}

const {
  NOTICE_THRESHOLD,
  NOTICE_REPEAT_MULTIPLE,
  BULK_PROVENANCE_SIBLING_TRIGGER,
  REFERENCE_SAMPLE_LIMIT,
  BOOTSTRAP_FANOUT_TRIGGER,
  MIN_PARENTS_FOR_LIVE_PERCENTILE,
  DENSE_PARENT_RESOLUTION_FLOOR,
} = NODE_ELIGIBILITY_GATE;

/**
 * Which containment array makes a node a parent, per kind.
 *
 * Only two entries, and the absence of `project → domain` is deliberate: a vault
 * has a handful of projects at most, so any percentile over that sample is
 * describing nothing, and a constant invented for it would be the guess the
 * amendment's research exists to avoid.
 */
const DENSE_PARENT_RELATIONS = Object.freeze({
  domain: Object.freeze({ key: 'capabilities', childKind: 'capability', bootstrap: 'domain_to_capability' }),
  capability: Object.freeze({ key: 'elements', childKind: 'element', bootstrap: 'capability_to_element' }),
});

/** Nearest-rank p90: no interpolation, so the answer is always an observed count. */
function percentile90(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(0.9 * sorted.length) - 1)];
}

/**
 * What counts as "wide" for this kind of parent, and where that number came from.
 *
 * The vault's own p90 wins as soon as there are enough parents of the kind for a
 * percentile to describe anything real; below that the researched starting range
 * stands in. Reporting the basis alongside the number is not decoration — a
 * bootstrap constant printed as "your vault's p90" would dress a shipped default
 * as a measurement of the reader's own data.
 *
 * Costs a full vault scan, so it is computed only after the caller has already
 * decided this parent is worth a sentence.
 */
function siblingFanoutTrigger(rootPath, parentKind) {
  const relation = DENSE_PARENT_RELATIONS[parentKind];
  const counts = [];
  for (const doc of loadVaultDocs(rootPath)) {
    if (doc.frontmatter?.kind !== parentKind) continue;
    const refs = doc.frontmatter[relation.key];
    counts.push(
      Array.isArray(refs) ? refs.filter((ref) => gateResolves(rootPath, ref)).length : 0,
    );
  }
  if (counts.length < MIN_PARENTS_FOR_LIVE_PERCENTILE) {
    return { trigger: BOOTSTRAP_FANOUT_TRIGGER[relation.bootstrap], basis: 'bootstrap' };
  }
  return { trigger: percentile90(counts), basis: 'vault-p90' };
}

/**
 * Did a machine fill this parent during this session?
 *
 * Two shapes of the same fact, because children arrive from both directions:
 * `createdUnderParent` sees a batch of children each declaring `domain:`, while
 * `parentGrewBy` sees one parent's own array growing through repeated writes —
 * which is the direction the measured 92 actually came from.
 */
function machineFilledParent(slug) {
  if (GATE.noticedBulk.has(slug)) return true;
  return (GATE.parentGrewBy.get(slug)?.size ?? 0) >= BULK_PROVENANCE_SIBLING_TRIGGER;
}

function pushRefFinding(slug, code, key, refs, message) {
  const noticeKey = `${slug}\0${code}\0${key}`;
  if (!shouldNotice(GATE.noticed, noticeKey, refs.length, {
    threshold: NOTICE_THRESHOLD,
    multiple: NOTICE_REPEAT_MULTIPLE,
  })) {
    return;
  }
  GATE.findings.push({
    code,
    slug,
    key,
    refs,
    count: refs.length,
    message: message({ slug, key, refs, count: refs.length, sampleLimit: REFERENCE_SAMPLE_LIMIT }),
  });
}

/**
 * The gate. Runs on the committed frontmatter, after the file is on disk —
 * observing, never gating, which is what "warn, don't reject" means mechanically.
 *
 * @param {string} rootPath
 * @param {string} slug
 * @param {Record<string, unknown>} frontmatter
 * @param {{ created?: boolean }} [options] `created` marks a brand-new node, the
 *   only case where bulk provenance means anything.
 */
function runNodeEligibilityGate(rootPath, slug, frontmatter, { created = false } = {}) {
  if (!frontmatter || typeof frontmatter !== 'object') return;

  // ⓪ A capability born with no evidence. Creation only — the honest sequence is
  //    "name the behavior, attach the file", so a node that lacks evidence on a
  //    LATER write is not yet wrong and does not deserve a repeated accusation.
  //    `maintenance_plan` carries the durable version of the question.
  if (created && frontmatter.kind === 'capability') {
    const elements = Array.isArray(frontmatter.elements) ? frontmatter.elements : [];
    const hasEvidence = hasCapabilityImplementationEvidence({
      path: frontmatter.path,
      hasElementsEdge: elements.some((ref) => gateResolves(rootPath, ref)),
    });
    if (!hasEvidence) {
      GATE.findings.push({
        code: 'capability-without-evidence',
        slug,
        key: 'path',
        refs: [],
        count: 1,
        message: capabilityWithoutEvidenceMessage({ slug }),
      });
    }
  }

  // ① A path in the title slot. An element names a role ("jwt-token"), not a
  //    location — a title that is a path means the author described evidence.
  const title = frontmatter.title;
  if (looksLikePath(title)) {
    if (shouldNotice(GATE.noticed, `${slug}\0path-shaped-title\0title`, 1, {
      threshold: NOTICE_THRESHOLD,
      multiple: NOTICE_REPEAT_MULTIPLE,
    })) {
      GATE.findings.push({
        code: 'path-shaped-title',
        slug,
        key: 'title',
        refs: [String(title)],
        count: 1,
        message: pathShapedTitleMessage(String(title)),
      });
    }
  }

  // ② Reference resolution. This is the check the vault-wide validator has and
  //    the write path did not — and note the validator *exempts* path-shaped
  //    `elements:` entries outright, which is precisely why 92 of them were
  //    invisible to `validate_vault` while sitting in the graph. Here nothing is
  //    exempt; the path shape only chooses which repair the message names first.
  const evidenceByKey = new Map();
  const danglingByKey = new Map();
  let totalRefs = 0;
  let resolvedRefs = 0;
  for (const { key, ref } of collectNeighborRefs({ frontmatter })) {
    totalRefs += 1;
    if (gateResolves(rootPath, ref)) {
      resolvedRefs += 1;
      continue;
    }
    const bucket = looksLikeEvidencePath(ref) ? evidenceByKey : danglingByKey;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(ref);
  }
  for (const [key, refs] of evidenceByKey) {
    pushRefFinding(slug, 'path-shaped-reference', key, refs, pathShapedReferenceMessage);
  }
  for (const [key, refs] of danglingByKey) {
    pushRefFinding(slug, 'dangling-graph-reference', key, refs, danglingGraphReferenceMessage);
  }

  // ③ Dense parent. The one check with a number attached, so it is also the one
  //    that could quietly become the fan-out cap the council threw out. Two
  //    guards keep it from doing that.
  //
  //    First, it only ever fires when something ELSE is already wrong: the
  //    parent's references are mostly broken, or a machine filled it in this
  //    session. A wide parent whose children all resolve and were added by hand
  //    is never mentioned — schema.org's `CreativeWork` has 67 direct subtypes
  //    and is not sick, and this vault's own `topology-kind-legibility` (7
  //    elements, all resolving) must stay silent. That precondition runs BEFORE
  //    the percentile so the healthy case never even pays for the scan.
  //
  //    Second, unresolved strings are not counted as children. Counting them
  //    would make the very defect this gate exists to name look like healthy
  //    growth.
  const relation = DENSE_PARENT_RELATIONS[frontmatter.kind];
  if (relation) {
    const childRefs = Array.isArray(frontmatter[relation.key]) ? frontmatter[relation.key] : [];
    const resolvedChildren = childRefs.filter((ref) => gateResolves(rootPath, ref));
    const resolutionRate = totalRefs === 0 ? 1 : resolvedRefs / totalRefs;
    const brokenParent = resolutionRate < DENSE_PARENT_RESOLUTION_FLOOR;
    const machineFilled = machineFilledParent(slug);
    if (resolvedChildren.length > 0 && (brokenParent || machineFilled)) {
      const { trigger, basis } = siblingFanoutTrigger(rootPath, frontmatter.kind);
      if (shouldNotice(GATE.noticed, `${slug}\0dense-parent\0${relation.key}`, resolvedChildren.length, {
        threshold: trigger + 1, // "above the trigger", not "at" it
        multiple: NOTICE_REPEAT_MULTIPLE,
      })) {
        GATE.findings.push({
          code: 'dense-parent',
          slug,
          key: relation.key,
          refs: resolvedChildren,
          count: resolvedChildren.length,
          trigger,
          basis,
          message: denseParentActionMessage({
            parentSlug: slug,
            count: resolvedChildren.length,
            childKind: relation.childKind,
            trigger,
            basis,
            evidence: brokenParent
              ? `only ${Math.round(resolutionRate * 100)}% of this node's graph references resolve to real nodes`
              : 'a single session filled this parent, so its children share a provenance rather than a reason',
          }),
        });
      }
    }
  }

  // ④ Bulk provenance. Not a size limit — a statement about *who* made these and
  //    *when*. Only the write path can know that, which is the entire argument
  //    for putting this check here rather than in the compiled maintenance plan.
  if (!created) return;
  const parent = typeof frontmatter.domain === 'string' ? frontmatter.domain.trim() : '';
  if (!parent) return;
  const siblings = GATE.createdUnderParent.get(parent) ?? [];
  if (!siblings.includes(slug)) siblings.push(slug);
  GATE.createdUnderParent.set(parent, siblings);
  if (shouldNotice(GATE.noticedBulk, parent, siblings.length, {
    threshold: BULK_PROVENANCE_SIBLING_TRIGGER,
    multiple: BULK_PROVENANCE_SIBLING_TRIGGER,
  })) {
    GATE.findings.push({
      code: 'bulk-provenance',
      slug,
      parent,
      count: siblings.length,
      refs: siblings.slice(),
      message: bulkProvenanceMessage({
        parent,
        count: siblings.length,
        slugs: siblings,
        sampleLimit: REFERENCE_SAMPLE_LIMIT,
      }),
    });
  }
}

/**
 * **The single write point.** `writeDoc`, `patchFrontmatter`, and `updateDoc`
 * all serialize here — so `add_concept`, `add_relation`, and `patch_concept`
 * inherit the gate whether or not their author remembered it existed.
 *
 * `mcp/src/write-path-gate.test.mjs` fails if a door starts writing bytes
 * somewhere else.
 */
function commitDoc(rootPath, slug, filePath, frontmatter, body, { created = false, previousFrontmatter } = {}) {
  writeFileAtomically(filePath, buildMarkdown({ frontmatter, body }));
  if (created) noteGateWrite(rootPath, slug);
  noteParentGrowth(slug, previousFrontmatter, frontmatter);
  runNodeEligibilityGate(rootPath, slug, frontmatter, { created });
  return filePath;
}

function identityClaims(frontmatter) {
  const primary = typeof frontmatter?.uid === 'string' ? frontmatter.uid : '';
  const merged = Array.isArray(frontmatter?.merged_uids) ? frontmatter.merged_uids : [];
  return [...new Set([primary, ...merged].filter(Boolean))];
}

function assertNodeIdentity(rootPath, slug, frontmatter) {
  const kind = frontmatter?.kind;
  if (typeof kind !== 'string' || !kind.trim()) return;
  const uidIssue = nodeUidIssue(frontmatter.uid);
  if (uidIssue) throw new Error(uidIssue);
  const merged = inspectMergedUids(frontmatter.uid, frontmatter.merged_uids);
  if (merged.invalidIssue) throw new Error(merged.invalidIssue);
  if (merged.nonCanonical) {
    throw new Error('`merged_uids:` must be a deduplicated, ascending canonical UUIDv4 set.');
  }
  const claims = new Set(identityClaims(frontmatter));
  for (const doc of loadVaultDocs(rootPath)) {
    if (doc.slug === slug) continue;
    for (const claimed of identityClaims(doc.frontmatter)) {
      if (!claims.has(claimed)) continue;
      throw new Error(
        `UID collision: ${claimed} already belongs to "${doc.slug}". ` +
          'Create a new node with a fresh UID, or use merge_concepts to absorb an existing identity.',
      );
    }
  }
}

/**
 * 손으로 쓴 노드에 **신원이 아직 없는가**. 있으면 불변, 없으면 채울 자리다.
 *
 * 사람이 옵시디언·vim·GitHub 웹에서 노드를 직접 적으면 `uid:` 가 없다.
 * 이 저장소는 「마크다운을 그냥 손으로 쓰면 된다」고 약속하므로 그 상태는
 * 정상적인 입력이다 — 다만 그대로 두면 컴파일이 신원 오류에서 멈춰
 * **볼트 전체의 그래프 명령이 죽는다**(overview·health·agent-brief·
 * query_ontology).
 */
function hasSettledUid(frontmatter) {
  return typeof frontmatter?.uid === 'string' && frontmatter.uid.trim() !== '';
}

/**
 * ⚠️ **불변성은 「있던 값을 바꾸는 것」에만 적용된다** (2026-08-08).
 *
 * 종전엔 «없던 값을 처음 채우는 것»도 같은 문장으로 막았고, 그 결과 Atlas MCP
 * 만 붙은 에이전트에게 **손으로 쓴 노드를 고칠 문이 하나도 없었다**:
 *
 * | 시도 | 종전 응답 |
 * |---|---|
 * | `patch_concept(uid 없이 다른 필드)` | "`uid:` 는 UUIDv4 여야 한다" |
 * | `patch_concept({uid: 새 값})` | "`uid:` 는 불변이다" |
 * | `add_concept(같은 슬러그)` | "이미 있다. patch 를 써라" |
 *
 * 셋이 서로를 가리키며 닫혀 있었다(2026-08-08 실측 재현). 바꿀 값이 없으면
 * 바꾸는 것이 아니다. 남의 신원을 가져오는 위험은 이 함수가 아니라
 * `assertNodeIdentity` 의 충돌 검사가 이미 따로 막는다 — 그래서 여기를 열어도
 * 신원 도용은 여전히 불가능하다.
 */
function assertIdentityPatch(previousFrontmatter, patch) {
  if (!patch) return;
  if ('uid' in patch && patch.uid !== undefined && patch.uid !== previousFrontmatter.uid) {
    if (hasSettledUid(previousFrontmatter)) {
      throw new Error('`uid:` is immutable. Rename or reclassify the node without changing its UID.');
    }
  }
  if ('uid' in patch && patch.uid === null && hasSettledUid(previousFrontmatter)) {
    throw new Error('`uid:` is immutable. Rename or reclassify the node without changing its UID.');
  }
  if ('merged_uids' in patch) {
    throw new Error('`merged_uids:` is merge_concepts-owned identity history and cannot be edited by a generic patch.');
  }
}

/**
 * 신원이 없는 노드를 고치려 할 때 **그 쓰기가 신원을 채워 준다**.
 *
 * 채우는 주체가 쓰기라는 것이 이 저장소의 규약 그대로다(「writer-minted
 * immutable UUIDv4」). 손으로 쓴 노드에는 아직 minter 가 없었을 뿐이고, 처음
 * 손대는 쓰기가 그 자리를 맡는다.
 *
 * **조용히 하지 않는다** — 채운 값을 반환에 실어 호출자가 사람에게 말할 수
 * 있게 한다. 신원이 생기는 것은 사람이 알아야 하는 사건이다.
 */
function fillMissingUid(previousFrontmatter, nextFrontmatter) {
  const kind = nextFrontmatter?.kind;
  if (typeof kind !== 'string' || !kind.trim()) return null;
  if (hasSettledUid(previousFrontmatter)) return null;
  if (hasSettledUid(nextFrontmatter)) return nextFrontmatter.uid;
  const minted = generateNodeUid();
  nextFrontmatter.uid = minted;
  return minted;
}

/**
 * Record which child refs THIS write added to a parent's graph arrays.
 *
 * Provenance the vault cannot reconstruct afterwards: on disk, a child added by
 * a person over a week and one appended by a loop look identical. The diff is
 * only visible in the moment of writing, which is the same argument that put the
 * whole gate here rather than in the compiled plan.
 */
function noteParentGrowth(slug, previousFrontmatter, nextFrontmatter) {
  if (!previousFrontmatter) return;
  for (const key of GRAPH_ARRAY_KEYS) {
    const next = nextFrontmatter?.[key];
    if (!Array.isArray(next)) continue;
    const before = new Set(Array.isArray(previousFrontmatter[key]) ? previousFrontmatter[key] : []);
    for (const ref of next) {
      if (typeof ref !== 'string' || before.has(ref)) continue;
      const added = GATE.parentGrewBy.get(slug) ?? new Set();
      added.add(ref);
      GATE.parentGrewBy.set(slug, added);
    }
  }
}

/**
 * 새 doc 작성. 디렉토리 자동 생성. 기존 파일 있으면 throw (덮어쓰기 의도라면
 * 호출자가 명시적으로).
 */
export function writeDoc(rootPath, slug, { frontmatter, body = '' }) {
  const filePath = slugToPath(rootPath, slug);
  if (existsSync(filePath)) {
    throw new Error(
      `Doc already exists at "${slug}". To update fields, use patch_concept(slug, frontmatter, body, expected_mtime). To rename, use rename_concept(oldSlug, newSlug). Never delete-then-add: that loses backlinks.`,
    );
  }
  assertPlainObject(frontmatter, 'frontmatter');
  if (typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
  // 슬러그 평면성 — 새 정체성이 태어나는 유일한 문에서 잰다. 형태 유효성이라
  // hard error (팬아웃 게이트의 「막지 않는다」 원칙은 의미 판단에만 적용).
  const slugIssue = flatSlugIssue(frontmatter?.kind, slug);
  if (slugIssue) throw new Error(slugIssue);
  assertNodeIdentity(rootPath, slug, frontmatter);
  mkdirSync(dirname(filePath), { recursive: true });
  return commitDoc(rootPath, slug, filePath, frontmatter, body, { created: true });
}

/**
 * patchFrontmatter / updateDoc / deleteDoc / redirectBacklinks 의 옵션 형태:
 *   { expectedMtime?: number }
 *
 * caller 가 read 시점 mtime 을 전달하면 write 직전 mtime 변경 감지 → conflict
 * throw. 미지정이면 검증 skip (기존 호출자 호환).
 */

/**
 * doc 영구 삭제. 호출자가 confirmation / backlinks 검사를 책임진다.
 * 반환: 삭제 직전 캡처한 { slug, filePath, frontmatter, body, raw, mtime }.
 * 파일 없으면 throw. expectedMtime 옵션으로 외부 변경 감지 가능.
 */
export function deleteDoc(rootPath, slug, options = {}) {
  const filePath = slugToPath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: "${slug}". ${notFoundSuffix(rootPath, slug)}`);
  }
  assertMtime(slug, filePath, options.expectedMtime);
  const captured = readDoc(rootPath, filePath);
  unlinkSync(filePath);
  return { ...captured, filePath };
}

/**
 * 기존 doc 의 frontmatter 만 patch. body 보존. patch 객체의 null 은 키
 * 삭제, undefined 는 skip. options.expectedMtime 으로 외부 변경 감지.
 *
 * 반환: `{ filePath, frontmatter, mintedUid }`. `mintedUid` 는 **이 쓰기가
 * 신원을 처음 채웠을 때만** 값이 있다(손으로 쓴 노드의 복구) — 호출자는 그
 * 사실을 사람에게 말해야 한다. 신원이 생기는 것은 조용히 지나갈 사건이 아니다.
 */
export function patchFrontmatter(rootPath, slug, patch, options = {}) {
  const filePath = slugToPath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: "${slug}". ${notFoundSuffix(rootPath, slug)}`);
  }
  assertPlainObject(patch, 'frontmatter');
  assertMtime(slug, filePath, options.expectedMtime);
  const raw = readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);
  assertIdentityPatch(frontmatter, patch);
  const next = { ...frontmatter };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else if (value !== undefined) {
      next[key] = normalizeFrontmatterValue(key, value);
    }
  }
  const mintedUid = fillMissingUid(frontmatter, next);
  assertNodeIdentity(rootPath, slug, next);
  commitDoc(rootPath, slug, filePath, next, body, { previousFrontmatter: frontmatter });
  return { filePath, frontmatter: next, mintedUid };
}

/**
 * 기존 doc 의 frontmatter + body 를 동시에 갱신. frontmatter 는 patchFrontmatter
 * 와 동일한 patch 의미 (null = 삭제, undefined = skip). body 가 string 이면
 * 교체, undefined 면 보존. expectedMtime 옵션으로 외부 변경 감지.
 *
 * 반환 계약은 `patchFrontmatter` 와 같다 — `{ filePath, frontmatter, mintedUid }`.
 */
export function updateDoc(rootPath, slug, { frontmatter: patch, body, expectedMtime }) {
  const filePath = slugToPath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: "${slug}". ${notFoundSuffix(rootPath, slug)}`);
  }
  assertOptionalPlainObject(patch, 'frontmatter');
  assertMtime(slug, filePath, expectedMtime);
  const raw = readFileSync(filePath, 'utf-8');
  const { frontmatter, body: oldBody } = parseFrontmatter(raw);
  assertIdentityPatch(frontmatter, patch);
  const nextFm = { ...frontmatter };
  if (patch !== undefined) {
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete nextFm[key];
      } else if (value !== undefined) {
        nextFm[key] = normalizeFrontmatterValue(key, value);
      }
    }
  }
  if (body !== undefined && typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
  const nextBody = body === undefined ? oldBody : body;
  const mintedUid = fillMissingUid(frontmatter, nextFm);
  assertNodeIdentity(rootPath, slug, nextFm);
  commitDoc(rootPath, slug, filePath, nextFm, nextBody, { previousFrontmatter: frontmatter });
  return { filePath, frontmatter: nextFm, mintedUid };
}

/**
 * vault 의 kind 분포 통계 (T31). 각 kind 별 노드 수 + 전체 수.
 * AI agent 가 "이 vault 에 capability 가 몇 개?" 같은 census 질문에
 * O(1) 응답 가능 (load → 1 pass count).
 */
export function listKinds(rootPath) {
  const docs = loadVaultDocs(rootPath);
  const byKind = {};
  let total = 0;
  const documentedNames = new Set();
  for (const doc of docs) {
    const kind = doc.frontmatter.kind;
    documentedNames.add(doc.slug);
    const tail = doc.slug.split('/').pop();
    if (tail) documentedNames.add(tail);
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim()) documentedNames.add(fmSlug.trim());
    if (typeof kind !== 'string' || !kind) continue;
    byKind[kind] = (byKind[kind] || 0) + 1;
    total += 1;
  }
  // 문서 없이 관계 키에서 이름만 불린 개념. 화면(지도·인사이트)은 이것들도
  // 개념으로 세므로, 이 수를 같이 내지 않으면 `total` 하나만 보고 "화면이
  // 부풀렸다" 고 오해하게 된다. kind 별 census 에는 넣지 않는다 — 이것들은
  // kind 를 선언한 적이 없다.
  const referencedOnly = new Set();
  for (const doc of docs) {
    for (const { ref } of collectNeighborRefs(doc)) {
      if (!documentedNames.has(ref)) referencedOnly.add(ref);
    }
  }
  return {
    total,
    byKind,
    referencedOnlyTotal: referencedOnly.size,
    conceptsIncludingReferenced: total + referencedOnly.size,
  };
}

/**
 * vault 의 orphan 노드 찾기 — 다른 어느 노드도 frontmatter graph 키
 * (domains/capabilities/elements/dependencies/relates/contains/describes/domain)
 * 에서 가리키지 않는 doc. 매칭 정책은 findBacklinks 와 동일 (절대 slug
 * 또는 마지막 segment).
 *
 * 옵션:
 *   - kind: 특정 kind 만 대상
 *   - excludeKinds: 이 kind 들은 결과에서 제외 (기본 ['project', 'vault-readme'])
 *
 * 사용 시나리오: AI agent 가 "이 vault 의 고립 노드 정리하자" / 사용자가
 * "내가 만든 노드 중 안 쓰이는 거 뭐냐" 점검.
 */
export function findOrphans(rootPath, options = {}) {
  const docs = loadVaultDocs(rootPath);
  const kindFilter = typeof options.kind === 'string' ? options.kind : null;
  const excludeKinds = new Set(
    Array.isArray(options.excludeKinds)
      ? options.excludeKinds
      : ['project', 'vault-readme'],
  );
  const slugs = new Set(docs.map((d) => d.slug));
  const tailToFull = new Map();
  const frontmatterSlugToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split('/').pop();
    if (tail && tail !== slug && !tailToFull.has(tail)) {
      tailToFull.set(tail, slug);
    }
  }
  for (const doc of docs) {
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() && !frontmatterSlugToFull.has(fmSlug)) {
      frontmatterSlugToFull.set(fmSlug, doc.slug);
    }
  }
  const referenced = new Set();
  for (const doc of docs) {
    for (const { ref } of collectNeighborRefs(doc)) {
      if (typeof ref !== 'string') continue;
      if (slugs.has(ref)) {
        if (ref !== doc.slug) referenced.add(ref);
        continue;
      }
      if (frontmatterSlugToFull.has(ref)) {
        const resolved = frontmatterSlugToFull.get(ref);
        if (resolved && resolved !== doc.slug) referenced.add(resolved);
        continue;
      }
      if (tailToFull.has(ref)) {
        const resolved = tailToFull.get(ref);
        if (resolved && resolved !== doc.slug) referenced.add(resolved);
        continue;
      }
      for (const slug of slugs) {
        if (slug.endsWith(`/${ref}`) && slug !== doc.slug) {
          referenced.add(slug);
          break;
        }
      }
    }
  }
  const orphans = [];
  for (const doc of docs) {
    const kind = doc.frontmatter.kind;
    if (typeof kind !== 'string' || !kind) continue;
    if (excludeKinds.has(kind)) continue;
    if (kindFilter && kind !== kindFilter) continue;
    if (referenced.has(doc.slug)) continue;
    orphans.push({
      uid: doc.frontmatter.uid,
      slug: doc.slug,
      kind,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
      // R+ — list_concepts / find_backlinks 와 동일 shape. agent 가 orphans
      // 받자마자 "특정 도메인 orphan 만 / 최근 변경된 orphan 만" sort/filter
      // 가능 — 후속 get_concept 없이.
      domain: doc.frontmatter.domain,
      mtime: doc.mtime,
    });
  }
  return { total: orphans.length, orphans };
}

/**
 * 두 slug 사이 그래프 최단 경로 (T30, BFS). edge 는 frontmatter graph
 * 키 (domains, capabilities, elements, dependencies, relates, contains,
 * describes, domain) 의 항목 + 양방향 (backlink) 으로 구성된 무방향 그래프.
 *
 * 항목 string 이 절대 slug 또는 slug 의 마지막 segment 둘 다 매칭
 * 가능하도록 — findBacklinks 와 같은 정책.
 *
 * 경로 못 찾으면 null. maxHops (기본 5) 초과면 cutoff.
 */
export function findPath(rootPath, fromSlug, toSlug, maxHops = 5) {
  assertBoundedNonNegativeInteger(maxHops, 'maxHops', { max: 20 });
  const docs = loadVaultDocs(rootPath);
  const slugs = new Set(docs.map((d) => d.slug));
  // 마지막 segment 와 frontmatter slug 는 alias 로. project.md 가
  // `slug: ontology-atlas` 같은 user-facing slug 를 갖는 dogfood vault 에서
  // file slug 와 frontmatter slug 가 달라도 같은 노드로 탐색한다.
  const tailToFull = new Map();
  const frontmatterSlugToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split('/').pop();
    if (tail && tail !== slug && !tailToFull.has(tail)) {
      tailToFull.set(tail, slug);
    }
  }
  for (const doc of docs) {
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() && !frontmatterSlugToFull.has(fmSlug)) {
      frontmatterSlugToFull.set(fmSlug, doc.slug);
    }
  }
  function resolveRef(ref) {
    if (typeof ref !== 'string') return null;
    if (slugs.has(ref)) return ref;
    if (frontmatterSlugToFull.has(ref)) return frontmatterSlugToFull.get(ref);
    if (tailToFull.has(ref)) return tailToFull.get(ref);
    for (const slug of slugs) {
      if (slug.endsWith(`/${ref}`)) return slug;
    }
    return null;
  }
  const resolvedFrom = resolveRef(fromSlug);
  const resolvedTo = resolveRef(toSlug);
  // 두 끝점이 vault 에 모두 존재해야 의미 있는 응답. 동일 slug 도 vault 안에
  // 있을 때만 trivial path 반환 — 존재하지 않는 slug 에 대해 fake path 를
  // 만들지 않도록 (이전 회귀: from===to 인 가짜 slug 도 hops:[slug] 반환했음).
  if (!resolvedFrom || !resolvedTo) return null;
  if (resolvedFrom === resolvedTo) return { from: fromSlug, to: toSlug, hops: [resolvedFrom], edges: [] };
  // adjacency: 무방향, 각 edge 는 frontmatter `via` 키 (domains / capabilities /
  // elements / dependencies / relates / contains / describes / domain) 를 기록한다. 한 doc 가
  // 같은 neighbor 를 여러 키에서 참조하면 *첫 키* 를 기억 (가장 구체적인 의미를
  // 잃지 않게 NEIGHBOR_KEYS 순서가 domains → describes 로 의미적 specificity 약화).
  // AI agent 가 path 를 받았을 때 "왜 이 두 노드가 연결됐는지" 한 hop 단위로
  // 표현 가능 — 단순 slug 시퀀스보다 mental model 전달력 ↑.
  const adj = new Map();
  function addEdge(a, b, via) {
    if (!adj.has(a)) adj.set(a, new Map());
    if (!adj.has(b)) adj.set(b, new Map());
    if (!adj.get(a).has(b)) adj.get(a).set(b, via);
    if (!adj.get(b).has(a)) adj.get(b).set(a, via);
  }
  for (const doc of docs) {
    for (const { key, ref } of collectNeighborRefs(doc)) {
      const resolved = resolveRef(ref);
      if (resolved && resolved !== doc.slug) {
        addEdge(doc.slug, resolved, key);
      }
    }
  }
  // BFS — depth 를 큐에 같이 들고 다녀서 매 dequeue 시 parent 체인을 거꾸로
  // 거슬러 올라가는 O(D) 작업 회피. 큐도 head index 로 운용해 Array.shift()
  // 의 O(V) 비용 제거 (큰 vault 에서 의미 있음).
  const queue = [{ node: resolvedFrom, depth: 0 }];
  const visited = new Set([resolvedFrom]);
  const parent = new Map();
  const parentVia = new Map();
  let head = 0;
  while (head < queue.length) {
    const { node: cur, depth } = queue[head++];
    if (depth >= maxHops) continue;
    const neighbors = adj.get(cur) || new Map();
    for (const [n, via] of neighbors) {
      if (visited.has(n)) continue;
      visited.add(n);
      parent.set(n, cur);
      parentVia.set(n, via);
      if (n === resolvedTo) {
        // Path reconstruction: push to end + reverse 한 번 (O(D)). 이전엔 매
        // step 마다 \`hops.unshift(p)\` 라 O(D²) — maxHops 가 작아도 안티패턴.
        // edges[] 는 hops i ↔ i+1 사이 'via' (frontmatter key) 를 노출.
        const hops = [n];
        const edges = [];
        let p = n;
        while (parent.has(p)) {
          const prev = parent.get(p);
          edges.unshift({ from: prev, to: p, via: parentVia.get(p) });
          p = prev;
          hops.push(p);
        }
        hops.reverse();
        return { from: fromSlug, to: toSlug, hops, edges };
      }
      queue.push({ node: n, depth: depth + 1 });
    }
  }
  return null;
}

/**
 * 어느 vault doc 이 `targetSlug` 를 가리키는지 스캔. frontmatter 의 array
 * 키 (capabilities, elements, dependencies, relates, contains, describes)
 * 와 body 의 wikilink/markdown link 까지 본다.
 */
export function findBacklinks(rootPath, targetSlug) {
  const docs = loadVaultDocs(rootPath);
  const resolveRef = buildRefResolver(docs);
  const resolvedTarget = resolveRef(targetSlug) || targetSlug;
  const matches = [];
  // Graph frontmatter 는 collectNeighborRefs 기준으로 읽는다. 그래야
  // depends_on 같은 legacy key 도 canonical dependencies edge 로 보이고,
  // targetSlug 가 frontmatter slug alias 여도 같은 노드를 찾는다.
  const requestedTail = targetSlug.split('/').pop();
  const resolvedTail = resolvedTarget.split('/').pop();
  const bodyNeedles = new Set([
    targetSlug,
    resolvedTarget,
    requestedTail,
    resolvedTail,
  ].filter(Boolean));
  for (const doc of docs) {
    if (doc.slug === resolvedTarget) continue;
    const matchedKeys = [];
    for (const { key, ref } of collectNeighborRefs(doc)) {
      const resolved = resolveRef(ref);
      if (resolved !== resolvedTarget) continue;
      if (!matchedKeys.includes(key)) matchedKeys.push(key);
    }
    const bodyHit = [...bodyNeedles].some(
      (needle) =>
        doc.body.includes(`[[${needle}]]`) ||
        doc.body.includes(`(${needle}.md)`) ||
        doc.body.includes(`/${needle}.md`),
    );
    if (matchedKeys.length === 0 && !bodyHit) continue;
    matches.push({
      uid: doc.frontmatter.uid,
      slug: doc.slug,
      kind: doc.frontmatter.kind,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
      // R+ — agent 가 backlinks 받자마자 "어느 도메인 / 언제 변경" 파악 가능.
      // list_concepts 와 동일 shape 유지 — 같은 mental model 의 두 view 가
      // 같은 필드 노출하면 agent 가 일관 처리.
      domain: doc.frontmatter.domain,
      mtime: doc.mtime,
      matchedKeys: matchedKeys.length > 0 ? matchedKeys : undefined,
      matchedInBody: bodyHit || undefined,
    });
  }
  return matches;
}

function buildRefResolver(docs) {
  const slugs = new Set(docs.map((d) => d.slug));
  const tailToFull = new Map();
  const ambiguousTails = new Set();
  const frontmatterSlugToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split('/').pop();
    if (!tail || tail === slug || ambiguousTails.has(tail)) continue;
    if (tailToFull.has(tail)) {
      tailToFull.delete(tail);
      ambiguousTails.add(tail);
      continue;
    }
    tailToFull.set(tail, slug);
  }
  for (const doc of docs) {
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() && !frontmatterSlugToFull.has(fmSlug)) {
      frontmatterSlugToFull.set(fmSlug, doc.slug);
    }
  }
  return (ref) => {
    if (typeof ref !== 'string') return null;
    if (slugs.has(ref)) return ref;
    if (frontmatterSlugToFull.has(ref)) return frontmatterSlugToFull.get(ref);
    if (ambiguousTails.has(ref)) return null;
    if (tailToFull.has(ref)) return tailToFull.get(ref);
    for (const slug of slugs) {
      if (slug.endsWith(`/${ref}`)) return slug;
    }
    return null;
  };
}

/**
 * 볼트 다중 파일 쓰기를 **전부 아니면 전무**로 적용한다.
 *
 * ## 왜 필요했나 — 「atomic」이 거짓이었다
 *
 * `rename_concept` 의 도구 설명은 *"update every backlink in one atomic
 * graph-level operation"* 이라고 말하고 `AGENTS.md` 도 *"atomically rewrites
 * every backlink"* 라고 적었다. 실제로는 `redirectBacklinks` 가 루프 안에서
 * 파일마다 즉시 썼고, 중간에 한 파일이 안 써지면 **반쪽 볼트**가 남았다
 * (2026-08-01 실측: 참조 3개 중 하나를 `chmod 444` → 새 파일 생성됨 · 옛 파일
 * 안 지워짐 → **제목이 같은 노드 둘**, 참조 2개는 새 이름 1개는 옛 이름).
 *
 * 가장 나쁜 것은 그 다음이다 — 그 볼트에 `validate` 는 *"issue 0 ✓"*,
 * `health` 는 *"vault_validation pass"* 라고 답했다. **분열된 그래프가 검사
 * 둘을 다 통과한다.** 사용자의 디스크가 진실원이라는 이 제품의 전제 위에서
 * 그건 가장 비싼 종류의 조용한 실패다.
 *
 * ## 무엇을 보장하고 무엇을 안 하나
 *
 * 보장: **프로세스가 살아 있는 한** 어떤 I/O 실패(EACCES · EROFS · ENOSPC ·
 * 편집기 잠금 · 동기화 클라이언트가 만든 읽기 전용 파일)에서도 볼트는 시작
 * 상태로 돌아간다. 두 단계다 — ① 아무것도 쓰기 전에 **전 대상의 쓰기 권한을
 * 미리 확인**하고, ② 그래도 실패하면 이미 쓴 것을 원본 바이트로 되돌린다.
 *
 * 안 하는 것: **크래시·전원 손실 안전성.** 그건 저널이나 `rename(2)` 기반
 * 커밋이 필요하고, 볼트가 git 저장소라는 이 제품의 회복 경로(스냅샷 → diff →
 * revert)와 중복된다. 그래서 여기서는 정직하게 선을 긋는다 — 이 함수의
 * 이름은 `applyAllOrNothing` 이지 `applyAtomically` 가 아니다.
 *
 * 되돌리기마저 실패하면(그 자체가 I/O 실패다) **숨기지 않는다** — 에러가
 * 어느 파일이 어느 상태로 남았는지 나열한다. 모른다고 말하는 것이
 * 괜찮다고 말하는 것보다 낫다.
 *
 * @param {Array<{op:'write'|'delete', path:string, content?:string}>} plan
 * @returns {{applied:number}}
 */
/**
 * 파일 하나를 **끊기지 않게** 쓴다 — 임시 파일에 쓰고, 디스크에 확정하고, 이름을 바꾼다.
 *
 * ## 왜 (2026-08-16 검수)
 *
 * 종전에는 `writeFileSync` 하나였다. 그건 원본을 **먼저 비우고** 쓴다. 그
 * 사이에 프로세스가 죽거나 디스크가 차면 사용자의 마크다운이 **잘린 채로**
 * 남는다 — 그리고 그 파일은 방금 우리가 열어 준 그 폴더의 것이다.
 *
 * ⚠️ 이 저장소에는 안전한 쓰기가 **이미 있었다**(`cli/src/lib/agent-config.mjs`
 * 의 `writeTextAtomically`). 그런데 쓰는 곳이 `.mcp.json` 과 `config.toml`
 * 뿐이었다 — **설정 파일은 지키고 사용자 데이터는 안 지키는** 모양이었다.
 *
 * 이름 바꾸기(rename)는 같은 파일 시스템 안에서 원자적이다. 그래서 어느
 * 순간에 죽어도 파일은 **옛 내용 아니면 새 내용**이지, 반쪽이 되지 않는다.
 */
export function writeFileAtomically(filePath, text) {
  const temporaryPath = `${filePath}.oatlas-tmp-${process.pid}`;
  let descriptor = null;
  try {
    descriptor = openSync(temporaryPath, 'wx');
    writeFileSync(descriptor, text, 'utf-8');
    // 이름을 바꾸기 전에 디스크에 확정한다 — 안 하면 이름만 새것이고 내용은
    // 아직 캐시에 있는 상태로 전원이 나갈 수 있다.
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporaryPath, filePath);
  } finally {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        /* 이미 닫혔다 */
      }
    }
    try {
      // 성공하면 rename 이 가져갔으므로 여기서 지울 것이 없다. 실패했을 때만
      // 임시 파일이 남고, 그건 원본을 건드리지 않고 치운다.
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    } catch {
      /* 못 치워도 원본은 멀쩡하다 */
    }
  }
}

/**
 * 두 경로가 **같은 파일을 가리키는가**를 비교할 열쇠.
 *
 * 이미 있는 파일이면 실제 경로(심볼릭 링크를 편 것)를 쓰고, 아직 없으면 경로
 * 문자열을 쓴다. 대소문자를 구별하지 않는 파일 시스템(macOS 기본 · Windows)을
 * 위해 소문자로 눕힌다 — 구별하는 시스템에서는 서로 다른 두 파일이 같은 열쇠를
 * 갖게 되지만, 그 경우 손해는 「지우기 하나를 안 한 것」뿐이고 그건 데이터가
 * 사라지는 쪽보다 언제나 낫다.
 */
function sameFileKey(path) {
  try {
    if (existsSync(path)) return realpathSync(path).toLowerCase();
  } catch {
    /* 실제 경로를 못 펴면 문자열로 간다 — 판정이 없는 것보다 낫다. */
  }
  return resolve(path).toLowerCase();
}

export function applyAllOrNothing(plan) {
  if (!Array.isArray(plan) || plan.length === 0) return { applied: 0 };

  /*
   * ⓪ **같은 파일을 쓰고 또 지우는 계획은 지우기를 뺀다.**
   *
   * 이름만 대소문자가 다른 rename 은 이 계획을 만든다:
   *   write `capabilities/auth.md` · delete `capabilities/Auth.md`
   * 그런데 macOS·Windows 의 파일 시스템은 그 둘을 **같은 파일**로 본다. 그래서
   * 쓰고 나서 지우면 방금 쓴 그것이 지워진다 — 노드가 통째로 사라지고, 도구는
   * 성공이라고 답한다(2026-08-16 검수에서 재현).
   *
   * 앞단(`rename_concept`)에서 그 경우를 거절하지만, 같은 계획을 만드는 도구가
   * 셋(rename · merge · reclassify)이라 **쓰기 층에도** 막아 둔다. 문자열 비교로
   * 못 잡는 것을 여기서는 **실제 경로**로 잡는다.
   */
  const writeTargets = new Set();
  for (const entry of plan) {
    if (entry.op !== 'write') continue;
    writeTargets.add(sameFileKey(entry.path));
  }
  const safePlan = plan.filter(
    (entry) => entry.op !== 'delete' || !writeTargets.has(sameFileKey(entry.path)),
  );
  if (safePlan.length !== plan.length) plan = safePlan;

  /*
   * ⓪-b **남이 그 사이에 고쳤으면 한 글자도 안 쓴다.**
   *
   * ## 왜 (2026-08-16 검수)
   *
   * `expected_mtime` 검사는 **한 파일**을 고치는 길에만 있었다. 그런데 이 함수를
   * 쓰는 셋(rename · merge · reclassify)은 참조하는 문서 N개를 **몇 분 전에 읽은
   * 스냅샷**으로 다시 쓴다. 그 사이 사용자가 옵시디언에서 그중 하나를 고쳤으면
   * 그 편집은 조용히 사라졌다 — 사람과 에이전트가 한 폴더를 같이 쓰는 것이
   * 이 제품이 파는 바로 그 상황인데, 그 상황에서만 보호가 없었다.
   *
   * 계획을 만든 쪽이 각 항목에 `expectedMtime` 을 실어 보내면 여기서 본다.
   * 안 실어 보내면 종전대로 검사하지 않는다(회귀 0) — 다만 그 자리는 이제
   * 「안 넣은 것」이지 「없는 것」이 아니다.
   */
  const conflicts = [];
  for (const entry of plan) {
    if (entry.expectedMtime === null || entry.expectedMtime === undefined) continue;
    if (!existsSync(entry.path)) continue;
    const current = getFileMtime(entry.path);
    if (current === null) continue;
    if (Math.abs(current - entry.expectedMtime) >= 1) {
      conflicts.push(entry.path);
    }
  }
  if (conflicts.length > 0) {
    throw new Error(
      `Refused before writing anything: ${conflicts.length} file(s) changed on disk since they `
        + `were read, so this operation would overwrite someone else's edit:\n  `
        + `${conflicts.join('\n  ')}\n`
        + 'The vault is unchanged. Re-read those documents and run this again.',
    );
  }

  // ① 사전 점검 — 한 글자도 쓰기 전에. 흔한 실패(읽기 전용 파일·잠긴 파일·
  //    읽기 전용 볼트)는 여기서 걸러져 되돌리기 자체가 필요 없어진다.
  const blocked = [];
  for (const entry of plan) {
    const dir = dirname(entry.path);
    try {
      if (existsSync(entry.path)) {
        accessSync(entry.path, fsConstants.W_OK);
      } else if (entry.op === 'write') {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        accessSync(dir, fsConstants.W_OK);
      }
      if (entry.op === 'delete' && existsSync(entry.path)) {
        // 파일을 지우려면 **파일이 아니라 디렉터리**에 쓰기 권한이 있어야 한다.
        accessSync(dir, fsConstants.W_OK);
      }
    } catch (error) {
      blocked.push(`${entry.path} (${error?.code ?? 'EACCES'})`);
    }
  }
  if (blocked.length > 0) {
    throw new Error(
      `Refused before writing anything: ${blocked.length} file(s) are not writable, `
        + `so this operation could not finish as one unit:\n  ${blocked.join('\n  ')}\n`
        + 'The vault is unchanged. Fix permissions (or close the editor/sync client '
        + 'holding them) and re-run with confirm: true.',
    );
  }

  // ② 적용 — 각 항목의 **직전 상태**를 들고 간다. 되돌릴 재료다.
  const done = [];
  try {
    for (const entry of plan) {
      const existed = existsSync(entry.path);
      const before = existed ? readFileSync(entry.path, 'utf-8') : null;
      if (entry.op === 'write') {
        mkdirSync(dirname(entry.path), { recursive: true });
        writeFileAtomically(entry.path, entry.content);
      } else {
        if (existed) unlinkSync(entry.path);
      }
      done.push({ path: entry.path, existed, before });
    }
    return { applied: done.length };
  } catch (error) {
    const unrecovered = [];
    for (const step of done.reverse()) {
      try {
        if (step.existed) writeFileAtomically(step.path, step.before);
        else if (existsSync(step.path)) unlinkSync(step.path);
      } catch {
        unrecovered.push(step.path);
      }
    }
    const reason = error?.message ?? String(error);
    if (unrecovered.length > 0) {
      throw new Error(
        `Write failed (${reason}) and the rollback could not finish. `
          + `The vault is INCONSISTENT: these files still hold rewritten content:\n  `
          + `${unrecovered.join('\n  ')}\n`
          + 'If the vault is a git repository, `git diff` shows exactly what changed '
          + 'and `git checkout -- <path>` restores it.',
      );
    }
    throw new Error(
      `Write failed (${reason}). Every change was rolled back: the vault is unchanged.`,
    );
  }
}

/**
 * targetSlug 를 가리키는 모든 vault doc 의 frontmatter array 키와 body link
 * 를 nextSlug 로 치환. rename_concept / merge_concepts 의 핵심 동작.
 *
 * 매칭 정책 (findBacklinks 와 동일):
 *  - 절대 slug 매칭 (`capabilities/mcp-server`)
 *  - 마지막 segment 매칭 (`mcp-server`) — 이때 치환은 *같은 표현* 유지를 위해
 *    target tail 그대로 두지 않고 nextSlug 의 tail 로 치환 (rename 의도라
 *    슬러그 어느 표현이든 일관성 있게 새 이름이 보여야 한다).
 *  - 끝부분 일치 (`*** /mcp-server`) 도 같은 정책.
 *
 * 본문 치환: `[[targetSlug]]` 와 `(targetSlug.md)` 를 nextSlug 로 치환.
 *
 * options.dryRun = true 면 디스크에 쓰지 않고 미리보기만.
 * options.excludeSlugs 는 호출자가 같은 계획에서 교체할 문서를 제외한다.
 *
 * 반환: { updates: [{ slug, beforeKeys, afterKeys, bodyHit }], totalUpdated }.
 */
export function redirectBacklinks(rootPath, targetSlug, nextSlug, options = {}) {
  /**
   * `deferWrite: true` 면 계획만 만들어 `plan` 으로 돌려주고 디스크는 안
   * 건드린다. `dryRun` 과 다르다 — dry-run 은 *사용자에게 보여 줄* 미리보기고,
   * 이건 **호출자가 자기 쓰기까지 한 계획에 합쳐** 전부-아니면-전무로 적용하기
   * 위한 것이다. `rename_concept` 이 파일 생성·백링크 재작성·옛 파일 삭제를
   * 한 단위로 묶는 데 쓴다.
   */
  const { dryRun = false, deferWrite = false, excludeSlugs = [] } = options;
  const excluded = new Set(Array.isArray(excludeSlugs) ? excludeSlugs : []);
  if (typeof targetSlug !== 'string' || !targetSlug) {
    throw new Error('targetSlug is required.');
  }
  if (typeof nextSlug !== 'string' || !nextSlug) {
    throw new Error('nextSlug is required.');
  }
  if (targetSlug === nextSlug) {
    return { updates: [], totalUpdated: 0, plan: [] };
  }

  const docs = loadVaultDocs(rootPath);
  const targetTail = targetSlug.split('/').pop();
  const nextTail = nextSlug.split('/').pop();
  const tailMatches = docs
    .map((doc) => doc.slug)
    .filter((slug) => slug.split('/').pop() === targetTail);
  // A bare/suffix tail is shorthand only while it uniquely resolves. When
  // capabilities/foo and elements/foo both exist, rewriting "foo" would
  // silently redirect whichever concept the author meant and can even mutate
  // the other node's frontmatter slug. Exact canonical refs remain safe.
  const canRewriteTail = tailMatches.length === 1 && tailMatches[0] === targetSlug;

  function rewriteArrayItem(value) {
    if (typeof value !== 'string') return { value, changed: false };
    if (value === targetSlug) return { value: nextSlug, changed: true };
    if (canRewriteTail && value === targetTail) return { value: nextTail, changed: true };
    if (canRewriteTail && value.endsWith(`/${targetTail}`)) {
      // path-prefixed tail — 보존 prefix + 새 tail
      const prefix = value.slice(0, value.length - targetTail.length);
      return { value: `${prefix}${nextTail}`, changed: true };
    }
    return { value, changed: false };
  }

  const updates = [];
  /** 디스크에 낼 쓰기 계획: 루프가 끝난 뒤 한 번에 적용한다. */
  const plan = [];
  for (const doc of docs) {
    if (doc.slug === targetSlug || excluded.has(doc.slug)) continue;
    const filePath = slugToPath(rootPath, doc.slug);
    const nextFm = { ...doc.frontmatter };
    const beforeKeys = [];
    const afterKeys = [];
    let fmChanged = false;

    for (const key of Object.keys(nextFm)) {
      const value = nextFm[key];
      if (Array.isArray(value)) {
        const before = [...value];
        const after = value.map((v) => rewriteArrayItem(v).value);
        if (before.some((b, i) => b !== after[i])) {
          // dedup + sort — 이미 nextSlug 가 있으면 중복 추가하지 않고, 같은
          // 그래프 상태는 같은 frontmatter 배열로 남긴다.
          const deduped = normalizeRelationRefs(after);
          nextFm[key] = deduped;
          beforeKeys.push({ key, before });
          afterKeys.push({ key, after: deduped });
          fmChanged = true;
        }
      } else if (typeof value === 'string') {
        // 그래프 참조 슬롯만 다시 쓴다 (`domain:` + GRAPH_ARRAY_KEYS 계열).
        // `path:` 같은 증거 문자열은 참조가 아니다 — 실측(2026-08-01, 도그푸드
        // 볼트 평탄화): `elements/src/widgets/docs-vault` → `elements/
        // docs-vault-widget` rename 의 tail-suffix 절이 **다른 노드의**
        // `path: src/entities/docs-vault` 까지 `…/docs-vault-widget` 으로
        // 고쳐 존재하지 않는 파일을 가리키게 했다(pathDrift 3건).
        const isRefSlot = key === 'domain' || GRAPH_ARRAY_KEY_SET.has(key);
        const r = isRefSlot ? rewriteArrayItem(value) : { changed: false };
        if (r.changed) {
          nextFm[key] = r.value;
          beforeKeys.push({ key, before: value });
          afterKeys.push({ key, after: r.value });
          fmChanged = true;
        }
      } else if (value && typeof value === 'object') {
        // P6 게이트 ① — 객체 맵 값(예: relation_notes: {ref: "왜"})의 KEY 도
        // rename 대상이다. 이걸 안 하면 관계 근거(why) 노트가 rename 순간
        // 고아가 된다 (레드팀이 실증한 스키마 착수 차단 사유).
        //
        // 키 충돌 병합 정책: old/new 키가 둘 다 존재하면 기존(new) 값을
        // 이긴다 — 사용자가 새 이름으로 이미 쓴 노트가 더 최신 의도이고,
        // rename 이 그것을 덮어쓰면 조용한 데이터 손실이다. 밀려난 old
        // 값은 버리지 않고 beforeKeys 에 남아 dry-run/감사에서 보인다.
        const entries = Object.entries(value);
        let mapChanged = false;
        const nextMap = {};
        for (const [mapKey, mapValue] of entries) {
          const r = rewriteArrayItem(mapKey);
          if (!r.changed) {
            if (!(mapKey in nextMap)) nextMap[mapKey] = mapValue;
            continue;
          }
          mapChanged = true;
          if (r.value in nextMap || entries.some(([k]) => k === r.value)) {
            // 충돌 — 기존(new 키) 값 승리, old 값은 기록만.
            continue;
          }
          nextMap[r.value] = mapValue;
        }
        if (mapChanged) {
          // 충돌 승리자(원래 new 키) 값 보존
          for (const [mapKey, mapValue] of entries) {
            if (!(mapKey in nextMap) && !rewriteArrayItem(mapKey).changed) nextMap[mapKey] = mapValue;
          }
          beforeKeys.push({ key, before: value });
          afterKeys.push({ key, after: nextMap });
          nextFm[key] = nextMap;
          fmChanged = true;
        }
      }
    }

    let nextBody = doc.body;
    let bodyChanged = false;
    if (nextBody.includes(`[[${targetSlug}]]`)) {
      nextBody = nextBody.split(`[[${targetSlug}]]`).join(`[[${nextSlug}]]`);
      bodyChanged = true;
    }
    if (canRewriteTail && nextBody.includes(`[[${targetTail}]]`)) {
      nextBody = nextBody.split(`[[${targetTail}]]`).join(`[[${nextTail}]]`);
      bodyChanged = true;
    }
    if (nextBody.includes(`(${targetSlug}.md)`)) {
      nextBody = nextBody.split(`(${targetSlug}.md)`).join(`(${nextSlug}.md)`);
      bodyChanged = true;
    }

    if (!fmChanged && !bodyChanged) continue;

    updates.push({
      slug: doc.slug,
      title: docTitle(doc),
      beforeKeys,
      afterKeys,
      bodyChanged,
    });

    // 여기서 **쓰지 않는다.** 종전엔 이 줄이 `writeFileSync` 였고, 그래서
    // 다음 파일이 안 써지면 앞의 것들만 바뀐 반쪽 볼트가 남았다.
    plan.push({
      op: 'write',
      path: filePath,
      content: buildMarkdown({ frontmatter: nextFm, body: nextBody }),
      /*
       * **읽은 시점을 같이 들고 간다** (2026-08-16 검수).
       *
       * 이 문서는 몇 초~몇 분 전에 읽은 스냅샷이다. 그 사이 사용자가 자기
       * 편집기에서 이 파일을 고쳤으면, 여기서 그대로 쓰는 순간 그 편집이
       * 사라진다. 쓰기 직전에 이 값과 디스크를 대조한다.
       */
      expectedMtime: getFileMtime(filePath),
    });
  }

  if (!dryRun && !deferWrite) applyAllOrNothing(plan);

  return { updates, totalUpdated: updates.length, plan };
}

function docTitle(doc) {
  if (typeof doc?.frontmatter?.title === 'string' && doc.frontmatter.title.trim()) {
    return doc.frontmatter.title;
  }
  if (typeof doc?.frontmatter?.name === 'string' && doc.frontmatter.name.trim()) {
    return doc.frontmatter.name;
  }
  return doc?.slug;
}

function normalizeForDuplicateTitle(title) {
  return String(title ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * 새 노드의 title 이 기존 노드와 정규화 기준(소문자·공백 정리)으로 동일하면
 * advisory 경고 문자열을, 아니면 null 을 반환한다.
 *
 * 성장하는 vault 의 #1 실패 모드는 **중복/hallucinated 노드** — agent 가
 * add_concept 전에 similar_nodes 로 확인하는 게 정석이지만, 잊으면 near-duplicate
 * 가 조용히 쌓인다. 이 함수는 add_concept 의 안전망: 같은 title 이 이미 있으면
 * "patch_concept 로 합쳐라" 라고 알린다. write 를 막지 않는 advisory.
 *
 * 정확도 우선(정규화 후 *완전 일치*)으로 오경고를 최소화한다 — fuzzy/부분 매칭은
 * 서로 다른 개념(예: auth-login vs auth-logout)에 오경고를 내므로 배제. 자기 자신
 * (같은 slug)·빈 title 은 제외.
 */
export function detectDuplicateTitle(title, slug, docs) {
  const norm = normalizeForDuplicateTitle(title);
  if (!norm) return null;
  for (const doc of docs ?? []) {
    if (!doc || doc.slug === slug) continue;
    if (normalizeForDuplicateTitle(docTitle(doc)) === norm) {
      const kind = doc.frontmatter?.kind ?? 'unknown';
      return (
        `a node titled "${title}" already exists at "${doc.slug}" (kind: ${kind}): ` +
        `if this is the same concept, patch_concept on "${doc.slug}" instead of adding a duplicate.`
      );
    }
  }
  return null;
}

/**
 * vault root 가 markdown vault 같은지 가벼운 검사. 절대 경로 + 디렉토리만
 * OK 로 본다 (frontmatter 가 없는 폴더도 빈 vault 로 허용).
 */
export function ensureVaultRoot(rootPath) {
  if (!rootPath) {
    throw new Error('Set the vault root via OATLAS_VAULT env var or --vault arg.');
  }
  if (!existsSync(rootPath)) {
    throw new Error(`Vault root not found: ${rootPath}`);
  }
  if (!statSync(rootPath).isDirectory()) {
    throw new Error(`Vault root is not a directory: ${rootPath}`);
  }
}
