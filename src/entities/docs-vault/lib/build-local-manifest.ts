import {
  buildExcerpt,
  extractHeadings,
  extractOutLinksWithContext,
  firstHeading,
  parseFrontmatter,
  type LinkContext,
} from '@/shared/lib/parse-frontmatter';
import { nativeVaultFingerprint } from '@/shared/lib/tauri-vault-fs';
import type {
  VaultBacklinkEntry,
  VaultDoc,
  VaultManifest,
  VaultTreeNode,
} from '../model/types';

/**
 * D-1 — frontmatter keys that hold graph relation refs to OTHER docs. A doc
 * that names another doc here (e.g. `dependencies: [capabilities/mcp-server]`)
 * is a backlink to that doc, exactly as the MCP `find_backlinks` tool counts it
 * (same key set: `mcp/src/vault.mjs` NEIGHBOR_KEYS + INLINE_NEIGHBOR_KEYS).
 * The old backlink index only scanned BODY markdown links, so a doc referenced
 * purely through frontmatter (the common vault case) showed a false "no
 * backlinks" — the exact defect the UX round caught on `capabilities/mcp-server`
 * (13 real referrers, footer said "none"). Kept in sync with the build-time
 * script (`scripts/build-docs-vault.mjs`).
 */
const RELATION_REF_ARRAY_KEYS = [
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'relates',
  'contains',
  'describes',
] as const;
const RELATION_REF_STRING_KEYS = ['domain'] as const;

/** Frontmatter value → the doc slugs it references (folder-prefixed or bare). */
function frontmatterRefStrings(frontmatter: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of RELATION_REF_ARRAY_KEYS) {
    const value = frontmatter[key];
    if (Array.isArray(value)) {
      for (const item of value) if (typeof item === 'string' && item.trim()) out.push(item.trim());
    } else if (typeof value === 'string' && value.trim()) {
      // tolerate a scalar where an array is expected
      out.push(value.trim());
    }
  }
  for (const key of RELATION_REF_STRING_KEYS) {
    const value = frontmatter[key];
    if (typeof value === 'string' && value.trim()) out.push(value.trim());
  }
  return out;
}

/**
 * Resolve a frontmatter ref to a known doc slug, or null. Folder-prefixed refs
 * (`capabilities/mcp-server`) match a slug directly; bare refs (`mcp-server`,
 * `ai-agent-partner`) resolve by unique tail segment. Refs that match no doc
 * (e.g. `elements: [mcp/src/index.js]` — a source-file ref with no `.md`) are
 * skipped, so no phantom backlinks are minted.
 */
function resolveRefToDocSlug(
  ref: string,
  slugSet: ReadonlySet<string>,
  tailToSlug: ReadonlyMap<string, string | null>,
): string | null {
  const normalized = ref.replace(/\.md$/i, '');
  if (slugSet.has(normalized)) return normalized;
  const tail = normalized.split('/').pop() ?? normalized;
  const byTail = tailToSlug.get(tail);
  // `byTail === null` marks an ambiguous tail (2+ docs share it) — don't guess.
  return byTail ?? null;
}

// FileSystemDirectoryHandle 을 재귀 순회해 .md 파일만 수집. 파일 핸들 맵을
// 같이 반환해 뷰어가 slug → 파일 content 를 읽을 수 있게 한다. Next.js
// 정적 타입에 FSAccess API 타입이 이미 lib.dom.d.ts 로 들어와 있어서 외부
// 의존 없이 써도 OK.

