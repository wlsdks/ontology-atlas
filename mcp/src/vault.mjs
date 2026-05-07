// vault helpers — 디렉토리 walking + .md 읽기/쓰기. 동기 fs 만 사용 (MCP
// tool 호출 빈도가 낮아 async 오버헤드 불필요).

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';

import { parseFrontmatter, buildMarkdown } from './parser.mjs';

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
        `Re-read the doc and try again, or pass force:true to overwrite.`,
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

/**
 * frontmatter 의 array 키 중 *그래프 엣지로 해석되는* 6 개. 새 edge 타입을
 * 추가하면 (e.g. 'aggregates', 'implements') 여기만 갱신하면 findOrphans /
 * findPath 등 모두 자동 cover. 예전에 두 함수가 각자 로컬로 같은 배열을
 * 들고 있어 drift 위험.
 */
const NEIGHBOR_KEYS = Object.freeze([
  'capabilities',
  'elements',
  'dependencies',
  'relates',
  'contains',
  'describes',
]);

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
export function pathToSlug(rootPath, filePath) {
  const rel = relative(rootPath, filePath).replace(/\\/g, '/');
  return rel.replace(/\.md$/, '');
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
  return candidate;
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
 * 새 doc 작성. 디렉토리 자동 생성. 기존 파일 있으면 throw (덮어쓰기 의도라면
 * 호출자가 명시적으로).
 */
export function writeDoc(rootPath, slug, { frontmatter, body = '' }) {
  const filePath = slugToPath(rootPath, slug);
  if (existsSync(filePath)) {
    throw new Error(`Doc already exists: ${slug}`);
  }
  mkdirSync(dirname(filePath), { recursive: true });
  const md = buildMarkdown({ frontmatter, body });
  writeFileSync(filePath, md, 'utf-8');
  return filePath;
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
    throw new Error(`Doc not found: ${slug}`);
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
    throw new Error(`Doc not found: ${slug}`);
  }
  assertMtime(slug, filePath, options.expectedMtime);
  const raw = readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);
  const next = { ...frontmatter };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else if (value !== undefined) {
      next[key] = value;
    }
  }
  const md = buildMarkdown({ frontmatter: next, body });
  writeFileSync(filePath, md, 'utf-8');
  return filePath;
}

/**
 * 기존 doc 의 frontmatter + body 를 동시에 갱신. frontmatter 는 patchFrontmatter
 * 와 동일한 patch 의미 (null = 삭제, undefined = skip). body 가 string 이면
 * 교체, undefined 면 보존, null 이면 빈 본문. expectedMtime 옵션으로 외부
 * 변경 감지.
 */
