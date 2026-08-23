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
const CONTENT_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'content.json',
);
// The gateway needs body text synchronously before first paint on the client
// surface. To keep the whole of content.json out of that path, only guide/* goes
// into this small map; every other document is read as a raw asset from
// public/docs-vault.
//
// Since 2026-08-19 the CHANGELOG is **not included in full** — the file had grown
// to 634KB and pushed the chunk shared by every route past the desktop
// performance budget (max chunk 1.5MiB). All the gateway's `/changelog` needs
// synchronously at first paint is a few recent sections plus how many were
// folded, so only that much is cut into gateway-changelog.json. `/docs` reads the
// full CHANGELOG asynchronously from public/docs-vault/CHANGELOG.md like any
// other document.
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
// How many CHANGELOG sections go into the bundle. It **must exceed** the screen's
// display limit (RECENT_SECTIONS = 12 in `app/[locale]/changelog/page.tsx`) — the
// screen trims what it receives once more against its own limit and adds the two
// fold counts to report the exact total. Raising the screen's limit above this
// value makes the excess invisible.
export const GATEWAY_CHANGELOG_KEEP_SECTIONS = 16;
// The manifest's headings are used only by the `/docs` screen (the table-of-
// contents rail and inserts), yet 263KB of them rode in the chunk shared by every
// route. They are emptied in the bundled manifest and emitted as a separate
// slug → headings map that `/docs` imports dynamically when needed.
// Local mode (the user's vault) builds its manifest from disk, so headings stay
// inline there — this split applies to the bundled vault only.
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
// Recognisable sample vault (2026-07): `samples/storefront/` is built as its own
// manifest/content pair so a non-developer sees an example business ("online
// storefront") instead of the dogfood vault, which describes this tool itself.
// The dogfood output (manifest.json / content.json / public/docs-vault) is never
// touched — `docs-vault:check` must keep passing unchanged. No public raw copies
// and no census module are produced for storefront: its only consumer so far is a
// JSON import.
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
// The dogfood vault census consumed by the evidence miniature (VaultInstrument)
// in `/download`'s intro section. Emitted as a small constants module so that
// manifest.json (400KB) never enters that bundle.

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
 * Per-document "last changed" — the **date** of the commit that last touched the
 * file (`%cs`, YYYY-MM-DD in the commit's own timezone).
 *
 * **Date, not timestamp**, because this value goes into generated output that is
 * committed **alongside** that commit, whose timestamp is unknowable at generation
 * time. GitHub squash-merge discards the PR branch's commits and stamps a new
 * time; rebase and amend do the same. Recorded at timestamp precision the baseline
 * is therefore **wrong from birth** — across 25 commits on main, 1–32 documents
 * were always wrong (24 of 25 commits), and when someone later regenerated it,
 * lines they had not touched appeared in the diff, producing rebase conflicts and
 * phantom diffs.
 *
 * At date precision a merge restamping the time still lands on the **same day**, so
 * the value is unchanged (two PRs on the same day write the same string and git
 * auto-merges). Every consumer works at day granularity or coarser: the "N days
 * ago" ramp, the last-7-days lens, the weekly heatmap, and sorting.
 */
function gitLastCommitDays(rootDir, scopeDir) {
  const days = new Map();
  const dirty = new Set();
  try {
    const scope = path.relative(rootDir, scopeDir).replace(/\\/g, '/') || '.';
    // Shallow-clone warning — in a depth-1 checkout the single commit is treated as
    // a parentless root, so `--name-only` attributes the **entire tree** to it. Every
    // document then gets the same date and the freshness lens goes completely flat
    // (measured: 247 paths → 1 distinct date). CI must use `fetch-depth: 0`.
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
    }
    const status = execSync(`git status --porcelain -- "${scope}"`, {
      cwd: rootDir,
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    });
    for (const line of status.split('\n')) {
      const file = line.slice(3).trim();
      if (file) dirty.add(file);
    }
  } catch {
    // No git, or not a repository (a release tarball) — fall back to the mtime date.
  }
  return { days, dirty };
}

