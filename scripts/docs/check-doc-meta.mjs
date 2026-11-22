#!/usr/bin/env node
// Living-document metadata gate: every living document under docs/ carries `title`, `doc_type`,
// `status` and `area` in frontmatter and every path it points at exists. It checks only facts a
// machine can derive (keys, enums, folder per kind, pointers) and never reads headings or prose
// (`.claude/rules/documentation.md`). `updated` and `revision` come from Git at build time
// (`scripts/docs-vault/build-docs-vault.mjs`), so a hand-written counter is rejected; a changed
// `contract_version` must arrive with a new decision record that cites the document.
//
//   pnpm docs:meta

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  COMMON_REQUIRED,
  DOC_AREAS,
  DOC_TYPES,
  allowedKeys,
  isForbiddenKey,
  isFrozenDocPath,
  statusValues,
  typeFitsFolder,
} from '../lib/docs/doc-types.mjs';
import { collectMarkdownLinks, collectProseDocRefs, isExternalTarget } from '../lib/docs/doc-links.mjs';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** A scan over too few documents means the walk broke, not that the docs are clean. */
export const MIN_CHECKED = 40;

export function listLivingDocs(root = ROOT) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) {
        const repoPath = path.relative(root, full).split(path.sep).join('/');
        if (!isFrozenDocPath(repoPath)) found.push(repoPath);
      }
    }
  };
  walk(path.join(root, 'docs'));
  return found.sort();
}