interface WalkEntry {
  handle: FileSystemFileHandle;
  /** 최상위 핸들을 기준으로 한 상대 경로. 예: 'specs/hello.md' */
  relativePath: string;
  kind: 'md' | 'image';
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

/**
 * 순회의 경계 — **볼트는 문서 폴더지 임의의 디렉터리가 아니다.**
 *
 * 2026-07-29 실측: 설치 앱에서 볼트로 **저장소 루트**를 고르면 WebView 가
 * 죽었다("This page couldn't load"). 순회가 무제한이라 `src-tauri/target`
 * 까지 내려가 디렉터리 984개 · 마크다운 965개(9.4MB)를 IPC 로 실어 나른다 —
 * 정상 볼트(23 · 97)의 16배다.
 *
 * 이게 아픈 이유는 **스킬 사본 판정처럼 볼트가 저장소 루트여야 의미 있는
 * 기능이 있고, 그 조합이 정확히 그 사용자의 첫 시도**라는 점이다.
 */

/**
 * 이름만으로 확실한 것. `node_modules` 안에 사용자의 온톨로지가 있을 확률은
 * 0이고, 이름이 겹칠 일도 없다. **목록을 늘리지 않는다** — `build`·`dist`·
 * `out` 같은 이름은 문서 폴더에도 정당하게 존재할 수 있어서, 이름으로 자르면
 * 남의 문서를 조용히 버린다.
 */
const PRUNE_BY_NAME = new Set(['node_modules']);

/**
 * 캐시 디렉터리의 **공개 규약** — 디렉터리가 스스로 "나는 캐시다" 라고 선언한다
 * (bford.info/cachedir, Cargo·Bazel 등이 따른다). 이름 목록과 달리 관리할
 * 것이 없고 오탐이 원리적으로 없다: 사용자가 자기 문서 폴더에 이 파일을 넣을
 * 이유가 없다.
 */
const CACHE_DIR_TAG = 'CACHEDIR.TAG';

/** 정상 볼트의 20배 남짓. 넘으면 자르고 **자른 사실을 말한다**. */
export const VAULT_WALK_MAX_ENTRIES = 4000;
/** 문서 폴더의 현실적 상한. 넘는 깊이는 대개 남의 트리에 들어간 것이다. */
export const VAULT_WALK_MAX_DEPTH = 12;

export interface WalkResult {
  entries: WalkEntry[];
  /**
   * 상한에 걸려 **일부만 봤는가.** 침묵하는 절단은 "전부 봤다" 로 읽히므로
   * 호출부까지 올려 보낸다 — 이 저장소가 게이트에서 반복해 배운 규율이다.
   */
  truncated: boolean;
  /** 캐시/의존성으로 판정해 통째로 건너뛴 디렉터리의 상대 경로. */
  prunedDirs: string[];
}

async function walkInto(
  root: FileSystemDirectoryHandle,
  prefix: string,
  depth: number,
  acc: WalkResult,
): Promise<void> {
  if (acc.truncated) return;
  if (depth > VAULT_WALK_MAX_DEPTH) {
    acc.truncated = true;
    return;
  }

  // 목록을 **먼저 모은다.** 캐시 표식은 이 목록 안에 이미 들어 있으므로
  // `getFileHandle` 로 따로 물어볼 이유가 없다 — 그렇게 하면 디렉터리마다
  // IPC 왕복이 하나씩 늘고, 그건 지금 고치고 있는 비용과 같은 종류다.
  const children: Array<[string, FileSystemHandle]> = [];
  for await (const entry of root.entries()) children.push(entry);

  if (children.some(([name]) => name === CACHE_DIR_TAG)) {
    acc.prunedDirs.push(prefix || '.');
    return;
  }

  for (const [name, handle] of children) {
    if (acc.entries.length >= VAULT_WALK_MAX_ENTRIES) {
      acc.truncated = true;
      return;
    }
    if (name.startsWith('.')) continue;
    const relative = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      if (PRUNE_BY_NAME.has(name)) {
        acc.prunedDirs.push(relative);
        continue;
      }
      await walkInto(handle as FileSystemDirectoryHandle, relative, depth + 1, acc);
    } else if (name.endsWith('.md')) {
      acc.entries.push({ handle: handle as FileSystemFileHandle, relativePath: relative, kind: 'md' });
    } else if (IMAGE_EXT.test(name)) {
      acc.entries.push({ handle: handle as FileSystemFileHandle, relativePath: relative, kind: 'image' });
    }
  }
}

export async function walkVault(root: FileSystemDirectoryHandle): Promise<WalkResult> {
  const acc: WalkResult = { entries: [], truncated: false, prunedDirs: [] };
  await walkInto(root, '', 0, acc);
  return acc;
}