/**
 * `YYYY-MM-DD` in the local timezone. `%cs` gives the date in the commit's own
 * timezone, so the mtime path follows the same convention — truncating in UTC
 * would record a file edited on a KST morning as "yesterday", disagreeing with the
 * `%cs` ("today") of the commit that carries the edit. The mtime path is used only
 * for dirty or untracked documents, so the machine-timezone dependence is confined
 * to that author's working tree (a clean checkout has no dirty documents, so CI and
 * fresh worktrees are timezone-independent).
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
    'Usage: node scripts/build-docs-vault.mjs [--check]',
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

function buildExcerpt(body) {
  // Kept in sync with src/shared/lib/parse-frontmatter.ts buildExcerpt. Strip
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
    .replace(/[*_`>#]/g, '') // residual emphasis / quote / heading marks
    .replace(/\s+/g, ' ') // collapse whitespace
    .replace(/(?:·\s*){2,}/g, '· ') // collapse middot runs from empty cells
    .replace(/^[\s·]+|[\s·]+$/g, '') // trim leading/trailing middots
    .trim();
  return stripped.slice(0, 320);
}

// Normalises a wikilink target against the vault the document belongs to.
// Mirrors src/shared/lib/parse-frontmatter.ts#resolveWikilinkTargetSlug — the
// same logic is physically duplicated in both places, and unlike the parser's
// 3-way contract there is no contract test yet, so a fix here must be applied
// there too or they drift.
//
// docs/ontology/ is the nested MCP vault this project dogfoods. Wikilinks inside
// it use slugs relative to the ontology vault root (`capabilities/x`) as MCP
// tools and people write them, but in the merged `/docs` tree the real slug
// carries an `ontology/` prefix. Without that correction the backlinksDetail keys
// diverge and real backlinks go missing from lookups.
export function resolveWikilinkTargetSlug(targetSlug, fromSlug) {
  if (fromSlug.startsWith('ontology/') && !targetSlug.startsWith('ontology/')) {
    return `ontology/${targetSlug}`;
  }
  return targetSlug;
}

// Extracts links — relative md references plus Obsidian wikilinks. External URLs,
// images, and anchor-only links are ignored. Returns a targetSlug plus 120
// characters of surrounding context per link.
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
    // Directories first, then files; within each group sorted by name.
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
  for (const c of node.children) sortTree(c);
}

async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

// The manifest stamp is the most recent `updatedAt` **date** among source
// documents. Never the build wall clock: a wall clock changes the file's third
// line on every regeneration, so two open PRs **always** conflict here. At date
// precision two branches regenerating on the same day write the same string and
// git auto-merges. Fixed fallback when no document carries a date.
const STABLE_GENERATED_AT_FALLBACK = '1970-01-01';
export function deterministicGeneratedAt(docs) {
  const days = (docs ?? [])
    .map((doc) => doc?.updatedAt)
    .filter((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (days.length === 0) return STABLE_GENERATED_AT_FALLBACK;
  return days.reduce((a, b) => (a >= b ? a : b));
}

/**
 * Keeps the first `limit` `## ` sections. **This must have the same semantics as
 * `trimToRecentSections` in `src/views/gateway-doc/lib/vault-doc.ts`**: the screen
 * trims the bundled preview once more against its own limit, so if the two
 * implementations disagree on section boundaries the reported fold count is a lie.
 * `tests/contract/gateway-changelog-preview.contract.test.ts` proves the two agree
 * against the real CHANGELOG (the same pattern as the parse-frontmatter 3-way
 * contract).
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

export function comparableManifest(manifest) {
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

export function comparableDoc(doc) {
  return {
    ...doc,
    updatedAt: '<ignored>',
  };
}

// Source of the dogfood census module — deterministic, with no timestamp, so it
// only diffs when the vault content actually changes.

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

/**
 * Shared core that scans one vault directory (docs/ or samples/storefront/) and
 * assembles manifest / content / publicFiles. This is the dogfood (docs/) build's
 * original logic, extracted unchanged when the storefront sample vault was added
 * so the dogfood output could not regress by a single byte.
 *
 * When `publicOutDir` is given and `check` is false, raw md is copied beneath it
 * (storefront passes `null` — nothing consumes public raw copies for it yet).
 *
 * Exported because the determinism contract test passes a temporary git
 * repository as `rootDir`/`dir` to prove that rewriting commit times within the
 * same day produces byte-identical output (`check: true` writes nothing).
 */