function exists(root, repoPath) {
  try {
    statSync(path.join(root, repoPath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a route like `/project/[slug]` or `/topology?mode=focus` has a page under a locale root:
 * `app/[locale]` (the workbench) or `app/(gateway)/[locale]`, since a route group adds no segment.
 */
export function routeExists(route, root = ROOT) {
  if (typeof route !== 'string' || !route.startsWith('/')) return false;
  const segments = route.split(/[?#]/)[0].split('/').filter(Boolean);
  return [path.join(root, 'app', '[locale]'), path.join(root, 'app', '(gateway)', '[locale]')]
    .some((localeRoot) => routeExistsUnder(localeRoot, segments));
}

function routeExistsUnder(localeRoot, segments) {
  let directory = localeRoot;
  for (const segment of segments) {
    const exact = path.join(directory, segment);
    if (existsSync(exact)) {
      directory = exact;
      continue;
    }
    const dynamic = existsSync(directory)
      ? readdirSync(directory, { withFileTypes: true }).find((entry) => entry.isDirectory() && /^\[.+\]$/.test(entry.name))
      : null;
    if (!dynamic) return false;
    directory = path.join(directory, dynamic.name);
  }
  return existsSync(path.join(directory, 'page.tsx'));
}

function decisionIds(root) {
  const directory = path.join(root, 'docs', 'records', 'decisions');
  return existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith('.md')) : [];
}

function asList(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === '' ? [] : [value];
}

/** A spec's versions are its dated `## Revisions` lines; the number itself comes from Git. */
function hasRevisionLog(raw) {
  const section = raw.split(/^## Revisions[ \t]*$/m)[1];
  return section !== undefined && /^- \d{4}-\d{2}-\d{2}: \S/m.test(section.split(/^## /m)[0]);
}

export function checkDoc(repoPath, raw, { root = ROOT, decisions = decisionIds(root), guideRegistry = '' } = {}) {
  const problems = [];
  const report = (key, message) => problems.push({ file: repoPath, key, message });
  const { frontmatter } = parseFrontmatter(raw);
  if (!raw.replace(/^﻿/, '').startsWith('---')) {
    report('frontmatter', 'has no frontmatter; run `pnpm doc:new` for a new document, or add title, doc_type, status and area');
    return problems;
  }
  for (const key of COMMON_REQUIRED) {
    if (frontmatter[key] === undefined || frontmatter[key] === '') report(key, 'is required');
  }
  const docType = frontmatter.doc_type;
  const spec = DOC_TYPES[docType];
  if (docType !== undefined && !spec) report('doc_type', `"${docType}" is not one of ${Object.keys(DOC_TYPES).join(', ')}`);
  if (spec && !typeFitsFolder(docType, repoPath)) {
    report('doc_type', `a ${docType} does not live in ${path.posix.dirname(repoPath)}/ (allowed: ${spec.folders.map((f) => `docs/${f}`).join(', ')})`);
  }
  if (frontmatter.status !== undefined && !statusValues().includes(frontmatter.status)) {
    report('status', `"${frontmatter.status}" is not one of ${statusValues().join(', ')}`);
  }
  if (frontmatter.area !== undefined && !DOC_AREAS.includes(frontmatter.area)) {
    report('area', `"${frontmatter.area}" is not one of ${DOC_AREAS.join(', ')}`);
  }
  const allowed = allowedKeys(docType);
  for (const key of Object.keys(frontmatter)) {
    if (isForbiddenKey(key)) {
      report(key, 'is not a document key: ontology keys would turn this file into a graph node, and dates and revisions come from Git');
    } else if (spec && !allowed.has(key)) {
      report(key, `is not a ${docType} key (allowed: ${[...allowed].join(', ')})`);
    }
  }
  if (spec) {
    for (const key of spec.required) {
      if (frontmatter[key] === undefined || frontmatter[key] === '') report(key, `is required on a ${docType}`);
    }
  }
  for (const target of asList(frontmatter.enforced_by)) {
    if (typeof target !== 'string' || !exists(root, target.split('#')[0])) report('enforced_by', `${target} does not exist`);
  }
  if (docType === 'contract' && asList(frontmatter.enforced_by).length === 0) {
    report('enforced_by', 'a contract names at least one file that enforces it');
  }
  if ('routes' in frontmatter && !Array.isArray(frontmatter.routes)) report('routes', 'must be a list, `[]` when the feature has no route');
  for (const route of asList(frontmatter.routes)) {
    if (!routeExists(route, root)) report('routes', `${route} has no page under app/[locale] or app/(gateway)/[locale]`);
  }
  if ('decisions' in frontmatter && !Array.isArray(frontmatter.decisions)) report('decisions', 'must be a list');
  for (const id of asList(frontmatter.decisions)) {
    const text = String(id);
    if (text.length < 8 || !decisions.some((name) => name.includes(text))) {
      report('decisions', `${text} names no fragment under docs/records/decisions/`);
    }
  }
  if (docType === 'spec' && !hasRevisionLog(raw)) {
    report('revisions', 'a spec ends with a `## Revisions` list, one `- YYYY-MM-DD: what changed and why` line per change');
  }
  if (frontmatter.status === 'superseded' && !frontmatter.superseded_by) report('superseded_by', 'is required when status is superseded');
  for (const key of ['superseded_by', 'supersedes']) {
    for (const target of asList(frontmatter[key])) {
      if (!exists(root, String(target))) report(key, `${target} does not exist`);
    }
  }
  if (docType === 'guide' && frontmatter.gateway !== false) {
    const slug = repoPath.replace(/^docs\//, '').replace(/\.md$/, '');
    if (!guideRegistry.includes(`'${slug}'`)) {
      report('gateway', `${slug} is not in src/views/gateway-doc/model/guide-pages.ts; register it or set \`gateway: false\``);
    }
  }
  return problems;
}

function git(args, root) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * A `contract_version` that differs from the merge base needs a decision fragment
 * added in the same diff that cites the document. Skipped where no base exists.
 */
export function contractBumpProblems(docs, root = ROOT) {
  let base;
  try {
    base = git(['merge-base', 'HEAD', 'origin/main'], root);
  } catch {
    try {
      base = git(['merge-base', 'HEAD', 'main'], root);
    } catch {
      return [];
    }
  }
  const movedFile = path.join(root, 'docs', '.moved.json');
  const movedFrom = existsSync(movedFile)
    ? Object.fromEntries(Object.entries(JSON.parse(readFileSync(movedFile, 'utf8'))).map(([from, to]) => [to, from]))
    : {};
  let addedDecisions = [];
  try {
    addedDecisions = git(['diff', '--name-only', '--diff-filter=A', base, '--', 'docs/records/decisions/'], root)
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
  const problems = [];
  for (const { repoPath, frontmatter } of docs) {
    if (frontmatter.contract_version === undefined) continue;
    let before = null;
    for (const candidate of [repoPath, movedFrom[repoPath]].filter(Boolean)) {
      try {
        before = parseFrontmatter(git(['show', `${base}:${candidate}`], root)).frontmatter.contract_version;
        break;
      } catch {
        // Not present at the base under this name.
      }
    }
    if (before === null || before === undefined || String(before) === String(frontmatter.contract_version)) continue;
    const cited = addedDecisions.some((file) => existsSync(path.join(root, file)) && readFileSync(path.join(root, file), 'utf8').includes(repoPath));
    if (!cited) {
      problems.push({
        file: repoPath,
        key: 'contract_version',
        message: `changed ${before} -> ${frontmatter.contract_version}; add a decision with \`pnpm record:new -- --kind=decision\` that cites ${repoPath}`,
      });
    }
  }
  return problems;
}

/** Statuses that mark a document as a record rather than guidance. */
const RETIRED_STATUS = new Set(['historical', 'superseded']);
/** Statuses whose document still steers work. */
const LIVE_STATUS = new Set(['current', 'draft', 'active']);
/** A folder whose every file is history, whether or not it carries frontmatter. */
const HISTORY_PREFIX = 'docs/history/';

/**
 * Instruction files an agent loads as guidance may not cite a retired document: an agent follows
 * what it is pointed at, and a historical record replays a reversed decision.
 */
export function isInstructionPath(repoPath) {
  return (
    ['AGENTS.md', 'docs/README.md'].includes(repoPath) ||
    /^\.claude\/(rules|skills|agents)\/.+\.md$/.test(repoPath) ||
    /^\.(agents|codex)\/.+\.md$/.test(repoPath)
  );
}

function walkMarkdown(root, directory, out) {
  const full = path.join(root, directory);
  if (!existsSync(full)) return out;
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const child = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkMarkdown(root, child, out);
    else if (entry.name.endsWith('.md')) out.push(child);
  }
  return out;
}

export function citedPaths(repoPath, raw) {
  const directory = path.posix.dirname(repoPath);
  const cited = new Set();
  const add = (target, relative) => {
    const clean = target.split('#')[0].split('?')[0];
    if (!clean || isExternalTarget(clean) || clean.startsWith('/')) return;
    const resolved = relative ? path.posix.normalize(path.posix.join(directory, clean)) : path.posix.normalize(clean);
    if (!resolved.startsWith('..')) cited.add(resolved);
  };
  for (const { target } of collectMarkdownLinks(raw)) add(target, true);
  for (const { target, relative, ghost } of collectProseDocRefs(raw)) if (!ghost) add(target, relative);
  return cited;
}

/**
 * Citation rules. Instruction files cite no historical or superseded document
 * and nothing under docs/history/. A live document that cites a superseded one
 * also cites its successor, so a reader lands on the answer, not the record.
 * Ledgers carry no status, so neither rule reaches them.
 */
export function citationProblems(root = ROOT) {
  const statusCache = new Map();
  const frontmatterOf = (repoPath) => {
    if (!statusCache.has(repoPath)) {
      const file = path.join(root, repoPath);
      let frontmatter = {};
      try {
        if (statSync(file).isFile()) frontmatter = parseFrontmatter(readFileSync(file, 'utf8')).frontmatter;
      } catch {
        // A missing target is docs:links' finding, not this one.
      }
      statusCache.set(repoPath, frontmatter);
    }
    return statusCache.get(repoPath);
  };
  const sources = [
    ...['AGENTS.md'].filter((file) => existsSync(path.join(root, file))),
    ...walkMarkdown(root, 'docs', []),
    ...['.claude/rules', '.claude/skills', '.claude/agents', '.agents', '.codex'].flatMap((directory) => walkMarkdown(root, directory, [])),
  ];
  const problems = [];
  for (const repoPath of [...new Set(sources)].sort()) {
    const instruction = isInstructionPath(repoPath);
    const live = LIVE_STATUS.has(frontmatterOf(repoPath).status);
    if (!instruction && !live) continue;
    const cited = citedPaths(repoPath, readFileSync(path.join(root, repoPath), 'utf8'));
    for (const target of cited) {
      const { status, superseded_by: successors } = frontmatterOf(target);
      if (instruction && (target.startsWith(HISTORY_PREFIX) || RETIRED_STATUS.has(status))) {
        const why = target.startsWith(HISTORY_PREFIX) ? 'is under docs/history/' : `is ${status}`;
        problems.push({ file: repoPath, key: 'citation', message: `cites ${target}, which ${why}; instruction files cite only current documents` });
      }
      if (live && status === 'superseded') {
        const missing = asList(successors).map(String).filter((successor) => !cited.has(successor));
        if (missing.length > 0) {
          problems.push({ file: repoPath, key: 'citation', message: `cites superseded ${target} without its successor ${missing.join(', ')}` });
        }
      }
    }
  }
  return problems;
}

const DATED_NAME = /20\d{2}-?[01]\d-?[0-3]\d/;
const DATED_HOMES = /^docs\/(?:specs|records|ontology|benchmark\/results)\//;

export function datedDocProblems(trackedDocs) {
  return trackedDocs
    .filter((file) => DATED_NAME.test(file) && !DATED_HOMES.test(file))
    .map((file) => ({ file, key: 'path', message: 'is a new dated document: a plan, audit or note belongs in a commit body or pull request, a spec in docs/specs/' }));
}

export function run(root = ROOT) {
  const files = listLivingDocs(root);
  const decisions = decisionIds(root);
  const registryFile = path.join(root, 'src', 'views', 'gateway-doc', 'model', 'guide-pages.ts');
  const guideRegistry = existsSync(registryFile) ? readFileSync(registryFile, 'utf8') : '';
  const problems = [];
  const docs = [];
  for (const repoPath of files) {
    const raw = readFileSync(path.join(root, repoPath), 'utf8');
    problems.push(...checkDoc(repoPath, raw, { root, decisions, guideRegistry }));
    docs.push({ repoPath, frontmatter: parseFrontmatter(raw).frontmatter });
  }
  problems.push(...contractBumpProblems(docs, root));
  problems.push(...citationProblems(root));
  return { checked: files.length, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { checked, problems } = run();
  const trackedDocs = execFileSync('git', ['ls-files', 'docs'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  problems.push(...datedDocProblems(trackedDocs));
  if (checked < MIN_CHECKED) {
    console.error(`[docs:meta] only ${checked} living documents found (expected at least ${MIN_CHECKED}); the walk is broken`);
    process.exit(1);
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  - ${problem.file}: \`${problem.key}\` ${problem.message}`);
    console.error(`[docs:meta] ${problems.length} problem(s) in ${checked} living documents. Templates: docs/.templates/; kinds and areas: scripts/lib/docs/doc-types.mjs`);
    process.exit(1);
  }
  console.log(`[docs:meta] ok · ${checked} living documents carry valid metadata`);
}
