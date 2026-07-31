// vault helpers — 디렉토리 walking + .md 읽기/쓰기. 동기 fs 만 사용 (MCP
// tool 호출 빈도가 낮아 async 오버헤드 불필요).

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  realpathSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';

import { parseFrontmatter, buildMarkdown } from './parser.mjs';
import { NODE_ELIGIBILITY_GATE } from './schema.mjs';
import {
  bulkProvenanceMessage,
  danglingGraphReferenceMessage,
  looksLikeEvidencePath,
  looksLikePath,
  pathShapedReferenceMessage,
  pathShapedTitleMessage,
} from './construction-rules.mjs';

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
      `Vault conflict — "${slug}" was modified externally between read and write. ` +
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
  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    slug: pathToSlug(rootPath, filePath),
    frontmatter,
    body,
    raw,
    mtime: getFileMtime(filePath),
  };
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
  /** Lazy slug index — { rootPath, names: Set<string> }. */
  index: null,
};

/** Test seam, and the reset a long-lived server would need if the vault root moved. */
export function resetNodeEligibilityGate() {
  GATE.findings = [];
  GATE.noticed.clear();
  GATE.createdUnderParent.clear();
  GATE.noticedBulk.clear();
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

const { NOTICE_THRESHOLD, NOTICE_REPEAT_MULTIPLE, BULK_PROVENANCE_SIBLING_TRIGGER, REFERENCE_SAMPLE_LIMIT } =
  NODE_ELIGIBILITY_GATE;

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
  for (const { key, ref } of collectNeighborRefs({ frontmatter })) {
    if (gateResolves(rootPath, ref)) continue;
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

  // ③ Bulk provenance. Not a size limit — a statement about *who* made these and
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
function commitDoc(rootPath, slug, filePath, frontmatter, body, { created = false } = {}) {
  writeFileSync(filePath, buildMarkdown({ frontmatter, body }), 'utf-8');
  if (created) noteGateWrite(rootPath, slug);
  runNodeEligibilityGate(rootPath, slug, frontmatter, { created });
  return filePath;
}

/**
 * 새 doc 작성. 디렉토리 자동 생성. 기존 파일 있으면 throw (덮어쓰기 의도라면
 * 호출자가 명시적으로).
 */
export function writeDoc(rootPath, slug, { frontmatter, body = '' }) {
  const filePath = slugToPath(rootPath, slug);
  if (existsSync(filePath)) {
    throw new Error(
      `Doc already exists at "${slug}". To update fields, use patch_concept(slug, frontmatter, body, expected_mtime). To rename, use rename_concept(oldSlug, newSlug). Never delete-then-add — that loses backlinks.`,
    );
  }
  assertPlainObject(frontmatter, 'frontmatter');
  if (typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
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
  const next = { ...frontmatter };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else if (value !== undefined) {
      next[key] = normalizeFrontmatterValue(key, value);
    }
  }
  return commitDoc(rootPath, slug, filePath, next, body);
}

/**
 * 기존 doc 의 frontmatter + body 를 동시에 갱신. frontmatter 는 patchFrontmatter
 * 와 동일한 patch 의미 (null = 삭제, undefined = skip). body 가 string 이면
 * 교체, undefined 면 보존. expectedMtime 옵션으로 외부 변경 감지.
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
  return commitDoc(rootPath, slug, filePath, nextFm, nextBody);
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
 *
 * 반환: { updates: [{ slug, beforeKeys, afterKeys, bodyHit }], totalUpdated }.
 */
export function redirectBacklinks(rootPath, targetSlug, nextSlug, options = {}) {
  const { dryRun = false } = options;
  if (typeof targetSlug !== 'string' || !targetSlug) {
    throw new Error('targetSlug is required.');
  }
  if (typeof nextSlug !== 'string' || !nextSlug) {
    throw new Error('nextSlug is required.');
  }
  if (targetSlug === nextSlug) {
    return { updates: [], totalUpdated: 0 };
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
  for (const doc of docs) {
    if (doc.slug === targetSlug) continue;
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
        const r = rewriteArrayItem(value);
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

    if (!dryRun) {
      const md = buildMarkdown({ frontmatter: nextFm, body: nextBody });
      writeFileSync(filePath, md, 'utf-8');
    }
  }

  return { updates, totalUpdated: updates.length };
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
        `a node titled "${title}" already exists at "${doc.slug}" (kind: ${kind}) — ` +
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