export async function scanVaultDir(
  dir,
  { rootDir = ROOT, publicOutDir = null, check = false, treeName = 'docs' } = {},
) {
  const files = await walk(dir);
  const gitDays = gitLastCommitDays(rootDir, dir);
  const docs = [];
  const publicFiles = [];
  const content = {};
  // Only backlinksDetail is kept; the plain deprecated backlinks list is gone.
  const backlinksDetailMap = new Map(); // slug -> Array<{ fromSlug, context, linkText }>
  const tagsMap = new Map(); // tag -> Set<slug>

  for (const full of files) {
    const raw = await readFile(full, 'utf8');
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
    const st = await stat(full);
    const relPath = path.relative(rootDir, full).replace(/\\/g, '/');
    const committedDay = gitDays.dirty.has(relPath) ? null : gitDays.days.get(relPath);
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
      wordCount: body.split(/\s+/).filter(Boolean).length,
      // Commit date wins; the mtime date is used only for documents that are dirty in
      // the working tree or still untracked. Both are dates, so the value is stable as
      // long as the edit and its merge land on the same day.
      updatedAt: committedDay ?? localDayStamp(st.mtime) ?? STABLE_GENERATED_AT_FALLBACK,
      linksOut,
    };
    // The stabiliser that carried values over from the previous manifest was
    // removed: when generated output depends on its own previous output, "same input
    // → same bytes" no longer holds (losing the baseline or regenerating in a
    // different order splits the value). Date precision already absorbs the mtime
    // jitter that stabiliser existed to hide.
    docs.push(nextDoc);

    publicFiles.push({ relativePath: `${slug}.md`, raw });
    content[slug] = raw;

    if (!check && publicOutDir) {
      // Copy raw md under public/docs-vault by slug, creating subdirectories as needed.
      const outPath = path.join(publicOutDir, `${slug}.md`);
      await ensureDir(path.dirname(outPath));
      await writeFile(outPath, raw, 'utf8');
    }
  }

  // D-1 — register FRONTMATTER relation-ref backlinks (mirrors
  // `src/entities/docs-vault/lib/build-local-manifest.ts`). The body pass above
  // only saw markdown links, so a doc referenced purely through frontmatter
  // (`dependencies: [capabilities/mcp-server]`, …) showed a false "no
  // backlinks" in the sample (build-time) reader. Same relation-key set as the
  // MCP `find_backlinks` tool. Deduped by fromSlug in the assembly below, so a
  // body link to the same target keeps its richer context.
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
    // The stamp is the most recent change **date** among source documents — never
    // the build wall clock and never the previous output. So the same source
    // regenerates to the same bytes on any machine any number of times, and two
    // branches that diverged on the same day do not conflict on this line.
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

  const scanned = await scanVaultDir(DOCS_DIR, {
    rootDir: ROOT,
    publicOutDir: PUBLIC_OUT,
    check,
  });
  const { content, gatewayContent, publicFiles } = scanned;
  // The bundled manifest ships with headings split into a separate file — see the
  // MANIFEST_HEADINGS_OUT comment at the top of this file.
  const { manifest, headingsBySlug } = splitManifestHeadings(scanned.manifest);
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

/**
 * Builds the storefront sample vault (`samples/storefront/`) — only its own
 * manifest/content pair, separate from dogfood. No public raw copies, no census
 * module, no PUBLIC_OUT reset: nothing consumes them yet, and when something does
 * the extension stays inside this function.
 */
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
