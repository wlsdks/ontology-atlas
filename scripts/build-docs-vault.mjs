#!/usr/bin/env node
// Docs Vault 빌드타임 매니페스트 생성기.
// docs/**/*.md 를 스캔해서:
//  1. public/docs-vault/{slug}.md 로 raw 복사
//  2. src/entities/docs-vault/data/manifest.json 생성 — tree, docs, backlinks, tags
// static export 빌드 중 'next build' 직전에 실행. 런타임 의존성 없음.

import { readFile, writeFile, mkdir, readdir, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './lib/parse-frontmatter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const PUBLIC_OUT = path.join(ROOT, 'public', 'docs-vault');
const MANIFEST_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'manifest.json',
);

export function usage() {
  return [
    'Usage: node scripts/build-docs-vault.mjs [--check]',
    '',
    'Builds the static docs-vault manifest and public markdown copies.',
    '',
    'Options:',
    '  --check     Verify generated outputs are current without writing.',
    '  -h, --help  Show this help text.',
  ].join('\n');
}

function parseArgs(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  if (argv.length > 1) {
    return { error: `Unexpected argument: ${argv[1]}` };
  }
  if (argv[0] && argv[0] !== '--check') {
    return { error: `Unknown option: ${argv[0]}` };
  }
  return { check: argv[0] === '--check' };
}

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walk(full);
      out.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

// parser 는 scripts/lib/parse-frontmatter.mjs 의 단일 진실원에서 import.
// (R11 — 빌드 스크립트 / validator CLI / 런타임 파서 drift 방지)

function slugFromPath(full) {
  const rel = path.relative(DOCS_DIR, full).replace(/\\/g, '/');
  return rel.replace(/\.md$/, '');
}

function firstHeading(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function extractHeadings(body) {
  const lines = body.split('\n');
  const out = [];
  const seen = new Map();
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m) continue;
    const depth = m[1].length;
    const text = m[2].trim();
    const slug = text
      .toLowerCase()
      .replace(/[^\w가-힣\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    const occurrence = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, occurrence);
    out.push({
      depth,
      text,
      slug: occurrence === 1 ? slug : `${slug}-${occurrence}`,
    });
  }
  return out;
}

function buildExcerpt(body) {
  const stripped = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#+\s.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.slice(0, 320);
}

