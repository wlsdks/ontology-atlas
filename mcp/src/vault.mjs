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
import { join, relative, dirname } from 'node:path';

import { parseFrontmatter, buildMarkdown } from './parser.mjs';

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
 */
export function slugToPath(rootPath, slug) {
  return join(rootPath, `${slug}.md`);
}

/**
 * 한 .md 파일을 읽어 { slug, frontmatter, body, raw }.
 */
export function readDoc(rootPath, filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    slug: pathToSlug(rootPath, filePath),
    frontmatter,
    body,
    raw,
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
 * doc 영구 삭제. 호출자가 confirmation / backlinks 검사를 책임진다.
 * 반환: 삭제 직전 캡처한 { slug, filePath, frontmatter, body, raw }.
 * 파일 없으면 throw.
 */
export function deleteDoc(rootPath, slug) {
  const filePath = slugToPath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: ${slug}`);
  }
  const captured = readDoc(rootPath, filePath);
  unlinkSync(filePath);
  return { ...captured, filePath };
}

/**
 * 기존 doc 의 frontmatter 만 patch. body 보존. patch 객체의 null 은 키
 * 삭제, undefined 는 skip.
 */
export function patchFrontmatter(rootPath, slug, patch) {
  const filePath = slugToPath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: ${slug}`);
  }
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
 * 교체, undefined 면 보존, null 이면 빈 본문.
 */
export function updateDoc(rootPath, slug, { frontmatter: patch, body }) {
  const filePath = slugToPath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: ${slug}`);
  }
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
  if (fromSlug === toSlug) return { from: fromSlug, to: toSlug, hops: [fromSlug] };
  const docs = loadVaultDocs(rootPath);
  // slug → Set<neighbor slug>. 마지막 segment 매칭은 alias 로.
  const slugs = new Set(docs.map((d) => d.slug));
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
    // try matching by tail
    for (const slug of slugs) {
      if (slug.endsWith(`/${ref}`)) return slug;
    }
    return null;
  }
  const adj = new Map();
  function addEdge(a, b) {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  }
  for (const doc of docs) {
    for (const key of NEIGHBOR_KEYS) {
      const value = doc.frontmatter[key];
      if (!Array.isArray(value)) continue;
      for (const ref of value) {
        const resolved = resolveRef(ref);
        if (resolved && resolved !== doc.slug) {
          addEdge(doc.slug, resolved);
        }
      }
    }
  }
  if (!slugs.has(fromSlug) || !slugs.has(toSlug)) return null;
  // BFS
  const queue = [fromSlug];
  const visited = new Set([fromSlug]);
  const parent = new Map();
  while (queue.length > 0) {
    const cur = queue.shift();
    const depth = (() => {
      let d = 0;
      let p = cur;
      while (parent.has(p)) {
        p = parent.get(p);
        d += 1;
      }
      return d;
    })();
    if (depth >= maxHops) continue;
    const neighbors = adj.get(cur) || new Set();
    for (const n of neighbors) {
      if (visited.has(n)) continue;
      visited.add(n);
      parent.set(n, cur);
      if (n === toSlug) {
        // build path
        const hops = [n];
        let p = n;
        while (parent.has(p)) {
          p = parent.get(p);
          hops.unshift(p);
        }
        return { from: fromSlug, to: toSlug, hops };
      }
      queue.push(n);
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
 * vault root 가 markdown vault 같은지 가벼운 검사. 절대 경로 + 디렉토리만
 * OK 로 본다 (frontmatter 가 없는 폴더도 빈 vault 로 허용).
 */
export function ensureVaultRoot(rootPath) {
  if (!rootPath) {
    throw new Error('OMOT_VAULT 환경 변수 또는 --vault 인수로 vault root 를 지정하세요.');
  }
  if (!existsSync(rootPath)) {
    throw new Error(`Vault root not found: ${rootPath}`);
  }
  if (!statSync(rootPath).isDirectory()) {
    throw new Error(`Vault root is not a directory: ${rootPath}`);
  }
}