async function walk(
  root: FileSystemDirectoryHandle,
  prefix = '',
): Promise<WalkEntry[]> {
  const acc: WalkResult = { entries: [], truncated: false, prunedDirs: [] };
  await walkInto(root, prefix, 0, acc);
  return acc.entries;
}

function insertIntoTree(root: VaultTreeNode, slug: string, title: string) {
  const parts = slug.split('/');
  let node = root;
  for (let i = 0; i < parts.length; i += 1) {
    const name = parts[i];
    const isLeaf = i === parts.length - 1;
    if (!node.children) node.children = [];
    let child = node.children.find((c) => c.name === name);
    if (!child) {
      child = {
        name,
        path: parts.slice(0, i + 1).join('/'),
        type: isLeaf ? 'doc' : 'dir',
      };
      if (isLeaf) {
        child.slug = slug;
        child.title = title;
      }
      node.children.push(child);
    } else if (isLeaf && !child.slug) {
      child.type = 'doc';
      child.slug = slug;
      child.title = title;
    }
    node = child;
  }
}

function sortTree(node: VaultTreeNode) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
  for (const c of node.children) sortTree(c);
}

export interface LocalVaultBuild {
  manifest: VaultManifest;
  fileHandles: Map<string, FileSystemFileHandle>;
  /** 이미지 등 asset 파일. key 는 vault root 기준 상대 경로 (예: 'img/foo.png'). */
  imageHandles: Map<string, FileSystemFileHandle>;
  /**
   * 빌드 시점의 디렉터리 fingerprint — `${path}@${mtime}` 들을 정렬·join 한 문자열.
   * 이후 `computeLocalVaultFingerprint(root)` 결과와 비교해 변동 없으면 재빌드 skip 가능.
   */
  fingerprint: string;
}

function fingerprintFromEntries(
  entries: Array<{ relativePath: string; lastModified: number }>,
): string {
  return entries
    .map((e) => `${e.relativePath}@${e.lastModified}`)
    .sort()
    .join('\n');
}

/**
 * 디렉터리를 walk 하며 *content 를 읽지 않고* 파일 mtime 만 모아 fingerprint
 * 만든다. 같은 fingerprint = 마지막 빌드 후 .md / 이미지 변경 없음. 호출자
 * (예: focus auto-refresh) 가 이를 비교해 불필요한 전체 재빌드를 회피.
 */
/**
 * 지문과 **그 지문을 만든 스탬프**를 함께 준다.
 *
 * `computeLocalVaultFingerprint` 만 있던 동안, 호출자는 「바뀌었나」를 알고
 * 나면 그 근거를 버렸다. 그래서 증분 재빌드가 같은 볼트를 **한 번 더** 걸었다.
 * 여기서 둘을 같이 돌려주면 걷기는 변경당 한 번이면 된다.
 */
export async function computeLocalVaultFingerprintWithStamps(
  root: FileSystemDirectoryHandle,
): Promise<{ fingerprint: string; nativeStamps: Map<string, number> | null }> {
  const nativeRoot = (root as { rootPath?: unknown }).rootPath;
  if (typeof nativeRoot === 'string' && nativeRoot) {
    const native = await nativeVaultFingerprint(nativeRoot);
    if (native) {
      return {
        fingerprint: fingerprintFromEntries(native.entries),
        nativeStamps: new Map(
          native.entries.map((e) => [e.relativePath, e.lastModified] as const),
        ),
      };
    }
  }
  return { fingerprint: await computeLocalVaultFingerprint(root), nativeStamps: null };
}