// 링크 추출 — 상대 경로 md 참조 + 옵시디언 wikilinks. 외부 URL·이미지·
// 앵커 only 는 무시. 각 링크마다 targetSlug + 주변 context (120자) 반환.
function extractOutLinksWithContext(body, fromSlug) {
  const slugs = new Set();
  const contexts = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(body))) {
    const target = m[2];
    const linkText = m[1];
    if (!target || target.startsWith('#')) continue;
    if (/^https?:\/\//i.test(target)) continue;
    if (!target.endsWith('.md') && !target.includes('.md#')) continue;
    const [mdPart] = target.split('#');
    const rel = mdPart.replace(/^\.\//, '');
    const fromDir = path.posix.dirname(fromSlug);
    const resolved = path.posix.normalize(
      fromDir === '.' ? rel : `${fromDir}/${rel}`,
    );
    const targetSlug = resolved.replace(/\.md$/, '');
    if (!targetSlug || targetSlug === fromSlug) continue;
    slugs.add(targetSlug);
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    const before = body.slice(Math.max(0, matchStart - 120), matchStart);
    const after = body.slice(matchEnd, matchEnd + 120);
    const raw = `${before}**[${linkText}]**${after}`;
    const context = raw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    contexts.push({ target: targetSlug, context, linkText });
  }
  // Wikilinks [[slug]] / [[slug|text]] / [[slug#anchor]] — vault root slug.
  const wre = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  while ((m = wre.exec(body))) {
    const targetSpec = m[1].trim();
    const [targetSlug] = targetSpec.split('#');
    if (!targetSlug || targetSlug === fromSlug) continue;
    slugs.add(targetSlug);
    const linkText = (m[2] ?? targetSlug).trim();
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    const before = body.slice(Math.max(0, matchStart - 120), matchStart);
    const after = body.slice(matchEnd, matchEnd + 120);
    const raw = `${before}**[${linkText}]**${after}`;
    const context = raw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    contexts.push({ target: targetSlug, context, linkText });
  }
  return { slugs: [...slugs], contexts };
}

function insertIntoTree(root, slug, title) {
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

function sortTree(node) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    // 디렉터리 먼저, 그 다음 파일. 그 안에서는 name 알파벳/한글 순.
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
  for (const c of node.children) sortTree(c);
}

async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

function comparableManifest(manifest) {
  return {
    ...manifest,
    docs: (manifest.docs ?? []).map((doc) => ({
      ...doc,
      updatedAt: '<ignored>',
    })),
    generatedAt: '<ignored>',
  };
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

function comparableDoc(doc) {
  return {
    ...doc,
    updatedAt: '<ignored>',
  };
}

async function assertOutputsCurrent({ manifest, publicFiles }) {
  const issues = [];
  const currentManifest = await readJsonIfExists(MANIFEST_OUT);
  if (!currentManifest) {
    issues.push(`missing ${path.relative(ROOT, MANIFEST_OUT)}`);
  } else if (
    stableStringify(comparableManifest(currentManifest)) !==
    stableStringify(comparableManifest(manifest))
  ) {
    issues.push(`stale ${path.relative(ROOT, MANIFEST_OUT)}`);
  }

  const expectedPublic = new Map(publicFiles.map((file) => [file.relativePath, file.raw]));
  const currentPublicFiles = existsSync(PUBLIC_OUT)
    ? (await walk(PUBLIC_OUT)).map((file) => path.relative(PUBLIC_OUT, file).replace(/\\/g, '/'))
    : [];
  for (const relativePath of currentPublicFiles) {
    if (relativePath.endsWith('.md') && !expectedPublic.has(relativePath)) {
      issues.push(`extra ${path.posix.join('public/docs-vault', relativePath)}`);
    }
  }
  for (const [relativePath, raw] of expectedPublic) {
    const outPath = path.join(PUBLIC_OUT, relativePath);
    try {
      const current = await readFile(outPath, 'utf8');
      if (current !== raw) {
        issues.push(`stale ${path.posix.join('public/docs-vault', relativePath)}`);
      }
    } catch (err) {
      if (err?.code === 'ENOENT') {
        issues.push(`missing ${path.posix.join('public/docs-vault', relativePath)}`);
      } else {
        throw err;
      }
    }
  }

  if (issues.length > 0) {
    console.error('[docs-vault] generated outputs are stale:');
    for (const issue of issues.slice(0, 20)) {
      console.error(`  - ${issue}`);
    }
    if (issues.length > 20) {
      console.error(`  - ... ${issues.length - 20} more`);
    }
    console.error('[docs-vault] run `pnpm docs-vault:build` to refresh them.');
    process.exit(1);
  }
}

async function buildDocsVault({ check = false } = {}) {
  if (!existsSync(DOCS_DIR)) {
    console.error(`[docs-vault] docs/ 디렉터리가 없음: ${DOCS_DIR}`);
    process.exit(1);
  }

  if (!check) {
    // public/docs-vault 를 먼저 비움 — 삭제된 문서가 stale 로 남지 않게
    if (existsSync(PUBLIC_OUT)) {
      await rm(PUBLIC_OUT, { recursive: true, force: true });
    }
    await ensureDir(PUBLIC_OUT);
    await ensureDir(path.dirname(MANIFEST_OUT));
  }

  const files = await walk(DOCS_DIR);
  const previousManifest = await readJsonIfExists(MANIFEST_OUT);
  const previousDocsBySlug = new Map(
    (previousManifest?.docs ?? []).map((doc) => [doc.slug, doc]),
  );
  const docs = [];
  const publicFiles = [];
  // backlinksDetail 만 유지 — 단순 backlinks (deprecated) 는 manifest 에서 제거.
  const backlinksDetailMap = new Map(); // slug -> Array<{ fromSlug, context, linkText }>
  const tagsMap = new Map(); // tag -> Set<slug>

  for (const full of files) {
    const raw = await readFile(full, 'utf8');
    const slug = slugFromPath(full);
    const { frontmatter, body } = parseFrontmatter(raw);
    const headings = extractHeadings(body);
    const title =
      (typeof frontmatter.title === 'string' && frontmatter.title) ||
      firstHeading(body) ||
      slug.split('/').pop();
    const description =
      typeof frontmatter.description === 'string'
        ? frontmatter.description
        : undefined;
    const tags = Array.isArray(frontmatter.tags)
      ? frontmatter.tags
      : typeof frontmatter.tags === 'string'
        ? frontmatter.tags.split(/\s+/).filter(Boolean)
        : [];
    const { slugs: linksOut, contexts: linkContexts } =
      extractOutLinksWithContext(body, slug);
    for (const ctx of linkContexts) {
      if (!backlinksDetailMap.has(ctx.target)) {
        backlinksDetailMap.set(ctx.target, []);
      }
      backlinksDetailMap.get(ctx.target).push({
        fromSlug: slug,
        context: ctx.context,
        linkText: ctx.linkText,
      });
    }
    for (const tag of tags) {
      if (!tagsMap.has(tag)) tagsMap.set(tag, new Set());
      tagsMap.get(tag).add(slug);
    }
    const st = await stat(full);
    const nextDoc = {
      slug,
      path: path.relative(ROOT, full).replace(/\\/g, '/'),
      title,
      description,
      tags,
      frontmatter,
      headings,
      excerpt: buildExcerpt(body),
      wordCount: body.split(/\s+/).filter(Boolean).length,
      updatedAt: st.mtime.toISOString(),
      linksOut,
    };
    const previousDoc = previousDocsBySlug.get(slug);
    if (
      previousDoc &&
      stableStringify(comparableDoc(previousDoc)) ===
        stableStringify(comparableDoc(nextDoc))
    ) {
      nextDoc.updatedAt = previousDoc.updatedAt;
    }
    docs.push(nextDoc);

    publicFiles.push({ relativePath: `${slug}.md`, raw });

    if (!check) {
      // raw md 를 public/docs-vault 아래 slug 로 복사. 경로의 서브디렉토리까지 생성.
      const outPath = path.join(PUBLIC_OUT, `${slug}.md`);
      await ensureDir(path.dirname(outPath));
      await writeFile(outPath, raw, 'utf8');
    }
  }

  docs.sort((a, b) => a.slug.localeCompare(b.slug, 'ko'));

  const tree = { name: 'docs', path: '', type: 'dir' };
  for (const doc of docs) insertIntoTree(tree, doc.slug, doc.title);
  sortTree(tree);

  const backlinksDetail = {};
  for (const [slug, list] of backlinksDetailMap) {
    // fromSlug 로 그룹 후 첫 컨텍스트만 유지 (한 문서에서 여러 번 인용해도
    // 한 줄만 보여줌). fromSlug 알파벳 순 정렬.
    const byFrom = new Map();
    for (const entry of list) {
      if (!byFrom.has(entry.fromSlug)) byFrom.set(entry.fromSlug, entry);
    }
    backlinksDetail[slug] = [...byFrom.values()].sort((a, b) =>
      a.fromSlug.localeCompare(b.fromSlug, 'ko'),
    );
  }
  const tags = {};
  for (const [tag, set] of tagsMap) {
    tags[tag] = [...set].sort();
  }

  const manifest = {
    version: '2026-04-23',
    generatedAt: new Date().toISOString(),
    docs,
    backlinksDetail,
    tags,
    tree,
  };
  if (
    previousManifest &&
    stableStringify(comparableManifest(previousManifest)) ===
      stableStringify(comparableManifest(manifest))
  ) {
    manifest.generatedAt = previousManifest.generatedAt;
  }

  if (check) {
    await assertOutputsCurrent({ manifest, publicFiles });
    console.log(
      `[docs-vault] current · ${docs.length} docs · ${Object.keys(backlinksDetail).length} backlinked · ${Object.keys(tags).length} tags`,
    );
    return;
  }

  await writeFile(MANIFEST_OUT, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(
    `[docs-vault] ${docs.length} docs · ${Object.keys(backlinksDetail).length} backlinked · ${Object.keys(tags).length} tags → ${path.relative(ROOT, MANIFEST_OUT)}`,
  );
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.error) {
    console.error(args.error);
    console.error(usage());
    process.exit(2);
  }
  await buildDocsVault({ check: args.check });
}

main().catch((err) => {
  console.error('[docs-vault] build failed:', err);
  process.exit(1);
});
