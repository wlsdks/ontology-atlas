#!/usr/bin/env node
// Moves documents listed in docs/.moved.json and rewrites every reference to them.
//
// `docs/.moved.json` is a flat `{ "<old repo path>": "<new repo path>" }` map and
// the only input. The script is permanent on purpose: a branch started before a
// move merges main, runs `pnpm docs:move`, and its own new references are
// rewritten the same way.
//
//   pnpm docs:move            git mv each pair that still sits at its old path,
//                             then rewrite references
//   pnpm docs:move -- --check exit 1 while an old path exists or is still cited
//
// Idempotent: a pair already moved is a no-op, a rewrite only ever replaces an
// old path with a new one, and a second run changes nothing. Frozen history
// (`scripts/lib/doc-types.mjs`) is never touched.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isFrozenRepoPath } from './lib/doc-types.mjs';
import {
  collectHtmlAssetRefs,
  collectHtmlLinks,
  collectMarkdownLinks,
  isExternalTarget,
} from './lib/doc-links.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js', '.cjs', '.json', '.css', '.md', '.sh', '.rs', '.yml', '.yaml', '.toml', '.html']);

export function readMoveMap(root = ROOT) {
  const file = path.join(root, 'docs', '.moved.json');
  if (!existsSync(file)) return {};
  const map = JSON.parse(readFileSync(file, 'utf8'));
  for (const [from, to] of Object.entries(map)) {
    if (typeof to !== 'string' || !from.startsWith('docs/') || !to.startsWith('docs/')) {
      throw new Error(`docs/.moved.json: ${from} -> ${to} must map a docs/ path to a docs/ path`);
    }
  }
  return map;
}

/** A path is replaced only where it is a whole path, not the tail of a longer name. */
function pathPattern(repoPath) {
  const escaped = repoPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, 'g');
}

function isFile(absolute) {
  try {
    return statSync(absolute).isFile() || statSync(absolute).isDirectory();
  } catch {
    return false;
  }
}

function listFiles(root) {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).filter((file) => existsSync(path.join(root, file)));
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * Rewrites one relative Markdown link target. `file` is the document's current
 * repo path and `formerFile` where it sat before the move (the same when it did
 * not move). The target is resolved where it was written, mapped through the
 * move table, and re-relativised from where the document sits now.
 */
export function rewriteLinkTarget(target, { file, formerFile, map, reverse, root }) {
  if (!target || target.startsWith('#') || isExternalTarget(target)) return target;
  const hashIndex = target.indexOf('#');
  const bare = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : target.slice(hashIndex);
  if (!bare) return target;
  let decoded;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    decoded = bare;
  }
  if (decoded.startsWith('/')) {
    // A root-absolute link is a docs slug (`/guide/cli`).
    const moved = map[`docs${decoded}.md`];
    return moved ? `/${moved.slice('docs/'.length, -'.md'.length)}${fragment}` : target;
  }
  const exists = (repoPath) => isFile(path.join(root, repoPath));
  const fromHere = toPosix(path.posix.normalize(path.posix.join(path.posix.dirname(file), decoded)));
  let resolved = null;
  if (map[fromHere]) resolved = map[fromHere];
  else if (exists(fromHere) && !reverse[fromHere]) return target;
  else if (formerFile !== file) {
    const fromBefore = path.posix.normalize(path.posix.join(path.posix.dirname(formerFile), decoded));
    if (map[fromBefore]) resolved = map[fromBefore];
    else if (exists(fromBefore)) resolved = fromBefore;
  }
  if (!resolved) return target;
  let relative = path.posix.relative(path.posix.dirname(file), resolved);
  if (bare.startsWith('./') && !relative.startsWith('../')) relative = `./${relative}`;
  return `${relative}${fragment}`;
}