export async function computeLocalVaultFingerprint(
  root: FileSystemDirectoryHandle,
): Promise<string> {
  /*
   * **앱에서는 네이티브 한 번으로 끝낸다** (2026-07-31).
   *
   * 아래 웹 경로는 파일마다 `getFile()` 을 부르는데, Tauri 에서 그건
   * `read_vault_text_file` IPC 왕복이고 그 명령은 **본문 전체 + mtime** 을
   * 돌려준다. 쓰이는 것은 숫자 하나인데 볼트 전체가 다리를 건넜다 — 이
   * 저장소 자신을 볼트로 열면 `docs/` 가 261 파일 · 17.7MB 이고, 이 함수는
   * 창에 포커스가 돌아올 때마다 돈다.
   *
   * `vault_fingerprint` 는 Rust 가 훑어 **경로와 mtime 만** 한 번에 준다.
   * 웹에는 이런 일괄 API 가 없어 `null` 이 오고, 그러면 아래 경로로 떨어진다 —
   * `surfaces.md` 의 브리지 관례(없으면 `null`, 화면/동작은 정직하게 강등)
   * 그대로다.
   */
  const nativeRoot = (root as { rootPath?: unknown }).rootPath;
  if (typeof nativeRoot === 'string' && nativeRoot) {
    const native = await nativeVaultFingerprint(nativeRoot);
    if (native) return fingerprintFromEntries(native.entries);
  }

  const files = await walk(root);
  const stamps = await Promise.all(
    files.map(async (entry) => {
      const file = await entry.handle.getFile();
      return {
        relativePath: entry.relativePath,
        lastModified: file.lastModified,
      };
    }),
  );
  return fingerprintFromEntries(stamps);
}

/**
 * 빌드 한 단위 — md 문서 1개(+ 역참조 재구성에 필요한 link context) 또는 이미지.
 * `handle` + `lastModified` 를 들고 있어 증분 재빌드가 mtime 이 같은(=내용 동일)
 * 파일의 본문 재독을 건너뛰고 직전 결과를 그대로 재사용할 수 있다.
 */
export interface BuiltVaultEntry {
  relativePath: string;
  lastModified: number;
  handle: FileSystemFileHandle;
  kind: 'md' | 'image';
  /** md 전용 — 집계된 VaultDoc. */
  doc?: VaultDoc;
  /** md 전용 — backlinksDetail 재구성용 out-link context. */
  linkContexts?: LinkContext[];
}

/** 단일 .md 파일의 raw 본문 → BuiltVaultEntry. 순수 변환(I/O 없음). */
function buildMdEntry(
  entry: WalkEntry,
  raw: string,
  lastModified: number,
): BuiltVaultEntry {
  const slug = entry.relativePath.replace(/\.md$/, '');
  const { frontmatter, body } = parseFrontmatter(raw);
  const headings = extractHeadings(body);
  const title =
    (typeof frontmatter.title === 'string' && frontmatter.title) ||
    firstHeading(body) ||
    slug.split('/').pop() ||
    slug;
  const description =
    typeof frontmatter.description === 'string'
      ? frontmatter.description
      : undefined;
  const tags = Array.isArray(frontmatter.tags)
    ? (frontmatter.tags as unknown[]).filter(
        (t): t is string => typeof t === 'string',
      )
    : typeof frontmatter.tags === 'string'
      ? frontmatter.tags.split(/\s+/).filter(Boolean)
      : [];
  const { slugs: linksOut, contexts: linkContexts } =
    extractOutLinksWithContext(body, slug);

  const doc: VaultDoc = {
    slug,
    path: entry.relativePath,
    title,
    description,
    tags,
    frontmatter,
    headings,
    excerpt: buildExcerpt(body),
    wordCount: body.split(/\s+/).filter(Boolean).length,
    updatedAt: new Date(lastModified).toISOString(),
    linksOut,
    mtime: lastModified,
  };
  return {
    relativePath: entry.relativePath,
    lastModified,
    handle: entry.handle,
    kind: 'md',
    doc,
    linkContexts,
  };
}

/**
 * BuiltVaultEntry[] → 완성된 LocalVaultBuild. 정렬·트리·역참조·태그·fingerprint
 * 집계는 전부 in-memory (저렴 — derive 와 같은 차수). 전체 빌드와 증분 빌드가
 * **이 함수 하나를** 공유하므로 두 경로의 결과가 구조적으로 동일하다(중복 0).
 */
