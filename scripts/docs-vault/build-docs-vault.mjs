#!/usr/bin/env node
// Docs vault build-time manifest generator. Scans docs/**/*.md and emits:
//  1. raw copies at public/docs-vault/{slug}.md
//  2. src/entities/docs-vault/data/manifest.json — tree, docs, backlinks, tags
//     (headings are split into manifest.headings.json for bundle size — only
//     `/docs` imports them dynamically)
//  3. src/entities/docs-vault/data/content.json — desktop/static-export fallback
//  4. src/entities/docs-vault/data/gateway-content.json — the gateway's synchronous guide/* fallback
//  5. src/entities/docs-vault/data/gateway-changelog.json — /changelog's
//     synchronous preview (recent sections + how many were folded)
// Runs just before `next build` during the static export. No runtime dependencies.

import { readFile, writeFile, mkdir, readdir, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';
import { readPoPilotSource } from '../lib/records/po-pilot-records.mjs';
import { readLedgerSource } from '../lib/records/record-ledgers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
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
const CONTENT_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'content.json',
);
// The gateway needs body text synchronously before first paint, so only guide/* goes into this
// small map; other documents are raw assets in public/docs-vault. The CHANGELOG is cut to a few
// recent sections to stay inside the chunk budget (max 1.5MiB); `/docs` reads the full file.
const GATEWAY_CONTENT_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'gateway-content.json',
);
const GATEWAY_CHANGELOG_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'gateway-changelog.json',
);
// How many CHANGELOG sections go into the bundle. It must exceed the screen's display limit
// (RECENT_SECTIONS = 12 in `app/(gateway)/[locale]/changelog/page.tsx`): the screen trims once more
// and adds the fold counts, so a higher screen limit makes the excess invisible.
export const GATEWAY_CHANGELOG_KEEP_SECTIONS = 16;
// Only `/docs` uses the headings, yet 263KB of them rode in the chunk shared by every route: the
// bundled manifest is emptied of them and a slug → headings map is emitted for `/docs` to import
// dynamically. The local mode manifest (the user's vault) keeps headings inline.
const MANIFEST_HEADINGS_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'manifest.headings.json',
);
const STOREFRONT_HEADINGS_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'sample-storefront.headings.json',
);
// `samples/storefront/` is built as its own manifest/content pair so a non-developer sees an example
// business instead of the dogfood vault. The dogfood output is never touched, and no public raw
// copies are produced for storefront.
const SAMPLES_STOREFRONT_DIR = path.join(ROOT, 'samples', 'storefront');
const STOREFRONT_MANIFEST_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'sample-storefront.manifest.json',
);
const STOREFRONT_CONTENT_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'sample-storefront.content.json',
);
/** Is this a shallow (depth-limited) clone? False when git is absent or this is not a repository. */
export function isShallowRepository(rootDir) {
  try {
    return (
      execSync('git rev-parse --is-shallow-repository', {
        cwd: rootDir,
        encoding: 'utf-8',
      }).trim() === 'true'
    );
  } catch {
    return false;
  }
}

/**
 * Per-document "last changed": the date of the commit that last touched the file (`%cs`, YYYY-MM-DD
 * in the commit's own timezone). Date, not timestamp: the value is committed alongside that commit,
 * whose timestamp is unknowable at generation time, and squash-merge, rebase and amend restamp it.
 * At date precision a restamp lands on the same day, so the value is unchanged and two PRs on one
 * day auto-merge. Every consumer works at day granularity or coarser.
 */
function gitLastCommitDays(rootDir, scopeDir) {
  const days = new Map();
  // How many commits touched each path — a document's `revision`. Counted in the
  // same pass as the dates, so no field is ever hand-bumped.
  const commits = new Map();
  const dirty = new Set();
  try {
    const scope = path.relative(rootDir, scopeDir).replace(/\\/g, '/') || '.';
    // A depth-1 checkout treats the single commit as a parentless root, so `--name-only` attributes the
    // entire tree to it and the freshness lens goes flat. CI must use `fetch-depth: 0`.
    if (isShallowRepository(rootDir)) {
      console.warn(
        '[docs-vault] shallow git clone: every document date collapses to the same day. Check out full history (CI: fetch-depth: 0).',
      );
    }
    const log = execSync(`git log --format=%x01%cs --name-only -- "${scope}"`, {
      cwd: rootDir,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    });
    let currentDay = null;
    for (const line of log.split('\n')) {
      if (line.startsWith('\x01')) {
        currentDay = line.slice(1).trim();
        continue;
      }
      const file = line.trim();
      if (!file || !currentDay) continue;
      if (!days.has(file)) days.set(file, currentDay);
      commits.set(file, (commits.get(file) ?? 0) + 1);
    }
    const status = execSync(`git status --porcelain -- "${scope}"`, {
      cwd: rootDir,
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    });
    for (const line of status.split('\n')) {
      // A staged rename reads `old -> new`; the document now lives at the new path.
      const file = line.slice(3).trim().split(' -> ').pop();
      if (file) dirty.add(file);
    }
  } catch {
    // No git, or not a repository (a release tarball) — fall back to the mtime date.
  }
  return { days, commits, dirty };
}

