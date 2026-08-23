#!/usr/bin/env node
// Broken-link check.
//
// Open-source projects put exactly two kinds of doc check in CI: a cheap wide net
// (lint, formatting, **broken links**) and a narrow precise one (regenerate and
// diff). We already have the latter in `scripts/build-docs-surface.mjs`; this is
// the broken-link half of the former.
//
// External URLs are excluded by default — a network-dependent check turns our
// gate red when somebody else's server is down. Run them separately with
// `--external`.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  collectHtmlAssetRefs,
  collectMarkdownLinks,
  collectProseDocRefs,
  isExternalTarget,
  isHistoricalDoc,
} from './lib/doc-links.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Generated copies (`public/docs-vault`) and build output follow the source.
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'out',
  'dist',
  'build',
  'coverage',
  '.codegraph',
  '.serena',
  'src-tauri',
  'public',
  /**
   * **A worktree is somebody else's checkout** (2026-08-01).
   *
   * `.claude` is in `KEEP_DOT_DIRS` so the walk descends into it, and this
   * repository **always** keeps worktrees at `.claude/worktrees/<branch>`
   * (`CLAUDE.md` says to work that way). Each contains a full copy of the
   * repository, so the check counted every document twice and resolved that copy's
   * citations **against this repository's root**, reporting real paths as broken.
   *
   * The result is the familiar failure: **the gate, not the code, is wrong and
   * red.** With even one worktree present `docs:links` becomes unusable, and then
   * people learn to switch the gate off or ignore it.
   *
   * The match is by name, so `worktrees/` is skipped wherever it appears — documents
   * inside a worktree are checked by that branch's own CI.
   */
  'worktrees',
]);
const KEEP_DOT_DIRS = new Set(['.claude', '.agents', '.codex', '.github']);

export function usage() {
  return [
    'Usage: node scripts/check-doc-links.mjs [--external]',
    '',
    '  (default)   Check repo-relative markdown links and repo-anchored `.md` path citations.',
    '  --external  Additionally resolve http(s) links over the network (opt-in; not a CI gate).',
  ].join('\n');
}

export function parseArgs(argv) {
  const args = { external: false, help: false };
  for (const arg of argv) {
    if (arg === '--external') args.external = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else return { ...args, error: `unknown argument: ${arg}` };
  }
  return args;
}

export function listMarkdownFiles(root = ROOT) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && !KEEP_DOT_DIRS.has(entry.name)) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) found.push(full);
    }
  };
  walk(root);
  return found.sort();
}

function exists(target) {
  try {
    statSync(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * A root-absolute link (`/guide/cli`) is a **docs slug**, not a file path —
 * `/docs` renders `docs/**.md` by slug. So `docs/<slug>.md` is tried first and
 * only then the repository path.
 */
export function resolveLinkTarget(fromFile, target, root = ROOT) {
  const withoutAnchor = target.split('#')[0];
  if (!withoutAnchor) return null; // An anchor within the same document
  let decoded;
  try {
    decoded = decodeURIComponent(withoutAnchor);
  } catch {
    decoded = withoutAnchor;
  }
  if (decoded.startsWith('/')) {
    const slugged = path.join(root, 'docs', `${decoded.slice(1)}.md`);
    if (exists(slugged)) return slugged;
    return path.join(root, decoded);
  }
  return path.resolve(path.dirname(fromFile), decoded);
}

export function checkFile(file, { root = ROOT } = {}) {
  const relative = path.relative(root, file).split('\\').join('/');
  const markdown = readFileSync(file, 'utf-8');
  const problems = [];

  for (const link of collectMarkdownLinks(markdown)) {
    if (isExternalTarget(link.target) || link.target.startsWith('#')) continue;
    const resolved = resolveLinkTarget(file, link.target, root);
    if (resolved && !exists(resolved)) {
      problems.push({ file: relative, line: link.line, target: link.target, kind: 'link' });
    }
  }

  for (const asset of collectHtmlAssetRefs(markdown)) {
    const resolved = resolveLinkTarget(file, asset.target, root);
    if (resolved && !exists(resolved)) {
      problems.push({ file: relative, line: asset.line, target: asset.target, kind: 'asset' });
    }
  }

  if (!isHistoricalDoc(relative)) {
    for (const ref of collectProseDocRefs(markdown)) {
      // Phantom-directory citations are not tested for existence — those paths exist
      // only on the author's machine, so an exists() check would make a gate that is
      // green locally and red everywhere else.
      if (ref.ghost) {
        problems.push({ file: relative, line: ref.line, target: ref.target, kind: 'cited path (저장소에 없는 자리)' });
        continue;
      }
      const resolved = ref.relative ? path.resolve(path.dirname(file), ref.target) : path.join(root, ref.target);
      if (!exists(resolved)) {
        problems.push({ file: relative, line: ref.line, target: ref.target, kind: 'cited path' });
      }
    }
  }

  return problems;
}

export function collectExternalUrls(root = ROOT) {
  const urls = new Map();
  for (const file of listMarkdownFiles(root)) {
    const relative = path.relative(root, file).split('\\').join('/');
    for (const link of collectMarkdownLinks(readFileSync(file, 'utf-8'))) {
      if (!/^https?:\/\//i.test(link.target)) continue;
      const url = link.target.split('#')[0];
      if (!urls.has(url)) urls.set(url, `${relative}:${link.line}`);
    }
  }
  return urls;
}

async function checkExternal(root) {
  const urls = collectExternalUrls(root);
  const failures = [];
  const entries = [...urls.entries()];
  const CONCURRENCY = 8;
  let cursor = 0;
  const worker = async () => {
    while (cursor < entries.length) {
      const [url, origin] = entries[cursor++];
      try {
        const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10_000) });
        if (response.status >= 400) failures.push(`${origin} → ${url} (HTTP ${response.status})`);
      } catch (err) {
        failures.push(`${origin} → ${url} (${err.message ?? err})`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { checked: entries.length, failures: failures.sort() };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (args.error) {
    console.error(args.error);
    console.error(usage());
    return 2;
  }

  const files = listMarkdownFiles();
  const problems = files.flatMap((file) => checkFile(file));

  if (problems.length > 0) {
    console.error(`[doc-links] ${problems.length} broken reference(s) in ${files.length} markdown files:`);
    for (const problem of problems) {
      console.error(`  ${problem.file}:${problem.line}  ${problem.kind} → ${problem.target}`);
    }
  }

  let externalFailures = 0;
  if (args.external) {
    const result = await checkExternal(ROOT);
    externalFailures = result.failures.length;
    console.log(`[doc-links] external URLs checked: ${result.checked}, unreachable: ${externalFailures}`);
    for (const failure of result.failures) console.error(`  ${failure}`);
  }

  if (problems.length > 0 || externalFailures > 0) return 1;
  console.log(`[doc-links] ok · ${files.length} markdown files, no broken repo references`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error('[doc-links] failed:', err.message ?? err);
      process.exitCode = 1;
    });
}

export { existsSync };