function aggregateBuild(
  entries: BuiltVaultEntry[],
  rootName: string,
  walkInfo?: { truncated: boolean; prunedDirs: string[] },
): LocalVaultBuild {
  const docs: VaultDoc[] = [];
  const fileHandles = new Map<string, FileSystemFileHandle>();
  const imageHandles = new Map<string, FileSystemFileHandle>();
  const backlinksDetailMap = new Map<string, VaultBacklinkEntry[]>();
  const tagsMap = new Map<string, Set<string>>();
  const fingerprintStamps: Array<{ relativePath: string; lastModified: number }> = [];

  for (const entry of entries) {
    fingerprintStamps.push({
      relativePath: entry.relativePath,
      lastModified: entry.lastModified,
    });
    if (entry.kind === 'image') {
      imageHandles.set(entry.relativePath, entry.handle);
      continue;
    }
    const doc = entry.doc;
    if (!doc) continue;
    fileHandles.set(doc.slug, entry.handle);

    // 단순 backlinks (deprecated) 는 더 이상 manifest 에 포함하지 않는다.
    // backlinksDetail 만 유지 — 컨텍스트와 함께.
    for (const ctx of entry.linkContexts ?? []) {
      if (!backlinksDetailMap.has(ctx.target)) {
        backlinksDetailMap.set(ctx.target, []);
      }
      backlinksDetailMap.get(ctx.target)!.push({
        fromSlug: doc.slug,
        context: ctx.context,
        linkText: ctx.linkText,
      });
    }
    for (const tag of doc.tags) {
      if (!tagsMap.has(tag)) tagsMap.set(tag, new Set());
      tagsMap.get(tag)!.add(doc.slug);
    }
    docs.push(doc);
  }

  // D-1 — second pass: register FRONTMATTER relation-ref backlinks (the body
  // pass above only saw markdown links). A ref that resolves to a known doc
  // slug adds a backlink from the declaring doc to that target — deduped by
  // fromSlug in the final assembly below, so a doc that references a target
  // through BOTH a body link and frontmatter keeps the richer body context.
  const slugSet = new Set(docs.map((doc) => doc.slug));
  const tailToSlug = new Map<string, string | null>();
  for (const doc of docs) {
    const tail = doc.slug.split('/').pop() ?? doc.slug;
    // First occurrence wins; a second doc with the same tail marks it ambiguous
    // (null) so `resolveRefToDocSlug` won't guess.
    tailToSlug.set(tail, tailToSlug.has(tail) ? null : doc.slug);
  }
  for (const doc of docs) {
    const seenTargets = new Set<string>();
    for (const ref of frontmatterRefStrings(doc.frontmatter as Record<string, unknown>)) {
      const target = resolveRefToDocSlug(ref, slugSet, tailToSlug);
      // No self-backlinks; dedup repeated refs to the same target within a doc.
      if (!target || target === doc.slug || seenTargets.has(target)) continue;
      seenTargets.add(target);
      if (!backlinksDetailMap.has(target)) backlinksDetailMap.set(target, []);
      backlinksDetailMap.get(target)!.push({
        fromSlug: doc.slug,
        context: `frontmatter · **[${ref}]**`,
        linkText: ref,
      });
    }
  }

  docs.sort((a, b) => a.slug.localeCompare(b.slug, 'ko'));

  const tree: VaultTreeNode = { name: rootName, path: '', type: 'dir' };
  for (const doc of docs) insertIntoTree(tree, doc.slug, doc.title);
  sortTree(tree);

  const backlinksDetail: Record<string, VaultBacklinkEntry[]> = {};
  for (const [slug, list] of backlinksDetailMap) {
    const byFrom = new Map<string, VaultBacklinkEntry>();
    for (const entry of list) {
      if (!byFrom.has(entry.fromSlug)) byFrom.set(entry.fromSlug, entry);
    }
    backlinksDetail[slug] = [...byFrom.values()].sort((a, b) =>
      a.fromSlug.localeCompare(b.fromSlug, 'ko'),
    );
  }
  const tags: Record<string, string[]> = {};
  for (const [tag, set] of tagsMap) {
    tags[tag] = [...set].sort();
  }

  const manifest: VaultManifest = {
    version: '2026-04-23',
    generatedAt: new Date().toISOString(),
    // 상한에 걸리지 않았으면 필드 자체를 두지 않는다 — `false`/`[]` 를 늘 실으면
    // 매니페스트를 비교하는 코드(증분 빌드 · 스냅샷)에 의미 없는 차이가 생긴다.
    ...(walkInfo?.truncated ? { walkTruncated: true } : {}),
    ...(walkInfo?.prunedDirs.length ? { prunedDirs: walkInfo.prunedDirs } : {}),
    docs,
    backlinksDetail,
    tags,
    tree,
  };
  return {
    manifest,
    fileHandles,
    imageHandles,
    fingerprint: fingerprintFromEntries(fingerprintStamps),
  };
}

