import {
  buildExcerpt,
  classifyMode,
  extractHeadings,
  extractOutLinksWithContext,
  firstHeading,
  parseFrontmatter,
} from '@/shared/lib/parse-frontmatter';
import type {
  VaultBacklinkEntry,
  VaultDoc,
  VaultManifest,
  VaultMode,
  VaultTreeNode,
} from '../model/types';

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

async function walk(
  root: FileSystemDirectoryHandle,
  prefix = '',
): Promise<WalkEntry[]> {
  const out: WalkEntry[] = [];
  for await (const [name, handle] of root.entries()) {
    if (name.startsWith('.')) continue;
    if (handle.kind === 'directory') {
      const nested = await walk(
        handle as FileSystemDirectoryHandle,
        prefix ? `${prefix}/${name}` : name,
      );
      out.push(...nested);
    } else if (name.endsWith('.md')) {
      out.push({
        handle: handle as FileSystemFileHandle,
        relativePath: prefix ? `${prefix}/${name}` : name,
        kind: 'md',
      });
    } else if (IMAGE_EXT.test(name)) {
      out.push({
        handle: handle as FileSystemFileHandle,
        relativePath: prefix ? `${prefix}/${name}` : name,
        kind: 'image',
      });
    }
  }
  return out;
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
export async function computeLocalVaultFingerprint(
  root: FileSystemDirectoryHandle,
): Promise<string> {
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
 * 선택한 로컬 디렉터리에서 마크다운 매니페스트를 빌드. scripts/build-docs-
 * vault.mjs 와 동일한 VaultManifest shape — 공용 뷰어·트리·그래프 그대로.
 */
export async function buildLocalManifest(
  root: FileSystemDirectoryHandle,
): Promise<LocalVaultBuild> {
  const files = await walk(root);
  const docs: VaultDoc[] = [];
  const fileHandles = new Map<string, FileSystemFileHandle>();
  const imageHandles = new Map<string, FileSystemFileHandle>();
  const backlinksDetailMap = new Map<string, VaultBacklinkEntry[]>();
  const tagsMap = new Map<string, Set<string>>();
  const fingerprintStamps: Array<{ relativePath: string; lastModified: number }> = [];

  for (const entry of files) {
    if (entry.kind === 'image') {
      imageHandles.set(entry.relativePath, entry.handle);
      const imgFile = await entry.handle.getFile();
      fingerprintStamps.push({
        relativePath: entry.relativePath,
        lastModified: imgFile.lastModified,
      });
      continue;
    }
    const file = await entry.handle.getFile();
    fingerprintStamps.push({
      relativePath: entry.relativePath,
      lastModified: file.lastModified,
    });
    const raw = await file.text();
    const slug = entry.relativePath.replace(/\.md$/, '');
    fileHandles.set(slug, entry.handle);

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

    // 단순 backlinks (deprecated) 는 더 이상 manifest 에 포함하지 않는다.
    // backlinksDetail 만 유지 — 컨텍스트와 함께. linksOut 은 ctx 형태로
    // 아래 backlinksDetailMap 에 들어감.
    void linksOut;
    for (const ctx of linkContexts) {
      if (!backlinksDetailMap.has(ctx.target)) {
        backlinksDetailMap.set(ctx.target, []);
      }
      backlinksDetailMap.get(ctx.target)!.push({
        fromSlug: slug,
        context: ctx.context,
        linkText: ctx.linkText,
      });
    }
    for (const tag of tags) {
      if (!tagsMap.has(tag)) tagsMap.set(tag, new Set());
      tagsMap.get(tag)!.add(slug);
    }

    docs.push({
      slug,
      path: entry.relativePath,
      title,
      description,
      tags,
      frontmatter,
      headings,
      excerpt: buildExcerpt(body),
      wordCount: body.split(/\s+/).filter(Boolean).length,
      updatedAt: new Date(file.lastModified).toISOString(),
      mode: classifyMode(slug) as VaultMode,
      linksOut,
    });
  }

  docs.sort((a, b) => a.slug.localeCompare(b.slug, 'ko'));

  const tree: VaultTreeNode = { name: root.name, path: '', type: 'dir' };
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