export function updateDoc(rootPath, slug, { frontmatter: patch, body, expectedMtime }) {
  const filePath = slugToPath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: ${slug}`);
  }
  assertMtime(slug, filePath, expectedMtime);
  const raw = readFileSync(filePath, 'utf-8');
  const { frontmatter, body: oldBody } = parseFrontmatter(raw);
  const nextFm = { ...frontmatter };
  if (patch) {
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete nextFm[key];
      } else if (value !== undefined) {
        nextFm[key] = value;
      }
    }
  }
  const nextBody =
    body === undefined ? oldBody : body === null ? '' : body;
  const md = buildMarkdown({ frontmatter: nextFm, body: nextBody });
  writeFileSync(filePath, md, 'utf-8');
  return filePath;
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
  for (const doc of docs) {
    const kind = doc.frontmatter.kind;
    if (typeof kind !== 'string' || !kind) continue;
    byKind[kind] = (byKind[kind] || 0) + 1;
    total += 1;
  }
  return { total, byKind };
}

/**
 * vault 의 orphan 노드 찾기 — 다른 어느 노드도 frontmatter array 키
 * (capabilities/elements/dependencies/relates/contains/describes) 에서
 * 가리키지 않는 doc. 매칭 정책은 findBacklinks 와 동일 (절대 slug 또는
 * 마지막 segment).
 *
 * 옵션:
 *   - kind: 특정 kind 만 대상
 *   - excludeKinds: 이 kind 들은 결과에서 제외 (기본 ['vault-readme'])
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
      : ['vault-readme'],
  );
  const slugs = new Set(docs.map((d) => d.slug));
  const tailToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split('/').pop();
    if (tail && tail !== slug && !tailToFull.has(tail)) {
      tailToFull.set(tail, slug);
    }
  }
  const referenced = new Set();
  for (const doc of docs) {
    for (const key of NEIGHBOR_KEYS) {
      const value = doc.frontmatter[key];
      if (!Array.isArray(value)) continue;
      for (const ref of value) {
        if (typeof ref !== 'string') continue;
        if (slugs.has(ref)) {
          if (ref !== doc.slug) referenced.add(ref);
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
    });
  }
  return { total: orphans.length, orphans };
}

/**
 * 두 slug 사이 그래프 최단 경로 (T30, BFS). edge 는 frontmatter array
 * 키 (capabilities, elements, dependencies, relates, contains, describes)
 * 의 항목 + 양방향 (backlink) 으로 구성된 무방향 그래프.
 *
 * 항목 string 이 절대 slug 또는 slug 의 마지막 segment 둘 다 매칭
 * 가능하도록 — findBacklinks 와 같은 정책.
 *
 * 경로 못 찾으면 null. maxHops (기본 5) 초과면 cutoff.
 */
export function findPath(rootPath, fromSlug, toSlug, maxHops = 5) {
  const docs = loadVaultDocs(rootPath);
  const slugs = new Set(docs.map((d) => d.slug));
  // 두 끝점이 vault 에 모두 존재해야 의미 있는 응답. 동일 slug 도 vault 안에
  // 있을 때만 trivial path 반환 — 존재하지 않는 slug 에 대해 fake path 를
  // 만들지 않도록 (이전 회귀: from===to 인 가짜 slug 도 hops:[slug] 반환했음).
  if (!slugs.has(fromSlug) || !slugs.has(toSlug)) return null;
  if (fromSlug === toSlug) return { from: fromSlug, to: toSlug, hops: [fromSlug], edges: [] };
  // 마지막 segment 매칭은 alias 로.
  const tailToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split('/').pop();
    if (tail && tail !== slug && !tailToFull.has(tail)) {
      tailToFull.set(tail, slug);
    }
  }
  function resolveRef(ref) {
    if (typeof ref !== 'string') return null;
    if (slugs.has(ref)) return ref;
    if (tailToFull.has(ref)) return tailToFull.get(ref);
    for (const slug of slugs) {
      if (slug.endsWith(`/${ref}`)) return slug;
    }
    return null;
  }
  // adjacency: 무방향, 각 edge 는 frontmatter `via` 키 (capabilities / elements
  // / dependencies / relates / contains / describes) 를 기록한다. 한 doc 가
  // 같은 neighbor 를 여러 키에서 참조하면 *첫 키* 를 기억 (가장 구체적인 의미를
  // 잃지 않게 NEIGHBOR_KEYS 순서가 capabilities → describes 로 의미적 specificity 약화).
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
    for (const key of NEIGHBOR_KEYS) {
      const value = doc.frontmatter[key];
      if (!Array.isArray(value)) continue;
      for (const ref of value) {
        const resolved = resolveRef(ref);
        if (resolved && resolved !== doc.slug) {
          addEdge(doc.slug, resolved, key);
        }
      }
    }
  }
  // BFS — depth 를 큐에 같이 들고 다녀서 매 dequeue 시 parent 체인을 거꾸로
  // 거슬러 올라가는 O(D) 작업 회피. 큐도 head index 로 운용해 Array.shift()
  // 의 O(V) 비용 제거 (큰 vault 에서 의미 있음).
  const queue = [{ node: fromSlug, depth: 0 }];
  const visited = new Set([fromSlug]);
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
      if (n === toSlug) {
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
  const matches = [];
  // frontmatter array 키 안의 항목이 targetSlug 와 일치 또는 끝부분 일치
  // (예: targetSlug='capabilities/mcp-server' 가 항목 'mcp-server' 와도
  // 매칭). markdown link 형식 `(./capabilities/mcp-server.md)` 도 잡는다.
  const slugTail = targetSlug.split('/').pop();
  for (const doc of docs) {
    if (doc.slug === targetSlug) continue;
    const matchedKeys = [];
    for (const key of Object.keys(doc.frontmatter)) {
      const value = doc.frontmatter[key];
      if (Array.isArray(value)) {
        if (
          value.some(
            (v) =>
              typeof v === 'string' &&
              (v === targetSlug || v === slugTail || v.endsWith(`/${slugTail}`)),
          )
        ) {
          matchedKeys.push(key);
        }
      } else if (typeof value === 'string') {
        if (value === targetSlug || value === slugTail) {
          matchedKeys.push(key);
        }
      }
    }
    const bodyHit =
      doc.body.includes(`[[${targetSlug}]]`) ||
      doc.body.includes(`[[${slugTail}]]`) ||
      doc.body.includes(`(${targetSlug}.md)`) ||
      doc.body.includes(`/${slugTail}.md`);
    if (matchedKeys.length === 0 && !bodyHit) continue;
    matches.push({
      slug: doc.slug,
      kind: doc.frontmatter.kind,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
      matchedKeys: matchedKeys.length > 0 ? matchedKeys : undefined,
      matchedInBody: bodyHit || undefined,
    });
  }
  return matches;
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

  function rewriteArrayItem(value) {
    if (typeof value !== 'string') return { value, changed: false };
    if (value === targetSlug) return { value: nextSlug, changed: true };
    if (value === targetTail) return { value: nextTail, changed: true };
    if (value.endsWith(`/${targetTail}`)) {
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
          // dedup — 이미 nextSlug 가 있으면 중복 추가하지 않음
          const seen = new Set();
          const deduped = [];
          for (const item of after) {
            if (typeof item === 'string') {
              if (seen.has(item)) continue;
              seen.add(item);
            }
            deduped.push(item);
          }
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
      }
    }

    let nextBody = doc.body;
    let bodyChanged = false;
    if (nextBody.includes(`[[${targetSlug}]]`)) {
      nextBody = nextBody.split(`[[${targetSlug}]]`).join(`[[${nextSlug}]]`);
      bodyChanged = true;
    }
    if (nextBody.includes(`[[${targetTail}]]`)) {
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

/**
 * vault root 가 markdown vault 같은지 가벼운 검사. 절대 경로 + 디렉토리만
 * OK 로 본다 (frontmatter 가 없는 폴더도 빈 vault 로 허용).
 */
export function ensureVaultRoot(rootPath) {
  if (!rootPath) {
    throw new Error('Set the vault root via OMOT_VAULT env var or --vault arg.');
  }
  if (!existsSync(rootPath)) {
    throw new Error(`Vault root not found: ${rootPath}`);
  }
  if (!statSync(rootPath).isDirectory()) {
    throw new Error(`Vault root is not a directory: ${rootPath}`);
  }
}