/** 디렉터리를 walk 하며 모든 .md 본문을 읽어 BuiltVaultEntry[] 로. (전체 I/O) */
async function collectEntries(
  root: FileSystemDirectoryHandle,
  /** 순회의 경계 사실을 매니페스트까지 실어 나르는 자리 — 침묵하지 않기 위해. */
  walkInfo?: { truncated: boolean; prunedDirs: string[] },
): Promise<BuiltVaultEntry[]> {
  const walked = await walkVault(root);
  if (walkInfo) {
    walkInfo.truncated = walked.truncated;
    walkInfo.prunedDirs = walked.prunedDirs;
  }
  const files = walked.entries;
  const entries: BuiltVaultEntry[] = [];
  for (const entry of files) {
    const file = await entry.handle.getFile();
    if (entry.kind === 'image') {
      entries.push({
        relativePath: entry.relativePath,
        lastModified: file.lastModified,
        handle: entry.handle,
        kind: 'image',
      });
      continue;
    }
    const raw = await file.text();
    entries.push(buildMdEntry(entry, raw, file.lastModified));
  }
  return entries;
}

/**
 * 전체 빌드 + 재사용 가능한 entries 를 함께 반환. 호출자(use-local-vault `load`)는
 * entries 를 ref 에 보관했다가 다음 변경 시 증분 재빌드에 넘긴다.
 */
export async function buildLocalManifestWithEntries(
  root: FileSystemDirectoryHandle,
): Promise<{ build: LocalVaultBuild; entries: BuiltVaultEntry[] }> {
  const walkInfo = { truncated: false, prunedDirs: [] as string[] };
  const entries = await collectEntries(root, walkInfo);
  return { build: aggregateBuild(entries, root.name, walkInfo), entries };
}

/**
 * 선택한 로컬 디렉터리에서 마크다운 매니페스트를 빌드. scripts/build-docs-
 * vault.mjs 와 동일한 VaultManifest shape — 공용 뷰어·트리·그래프 그대로.
 */
export async function buildLocalManifest(
  root: FileSystemDirectoryHandle,
): Promise<LocalVaultBuild> {
  const walkInfo = { truncated: false, prunedDirs: [] as string[] };
  const entries = await collectEntries(root, walkInfo);
  return aggregateBuild(entries, root.name, walkInfo);
}

/**
 * 증분 재빌드 — 직전 빌드의 `previous` entries 를 재사용한다. walk 후 각 파일의
 * mtime 만 확인(본문 미독)하고, (relativePath, mtime, kind) 가 직전과 같으면 그
 * entry(doc + link context)를 그대로 재사용 — **본문 재독·재파싱 skip**. 변경/추가
 * 파일만 본문을 다시 읽고, 삭제 파일은 자연히 빠진다. 결과 manifest 는 전체
 * `buildLocalManifest` 와 동치(generatedAt 제외) — `incremental.test.ts` 가
 * add/change/remove/no-op/rename 으로 보증.
 *
 * 가정: 같은 (relativePath, mtime) ⇒ 같은 내용. `computeLocalVaultFingerprint`
 * 기반 skip 로직이 이미 쓰는 가정과 동일.
 */