function rewriteMarkdownLinks(text, context) {
  const targets = new Set();
  for (const link of [...collectMarkdownLinks(text), ...collectHtmlLinks(text), ...collectHtmlAssetRefs(text)]) {
    targets.add(link.target);
  }
  let next = text;
  for (const target of targets) {
    const rewritten = rewriteLinkTarget(target, context);
    if (rewritten === target) continue;
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    next = next
      .replace(new RegExp(`\\]\\(${escaped}(?=[)\\s])`, 'g'), `](${rewritten}`)
      .replace(new RegExp(`((?:href|src)\\s*=\\s*["'])${escaped}(?=["'])`, 'gi'), `$1${rewritten}`);
  }
  return next;
}

/** Rewrites every reference in one file. Returns the new text and the bare basenames left for a person. */
export function rewriteText(text, { file, formerFile = file, map, reverse, root }) {
  let next = text;
  if (file.endsWith('.md')) next = rewriteMarkdownLinks(next, { file, formerFile, map, reverse, root });
  const leftovers = [];
  for (const [from, to] of Object.entries(map)) {
    const citedFull = pathPattern(from).test(next);
    next = next.replace(pathPattern(from), to);
    // `superpowers/specs/x.md` written without its `docs/` prefix.
    const fromTail = from.slice('docs/'.length);
    if (fromTail.includes('/')) next = next.replace(pathPattern(fromTail), to.slice('docs/'.length));
    const base = path.posix.basename(from);
    // A folder-only move keeps the file name, so a bare name is still correct.
    if (base === path.posix.basename(to)) continue;
    const bare = new RegExp(`(?<![A-Za-z0-9_/.-])${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`, 'g');
    if (citedFull) {
      next = next.replace(bare, to);
    } else if (bare.test(next)) {
      leftovers.push(base);
    }
  }
  return { text: next, leftovers };
}

function moveFiles(map, root) {
  const moved = [];
  for (const [from, to] of Object.entries(map)) {
    const hasFrom = existsSync(path.join(root, from));
    const hasTo = existsSync(path.join(root, to));
    if (hasFrom && hasTo) throw new Error(`both ${from} and ${to} exist; resolve by hand`);
    if (!hasFrom) continue;
    mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
    execFileSync('git', ['mv', from, to], { cwd: root });
    moved.push(`${from} -> ${to}`);
  }
  return moved;
}

export function run({ root = ROOT, check = false } = {}) {
  const map = readMoveMap(root);
  const reverse = Object.fromEntries(Object.entries(map).map(([from, to]) => [to, from]));
  const problems = [];
  const moved = [];
  if (check) {
    for (const from of Object.keys(map)) {
      if (existsSync(path.join(root, from))) problems.push(`${from} still exists`);
    }
  } else {
    moved.push(...moveFiles(map, root));
  }
  const changed = [];
  const leftovers = [];
  for (const file of listFiles(root)) {
    if (isFrozenRepoPath(file) || file === 'docs/.moved.json') continue;
    if (!TEXT_EXTENSIONS.has(path.extname(file))) continue;
    const absolute = path.join(root, file);
    const text = readFileSync(absolute, 'utf8');
    const result = rewriteText(text, { file, formerFile: reverse[file] ?? file, map, reverse, root });
    for (const base of result.leftovers) leftovers.push(`${file}: bare ${base}`);
    if (result.text === text) continue;
    if (check) problems.push(`${file} still cites a moved path`);
    else {
      writeFileSync(absolute, result.text);
      changed.push(file);
    }
  }
  return { moved, changed, leftovers, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const check = process.argv.includes('--check');
  const { moved, changed, leftovers, problems } = run({ check });
  for (const line of moved) console.log(`[docs-move] moved ${line}`);
  for (const file of changed) console.log(`[docs-move] rewrote ${file}`);
  for (const line of leftovers) console.log(`[docs-move] review by hand: ${line}`);
  if (problems.length > 0) {
    for (const line of problems) console.error(`[docs-move] ${line}`);
    console.error('[docs-move] run `pnpm docs:move` to finish the move');
    process.exit(1);
  }
  console.log(`[docs-move] ${check ? 'current' : 'done'} · ${Object.keys(readMoveMap()).length} moves`);
}