/**
 * A document's revision: the commits that touched its path, plus those that touched
 * the path it had before a move (`docs/.moved.json`), plus one while it has
 * uncommitted edits — so the number a pre-commit build writes is the number the
 * commit then makes true. Git is the counter; two branches never edit one line.
 */
export function documentRevision(relPath, { commits, dirty }, movedFrom = {}) {
  let count = commits.get(relPath) ?? 0;
  let former = movedFrom[relPath];
  const seen = new Set([relPath]);
  while (former && !seen.has(former)) {
    seen.add(former);
    count += commits.get(former) ?? 0;
    former = movedFrom[former];
  }
  return count + (dirty.has(relPath) ? 1 : 0);
}

/**
 * `YYYY-MM-DD` in the local timezone, matching `%cs` (the commit's own timezone): truncating in UTC
 * would record a KST-morning edit as "yesterday". Used only for dirty or untracked documents, so the
 * machine-timezone dependence stays in the author's working tree.
 */
export function localDayStamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function usage() {
  return [
    'Usage: node scripts/docs-vault/build-docs-vault.mjs [--check]',
    '',
    'Builds the static docs-vault manifest and public markdown copies.',
    '',
    'Options:',
    '  --check     Verify generated outputs are current without writing.',
    '  -h, --help  Show this help text.',
  ].join('\n');
}