export async function rebuildLocalManifestIncremental(
  root: FileSystemDirectoryHandle,
  previous: BuiltVaultEntry[],
  /**
   * 이미 받아 둔 네이티브 스탬프(경로→mtime). `refresh()` 는 「바뀌었나」를
   * 판정하려고 방금 같은 걸 걷었으므로, 그걸 넘겨받아 **두 번 걷지 않는다.**
   * 안 넘기면 여기서 직접 한 번 받는다.
   */
  providedStamps?: Map<string, number> | null,
): Promise<{ build: LocalVaultBuild; entries: BuiltVaultEntry[] }> {
  const files = await walk(root);
  const prevByPath = new Map(previous.map((e) => [e.relativePath, e] as const));
  /*
   * **mtime 을 알아내려고 본문을 다리 너머로 끌어오지 않는다** (2026-08-09 실측).
   *
   * 이 함수는 「바뀐 파일만 다시 읽는다」가 존재 이유인데, 정작 *무엇이
   * 바뀌었는지* 알아내려고 **파일마다 `getFile()`** 을 불렀다. Tauri 에서 그건
   * `read_vault_text_file` IPC 왕복이고 그 명령은 본문 전체를 함께 돌려준다 —
   * 위 `computeLocalVaultFingerprint` 주석이 이미 같은 낭비를 지적하며
   * *"쓰이는 것은 숫자 하나인데 볼트 전체가 다리를 건넜다"* 고 적어 둔 그것이다.
   * 그래서 본문 재파싱은 아꼈지만 **전송과 왕복은 하나도 아끼지 못했다.**
   *
   * 설치된 앱 실측: 파일을 하나 고쳤을 때 지도가 따라오기까지
   * **71파일 볼트 2.0초 / 5파일 볼트 0.7초** — 파일 수에 비례했다(건당 ≈20ms,
   * IPC 왕복과 일치). 정작 같은 71파일을 디스크에서 읽는 비용은 **1.8ms** 다.
   *
   * 고치는 방법은 새 네이티브 명령이 아니다 — 경로와 mtime 만 한 번에 주는
   * `vault_fingerprint` 가 **이미 있고 300줄 위에서 쓰고 있다.** 그것으로 먼저
   * 판정하고, mtime 이 다른 파일에만 `getFile()` 을 부른다.
   *
   * 웹에는 그 일괄 API 가 없어 `null` 이 오고 지금까지의 경로로 떨어진다 —
   * `surfaces.md` 의 브리지 관례(없으면 `null`, 조용히 강등) 그대로다.
   */
  let nativeStamps: Map<string, number> | null = providedStamps ?? null;
  if (!nativeStamps) {
    const nativeRoot = (root as { rootPath?: unknown }).rootPath;
    if (typeof nativeRoot === 'string' && nativeRoot) {
      try {
        const native = await nativeVaultFingerprint(nativeRoot);
        if (native) {
          nativeStamps = new Map(
            native.entries.map((e) => [e.relativePath, e.lastModified] as const),
          );
        }
      } catch {
        /* 네이티브 실패 → 아래 파일별 경로로 폴백(동작은 종전과 동일) */
      }
    }
  }
  const entries: BuiltVaultEntry[] = [];
  for (const entry of files) {
    // 네이티브가 이 경로의 mtime 을 알고 그것이 직전과 같으면 **파일을 아예
    // 열지 않는다.** 모르는 경로(방금 생겼거나 목록이 어긋남)는 아래로 흘려
    // 보내 종전과 같이 처리한다 — 「모르면 읽는다」가 안전한 쪽이다.
    const nativeMtime = nativeStamps?.get(entry.relativePath);
    if (nativeMtime !== undefined) {
      const prevNative = prevByPath.get(entry.relativePath);
      if (
        prevNative &&
        prevNative.kind === entry.kind &&
        prevNative.lastModified === nativeMtime
      ) {
        entries.push({ ...prevNative, handle: entry.handle });
        continue;
      }
    }
    const file = await entry.handle.getFile();
    const prev = prevByPath.get(entry.relativePath);
    if (
      prev &&
      prev.kind === entry.kind &&
      prev.lastModified === file.lastModified
    ) {
      // 변경 없음 — 본문 재독 없이 직전 결과 재사용(handle 만 새 walk 것으로).
      entries.push({ ...prev, handle: entry.handle });
      continue;
    }
    if (entry.kind === 'image') {
      entries.push({
        relativePath: entry.relativePath,
        lastModified: file.lastModified,
        handle: entry.handle,
        kind: 'image',
      });
      continue;
    }
    const raw = await file.text();
    entries.push(buildMdEntry(entry, raw, file.lastModified));
  }
  return { build: aggregateBuild(entries, root.name), entries };
}