export function parseArgs(argv = process.argv.slice(2)) {
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

// Directories under docs/ that must not ship. `analyses/` and `records/` are this repository's own
// committed working output; bundling them would grow the shipped app against a static budget.
// Skipped at any depth.
const NOT_PRODUCT_DOCS = new Set(['analyses', 'records']);

// Top-level docs/ folders that stay in the repository but leave the app: dated
// evidence (`archive`, `audits`, `benchmark`), superseded drafts (`prototypes`),
// plans and marketing copy (`plans`, `launch`). A reader of the in-app Library
// wants the current product documents; these cost about a fifth of the bundled
// manifest. A link to one of them still works in the app, because an unknown
// slug resolves to its GitHub page (`src/widgets/docs-vault/lib/resolve-doc-link.ts`).
const NOT_SHIPPED_TOP_DIRS = new Set(['archive', 'audits', 'benchmark', 'plans', 'prototypes', 'launch']);

// `product: false` lists every Markdown file under `dir` with no exclusion; the
// staleness check uses it on the public output so a leftover file is reported.
async function walk(dir, { root = dir, product = true } = {}) {
  const out = [];
  // Sorted by name: readdir order is not guaranteed, and an unsorted walk would make key order
  // machine-dependent, so "same source, same bytes" could report stale.
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const atRoot = dir === root;
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (product && entry.isDirectory() && NOT_PRODUCT_DOCS.has(entry.name)) {
      // The recording guide is linked by composed ledgers; fragments are consumed there.
      const guide = path.join(dir, entry.name, 'README.md');
      if (entry.name === 'records' && existsSync(guide)) out.push(guide);
      continue;
    }
    if (product && atRoot && entry.isDirectory() && NOT_SHIPPED_TOP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walk(full, { root, product });
      out.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

// The parser is imported from the single source of truth in
// scripts/lib/parse-frontmatter.mjs, so the build script, the validator CLI, and
// the runtime parser cannot drift apart.

function slugFromPath(full, baseDir = DOCS_DIR) {
  const rel = path.relative(baseDir, full).replace(/\\/g, '/');
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

function buildDefinitionPreview(
  body,
  frontmatter,
  max = 320,
) {
  const titles = Object.entries(frontmatter)
    .filter(([key, value]) => (key === 'title' || key.startsWith('display_')) && typeof value === 'string')
    .map(([, value]) => value.trim());
  const lines = body.split(/\r?\n/);
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index += 1;
  const heading = lines[index]?.match(/^ {0,3}#\s+(.+?)(?:\s+#+)?\s*$/);
  if (heading && titles.includes(heading[1].trim())) {
    index += 1;
    while (index < lines.length && !lines[index].trim()) index += 1;
  }
  if (/^ {0,3}##[ \t]+Definition(?:[ \t]+#+)?[ \t]*$/.test(lines[index] ?? '')) {
    index += 1;
    while (index < lines.length && !lines[index].trim()) index += 1;
  }
  const paragraph = [];
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) break;
    if (/^(?:=+|-+)\s*$/.test(trimmed) || /^\|?\s*:?-{3,}/.test(trimmed)) return undefined;
    if (/^(?: {4}|\t)/.test(line)) {
      if (!paragraph.length) return undefined;
      paragraph.push(trimmed);
      continue;
    }
    if (/^(?:\||<|!\[|\[[^\]]+\]:)/.test(trimmed)) return undefined;
    if (/^(?:#{1,6}(?:\s|$)|>|`{3,}|~{3,}|[-+*]\s|\d+[.)]\s|(?:\*\s*){3,}$|(?:_\s*){3,}$)/.test(trimmed)) break;
    paragraph.push(trimmed);
  }
  const preview = paragraph.join(' ').replace(/\s+/g, ' ').trim();
  return preview && preview.length <= max ? preview : undefined;
}

function buildExcerpt(body) {
  // Kept in sync with src/shared/lib/vault-document/parse-frontmatter.ts buildExcerpt. Strip
  // markdown table separator/hr rows and turn cell pipes into middot separators
  // so a table body reads as prose instead of a wall of `|` pipes.
  const stripped = body
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks
    .replace(/^#+\s.*$/gm, '') // headings
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → link text
    .replace(/^[\s|:-]*-{2,}[\s|:-]*$/gm, '') // table separator / hr rows
    .replace(/\s*\|\s*/g, ' · ') // table cell pipes → middot separators
    .replace(/^\s*[-•]\s+/gm, '') // list bullets
    // `#` stays: heading marks are already gone, and `path.tsx#Symbol` needs its separator.
    .replace(/[*_`>]/g, '') // residual emphasis / quote marks
    .replace(/\s+/g, ' ') // collapse whitespace
    .replace(/(?:·\s*){2,}/g, '· ') // collapse middot runs from empty cells
    .replace(/^[\s·]+|[\s·]+$/g, '') // trim leading/trailing middots
    .trim();
  return stripped.slice(0, 320);
}

// Normalises a wikilink target against the vault the document belongs to. Mirrors
// `resolveWikilinkTargetSlug` in src/shared/lib/vault-document/parse-frontmatter.ts, physically
// duplicated with no contract test: apply a fix in both.
// Wikilinks inside the nested docs/ontology/ vault are relative to its root (`capabilities/x`), but
// the merged `/docs` slug carries an `ontology/` prefix; without the correction backlinksDetail keys
// diverge and backlinks go missing.
export function resolveWikilinkTargetSlug(targetSlug, fromSlug) {
  if (fromSlug.startsWith('ontology/') && !targetSlug.startsWith('ontology/')) {
    return `ontology/${targetSlug}`;
  }
  return targetSlug;
}

export function extractOutLinksWithContext(body, fromSlug) {
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
  // Wikilinks [[slug]] / [[slug|text]] / [[slug#anchor]] — vault root slug
  // (inside the nested ontology/ vault these are relative to that vault's root —
  // see resolveWikilinkTargetSlug above).
  const wre = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  while ((m = wre.exec(body))) {
    const targetSpec = m[1].trim();
    const [rawTargetSlug] = targetSpec.split('#');
    if (!rawTargetSlug) continue;
    const targetSlug = resolveWikilinkTargetSlug(rawTargetSlug, fromSlug);
    if (!targetSlug || targetSlug === fromSlug) continue;
    slugs.add(targetSlug);
    const linkText = (m[2] ?? rawTargetSlug).trim();
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
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
  for (const c of node.children) sortTree(c);
}

async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

// The stamp is the most recent `updatedAt` date among source documents, never the build wall clock
// (two open PRs would always conflict on the third line). Fixed fallback when no document has a date.
const STABLE_GENERATED_AT_FALLBACK = '1970-01-01';
export function deterministicGeneratedAt(docs) {
  const days = (docs ?? [])
    .map((doc) => doc?.updatedAt)
    .filter((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (days.length === 0) return STABLE_GENERATED_AT_FALLBACK;
  return days.reduce((a, b) => (a >= b ? a : b));
}

/**
 * Keeps the first `limit` `## ` sections. Must match `trimToRecentSections` in
 * `src/views/gateway-doc/lib/vault-doc.ts` (the screen trims once more, so differing boundaries make
 * the fold count a lie); `tests/contract/vault-data/bundled-vault-budget.contract.test.ts` proves it.
 */
export function trimToRecentSections(markdown, limit) {
  const lines = markdown.split('\n');
  const boundaries = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence && /^## (?!#)/.test(line)) boundaries.push(i);
  }

  if (boundaries.length <= limit) return { body: markdown, omittedSections: 0 };

  const cutAt = boundaries[limit];
  return {
    body: lines.slice(0, cutAt).join('\n').trimEnd(),
    omittedSections: boundaries.length - limit,
  };
}

/**
 * Splits headings out of the bundled manifest: the manifest's docs get
 * `headings: []` and the removed headings come back as a slug → headings map.
 * Empty arrays are omitted from the map — they cost bytes and carry no
 * information.
 */
export function splitManifestHeadings(manifest) {
  const headingsBySlug = {};
  const docs = manifest.docs.map((doc) => {
    if (Array.isArray(doc.headings) && doc.headings.length > 0) {
      headingsBySlug[doc.slug] = doc.headings;
    }
    return { ...doc, headings: [] };
  });
  return { manifest: { ...manifest, docs }, headingsBySlug };
}

/**
 * `{ oldSlug: newSlug }` for every document `docs/.moved.json` moved to a slug the
 * app still ships. A `?slug=` deep link, a pin or a recent entry saved before the
 * move keeps opening the document (`resolveDocsVaultSlugAlias`).
 */
export function movedSlugAliases(movedMap, shippedSlugs) {
  const aliases = {};
  for (const [from, to] of Object.entries(movedMap ?? {})) {
    const oldSlug = from.replace(/^docs\//, '').replace(/\.md$/, '');
    const newSlug = to.replace(/^docs\//, '').replace(/\.md$/, '');
    if (shippedSlugs.has(newSlug)) aliases[oldSlug] = newSlug;
  }
  return Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function comparableManifest(manifest) {
  return {
    ...manifest,
    docs: (manifest.docs ?? []).map((doc) => ({
      ...doc,
      updatedAt: '<ignored>',
      ...('revision' in doc ? { revision: '<ignored>' } : {}),
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

export function comparableDoc(doc) {
  return {
    ...doc,
    updatedAt: '<ignored>',
  };
}

async function latestInputDay(inputs, rootDir, gitDays) {
  const days = [];
  for (const relativePath of inputs) {
    const committedDay = gitDays.dirty.has(relativePath)
      ? null
      : gitDays.days.get(relativePath);
    if (committedDay) {
      days.push(committedDay);
      continue;
    }
    try {
      const inputStat = await stat(path.join(rootDir, relativePath));
      const day = localDayStamp(inputStat.mtime);
      if (day) days.push(day);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return days.length > 0 ? days.reduce((left, right) => left >= right ? left : right) : null;
}

async function assertOutputsCurrent({
  manifest,
  headingsBySlug,
  content,
  gatewayContent,
  gatewayChangelog,
  publicFiles,
}) {
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

  const currentHeadings = await readJsonIfExists(MANIFEST_HEADINGS_OUT);
  if (!currentHeadings) {
    issues.push(`missing ${path.relative(ROOT, MANIFEST_HEADINGS_OUT)}`);
  } else if (stableStringify(currentHeadings) !== stableStringify(headingsBySlug)) {
    issues.push(`stale ${path.relative(ROOT, MANIFEST_HEADINGS_OUT)}`);
  }

  const currentGatewayChangelog = await readJsonIfExists(GATEWAY_CHANGELOG_OUT);
  if (!currentGatewayChangelog) {
    issues.push(`missing ${path.relative(ROOT, GATEWAY_CHANGELOG_OUT)}`);
  } else if (
    stableStringify(currentGatewayChangelog) !== stableStringify(gatewayChangelog)
  ) {
    issues.push(`stale ${path.relative(ROOT, GATEWAY_CHANGELOG_OUT)}`);
  }

  const currentContent = await readJsonIfExists(CONTENT_OUT);
  if (!currentContent) {
    issues.push(`missing ${path.relative(ROOT, CONTENT_OUT)}`);
  } else if (stableStringify(currentContent) !== stableStringify(content)) {
    issues.push(`stale ${path.relative(ROOT, CONTENT_OUT)}`);
  }

  const currentGatewayContent = await readJsonIfExists(GATEWAY_CONTENT_OUT);
  if (!currentGatewayContent) {
    issues.push(`missing ${path.relative(ROOT, GATEWAY_CONTENT_OUT)}`);
  } else if (
    stableStringify(currentGatewayContent) !== stableStringify(gatewayContent)
  ) {
    issues.push(`stale ${path.relative(ROOT, GATEWAY_CONTENT_OUT)}`);
  }

  const expectedPublic = new Map(publicFiles.map((file) => [file.relativePath, file.raw]));
  const currentPublicFiles = existsSync(PUBLIC_OUT)
    ? (await walk(PUBLIC_OUT, { product: false })).map((file) => path.relative(PUBLIC_OUT, file).replace(/\\/g, '/'))
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

/**
 * Shared core that scans one vault directory (docs/ or samples/storefront/) and assembles manifest /
 * content / publicFiles. With `publicOutDir` given and `check` false, raw md is copied beneath it
 * (storefront passes `null`). Exported because the determinism contract test passes a temporary git
 * repository as `rootDir`/`dir` to prove that rewriting commit times within the same day yields
 * byte-identical output (`check: true` writes nothing).
 */
/**
 * The canonical meaning judgements, loaded if this checkout has them: they live in `mcp/src` and are
 * imported rather than retyped, so the static manifest and the app's builder share one rule. The
 * import is dynamic and optional because the `prepare` hook copies this script alone into a bare
 * worktree (no `mcp/`), where a static import is a module-resolution crash.
 */
const meaningRules = await (async () => {
  try {
    const [findings, schema] = await Promise.all([
      import('../../mcp/src/meaning/meaning-findings.mjs'),
      import('../../mcp/src/schema.mjs'),
    ]);
    return { findings, folderForKind: schema.folderForKind };
  } catch {
    return null;
  }
})();

if (!meaningRules) {
  console.warn(
    '[docs-vault] mcp/src is not in this checkout: meaning findings are recorded as null (not computed), not as an empty list.',
  );
}

/**
 * The meaning findings for one document, as portable codes: `undefined` (no `kind:`, never a node),
 * `null` (a node, rule unavailable, nothing measured), or an array (the rule ran; empty means nothing found).
 * Mirrors `meaningFindings` in `src/shared/lib/vault-document/meaning-findings.ts`; the canonical rules
 * live in `mcp/src/meaning/meaning-findings.mjs`, except `slug-outside-kind-folder`, which sits in the
 * write gate and is read from the schema (`tests/contract/analysis/meaning-findings-parity.contract.test.ts`).
 * `folder-only-evidence` is absent on both paths: it asks the filesystem whether a cited path is a
 * directory, which the browser cannot.
 */
function meaningFindingCodes({ kind, slug, title, body }) {
  if (typeof kind !== 'string' || !kind.trim()) return undefined;
  if (!meaningRules) return null;
  const input = { kind, slug: slug ?? '', title: title ?? '', body: body ?? '' };
  const codes = meaningRules.findings.bodyMeaningFindings(input).map((finding) => finding.code);
  const folder = meaningRules.folderForKind(kind);
  if (slug && folder && !slug.startsWith(folder)) {
    codes.push('slug-outside-kind-folder');
  }
  return codes;
}

export async function scanVaultDir(
  dir,
  {
    rootDir = ROOT,
    publicOutDir = null,
    check = false,
    treeName = 'docs',
    sourceReaders = [readLedgerSource, readPoPilotSource],
    /** The part of a manifest slug outside the vault the agent is handed: an ontology node reads `ontology/capabilities/…` here and `capabilities/…` there, and `slug-outside-kind-folder` needs the latter (the subtraction `StaticVaultSource.agentSlugPrefix` makes). */
    vaultSlugPrefix = '',
    /** `{ newRepoPath: oldRepoPath }` from `docs/.moved.json`, so a revision count survives a move. */
    movedFrom = {},
  } = {},
) {
  const files = await walk(dir);
  const gitDays = gitLastCommitDays(rootDir, dir);
  const docs = [];
  const publicFiles = [];
  const content = {};
  const backlinksDetailMap = new Map(); // slug -> Array<{ fromSlug, context, linkText }>
  const tagsMap = new Map(); // tag -> Set<slug>

  for (const full of files) {
    const relPath = path.relative(rootDir, full).replace(/\\/g, '/');
    let composed = null;
    for (const reader of sourceReaders) {
      composed = reader(relPath, { root: rootDir });
      if (composed) break;
    }
    const raw = composed?.content ?? await readFile(full, 'utf8');
    const slug = slugFromPath(full, dir);
    const { frontmatter, body, diagnostics } = parseFrontmatter(raw);
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
    const inputPaths = composed?.inputs ?? [relPath];
    const updatedAt = await latestInputDay(inputPaths, rootDir, gitDays);
    // A composed ledger has many inputs and no single history; it carries no revision.
    const revision = composed ? null : documentRevision(relPath, gitDays, movedFrom);
    // Asked where the body is already in hand, exactly as `buildMdEntry` does it.
    const vaultSlug =
      vaultSlugPrefix && slug.startsWith(vaultSlugPrefix)
        ? slug.slice(vaultSlugPrefix.length)
        : slug;
    const meaningCodes = meaningFindingCodes({
      kind: frontmatter.kind,
      slug: vaultSlug,
      title,
      body,
    });
    const nextDoc = {
      slug,
      path: relPath,
      title,
      description,
      tags,
      frontmatter,
      ...(diagnostics && diagnostics.length > 0 ? { diagnostics } : {}),
      headings,
      excerpt: buildExcerpt(body),
      definitionPreview: buildDefinitionPreview(body, frontmatter),
      // `null` is recorded, not dropped: "nobody asked" and "asked and clean" must not
      // read the same downstream.
      ...(meaningCodes === undefined ? {} : { meaningFindings: meaningCodes }),
      wordCount: body.split(/\s+/).filter(Boolean).length,
      // Commit date wins; the mtime date is used only for documents that are dirty in
      // the working tree or still untracked. Both are dates, so the value is stable as
      // long as the edit and its merge land on the same day.
      updatedAt: updatedAt ?? STABLE_GENERATED_AT_FALLBACK,
      ...(revision ? { revision } : {}),
      linksOut,
    };
    // Nothing is carried over from the previous manifest: output depending on its own earlier output
    // breaks "same input, same bytes". Date precision already absorbs mtime jitter.
    docs.push(nextDoc);

    publicFiles.push({ relativePath: `${slug}.md`, raw });
    content[slug] = raw;

    if (!check && publicOutDir) {
      const outPath = path.join(publicOutDir, `${slug}.md`);
      await ensureDir(path.dirname(outPath));
      await writeFile(outPath, raw, 'utf8');
    }
  }

  // Register frontmatter relation-ref backlinks (mirrors `src/entities/docs-vault/lib/local-manifest/md-entry.ts`):
  // the body pass sees only markdown links, so a doc referenced purely through frontmatter showed no
  // backlinks. Same relation-key set as the MCP `find_backlinks`; deduped by fromSlug below, so a body
  // link to the same target keeps its richer context.
  {
    const RELATION_REF_ARRAY_KEYS = [
      'domains',
      'capabilities',
      'elements',
      'dependencies',
      'relates',
      'contains',
      'describes',
    ];
    const RELATION_REF_STRING_KEYS = ['domain'];
    const slugSet = new Set(docs.map((doc) => doc.slug));
    const tailToSlug = new Map(); // tail -> slug | null (null = ambiguous)
    for (const doc of docs) {
      const tail = doc.slug.split('/').pop() ?? doc.slug;
      tailToSlug.set(tail, tailToSlug.has(tail) ? null : doc.slug);
    }
    const refStrings = (frontmatter) => {
      const out = [];
      for (const key of RELATION_REF_ARRAY_KEYS) {
        const value = frontmatter[key];
        if (Array.isArray(value)) {
          for (const item of value)
            if (typeof item === 'string' && item.trim()) out.push(item.trim());
        } else if (typeof value === 'string' && value.trim()) {
          out.push(value.trim());
        }
      }
      for (const key of RELATION_REF_STRING_KEYS) {
        const value = frontmatter[key];
        if (typeof value === 'string' && value.trim()) out.push(value.trim());
      }
      return out;
    };
    const resolveRef = (ref) => {
      const normalized = ref.replace(/\.md$/i, '');
      if (slugSet.has(normalized)) return normalized;
      const tail = normalized.split('/').pop() ?? normalized;
      return tailToSlug.get(tail) ?? null;
    };
    for (const doc of docs) {
      const seenTargets = new Set();
      for (const ref of refStrings(doc.frontmatter)) {
        const target = resolveRef(ref);
        if (!target || target === doc.slug || seenTargets.has(target)) continue;
        seenTargets.add(target);
        if (!backlinksDetailMap.has(target)) backlinksDetailMap.set(target, []);
        backlinksDetailMap.get(target).push({
          fromSlug: doc.slug,
          context: `frontmatter · **[${ref}]**`,
          linkText: ref,
        });
      }
    }
  }

  docs.sort((a, b) => a.slug.localeCompare(b.slug, 'ko'));

  const tree = { name: treeName, path: '', type: 'dir' };
  for (const doc of docs) insertIntoTree(tree, doc.slug, doc.title);
  sortTree(tree);

  const backlinksDetail = {};
  for (const [slug, list] of backlinksDetailMap) {
    // Group by fromSlug and keep only the first context, so a document citing the
    // target several times still shows one line. Sorted by fromSlug.
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
    // Never the build wall clock and never the previous output (see `deterministicGeneratedAt`).
    generatedAt: deterministicGeneratedAt(docs),
    docs,
    backlinksDetail,
    tags,
    tree,
  };

  // The CHANGELOG ships as the gateway-changelog.json preview rather than in full —
  // see the GATEWAY_CHANGELOG_OUT comment at the top of this file.
  const gatewayContent = Object.fromEntries(
    Object.entries(content).filter(([slug]) => slug.startsWith('guide/')),
  );

  return { manifest, content, gatewayContent, publicFiles };
}

async function buildDocsVault({ check = false } = {}) {
  if (!existsSync(DOCS_DIR)) {
    console.error(`[docs-vault] no docs/ directory: ${DOCS_DIR}`);
    process.exit(1);
  }

  if (!check) {
    // Empty public/docs-vault first so deleted documents cannot linger
    if (existsSync(PUBLIC_OUT)) {
      await rm(PUBLIC_OUT, { recursive: true, force: true });
    }
    await ensureDir(PUBLIC_OUT);
    await ensureDir(path.dirname(MANIFEST_OUT));
  }

  const movedFile = path.join(DOCS_DIR, '.moved.json');
  const movedMap = existsSync(movedFile) ? JSON.parse(await readFile(movedFile, 'utf8')) : {};
  const scanned = await scanVaultDir(DOCS_DIR, {
    rootDir: ROOT,
    publicOutDir: PUBLIC_OUT,
    check,
    vaultSlugPrefix: 'ontology/',
    movedFrom: Object.fromEntries(Object.entries(movedMap).map(([from, to]) => [to, from])),
  });
  const { content, gatewayContent, publicFiles } = scanned;
  // The bundled manifest ships with headings split into a separate file — see the
  // MANIFEST_HEADINGS_OUT comment at the top of this file.
  const split = splitManifestHeadings(scanned.manifest);
  const { headingsBySlug } = split;
  const aliases = movedSlugAliases(movedMap, new Set(split.manifest.docs.map((doc) => doc.slug)));
  const manifest = Object.keys(aliases).length > 0 ? { ...split.manifest, aliases } : split.manifest;
  const { docs, backlinksDetail, tags } = manifest;
  const changelogRaw = content['CHANGELOG'];
  if (typeof changelogRaw !== 'string') {
    console.error('[docs-vault] docs/CHANGELOG.md is not in the scan: the gateway preview cannot be built.');
    process.exit(1);
  }
  const gatewayChangelog = trimToRecentSections(
    changelogRaw,
    GATEWAY_CHANGELOG_KEEP_SECTIONS,
  );

  if (check) {
    await assertOutputsCurrent({
      manifest,
      headingsBySlug,
      content,
      gatewayContent,
      gatewayChangelog,
      publicFiles,
    });
    console.log(
      `[docs-vault] current · ${docs.length} docs · ${Object.keys(backlinksDetail).length} backlinked · ${Object.keys(tags).length} tags`,
    );
    return;
  }

  await writeFile(MANIFEST_OUT, JSON.stringify(manifest, null, 2), 'utf8');
  await writeFile(MANIFEST_HEADINGS_OUT, JSON.stringify(headingsBySlug, null, 2), 'utf8');
  await writeFile(CONTENT_OUT, JSON.stringify(content, null, 2), 'utf8');
  await writeFile(GATEWAY_CONTENT_OUT, JSON.stringify(gatewayContent, null, 2), 'utf8');
  await writeFile(GATEWAY_CHANGELOG_OUT, JSON.stringify(gatewayChangelog, null, 2), 'utf8');
  console.log(
    `[docs-vault] ${docs.length} docs · ${Object.keys(backlinksDetail).length} backlinked · ${Object.keys(tags).length} tags → ${path.relative(ROOT, MANIFEST_OUT)}`,
  );
}

/** Builds the storefront sample vault: only its own manifest/content pair, no public raw copies and no PUBLIC_OUT reset. */
async function buildStorefrontSample({ check = false } = {}) {
  if (!existsSync(SAMPLES_STOREFRONT_DIR)) {
    console.error(`[docs-vault] no samples/storefront/ directory: ${SAMPLES_STOREFRONT_DIR}`);
    process.exit(1);
  }

  if (!check) {
    await ensureDir(path.dirname(STOREFRONT_MANIFEST_OUT));
  }

  const scanned = await scanVaultDir(SAMPLES_STOREFRONT_DIR, {
    rootDir: ROOT,
    publicOutDir: null,
    check,
    treeName: 'storefront',
  });
  const { content } = scanned;
  const { manifest, headingsBySlug } = splitManifestHeadings(scanned.manifest);

  if (check) {
    const issues = [];
    const currentManifest = await readJsonIfExists(STOREFRONT_MANIFEST_OUT);
    if (!currentManifest) {
      issues.push(`missing ${path.relative(ROOT, STOREFRONT_MANIFEST_OUT)}`);
    } else if (
      stableStringify(comparableManifest(currentManifest)) !==
      stableStringify(comparableManifest(manifest))
    ) {
      issues.push(`stale ${path.relative(ROOT, STOREFRONT_MANIFEST_OUT)}`);
    }
    const currentHeadings = await readJsonIfExists(STOREFRONT_HEADINGS_OUT);
    if (!currentHeadings) {
      issues.push(`missing ${path.relative(ROOT, STOREFRONT_HEADINGS_OUT)}`);
    } else if (stableStringify(currentHeadings) !== stableStringify(headingsBySlug)) {
      issues.push(`stale ${path.relative(ROOT, STOREFRONT_HEADINGS_OUT)}`);
    }
    const currentContent = await readJsonIfExists(STOREFRONT_CONTENT_OUT);
    if (!currentContent) {
      issues.push(`missing ${path.relative(ROOT, STOREFRONT_CONTENT_OUT)}`);
    } else if (stableStringify(currentContent) !== stableStringify(content)) {
      issues.push(`stale ${path.relative(ROOT, STOREFRONT_CONTENT_OUT)}`);
    }
    if (issues.length > 0) {
      console.error('[docs-vault] storefront sample outputs are stale:');
      for (const issue of issues) console.error(`  - ${issue}`);
      console.error('[docs-vault] run `pnpm docs-vault:build` to refresh them.');
      process.exit(1);
    }
    console.log(`[docs-vault] storefront sample current · ${manifest.docs.length} docs`);
    return;
  }

  await writeFile(STOREFRONT_MANIFEST_OUT, JSON.stringify(manifest, null, 2), 'utf8');
  await writeFile(STOREFRONT_HEADINGS_OUT, JSON.stringify(headingsBySlug, null, 2), 'utf8');
  await writeFile(STOREFRONT_CONTENT_OUT, JSON.stringify(content, null, 2), 'utf8');
  console.log(
    `[docs-vault] storefront sample ${manifest.docs.length} docs → ${path.relative(ROOT, STOREFRONT_MANIFEST_OUT)}`,
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
  await buildStorefrontSample({ check: args.check });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[docs-vault] build failed:', err);
    process.exit(1);
  });
}
