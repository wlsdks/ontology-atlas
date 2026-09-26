#!/usr/bin/env node
// Living-document metadata gate.
//
// Every living document under docs/ carries `title`, `doc_type`, `status` and
// `area` in frontmatter, and every path it points at exists. The gate checks
// only facts a machine can derive: keys, enums, the folder a kind may live in,
// and pointers (`enforced_by`, `routes`, `decisions`, `superseded_by`, the
// guide registry). It never reads section headings or prose; those belong to
// their authors (`.claude/rules/documentation.md`).
//
// Versions are not written here. `updated` and `revision` come from Git at build
// time (`scripts/build-docs-vault.mjs`), so a hand-written counter is rejected.
// The one enforced bump: a changed `contract_version` must arrive with a new
// decision record that cites the document.
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
} from './lib/doc-types.mjs';
import { parseFrontmatter } from './lib/parse-frontmatter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A scan over too few documents means the walk broke, not that the docs are clean. */
export const MIN_CHECKED = 40;

export function listLivingDocs(root = ROOT) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
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

/** Whether a route like `/project/[slug]` or `/topology?mode=focus` has a page under `app/[locale]`. */
export function routeExists(route, root = ROOT) {
  if (typeof route !== 'string' || !route.startsWith('/')) return false;
  const segments = route.split(/[?#]/)[0].split('/').filter(Boolean);
  let dir = path.join(root, 'app', '[locale]');
  for (const segment of segments) {
    const exact = path.join(dir, segment);
    if (existsSync(exact)) {
      dir = exact;
      continue;
    }
    const dynamic = existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).find((entry) => entry.isDirectory() && /^\[.+\]$/.test(entry.name))
      : null;
    if (!dynamic) return false;
    dir = path.join(dir, dynamic.name);
  }
  return existsSync(path.join(dir, 'page.tsx'));
}

function decisionIds(root) {
  const dir = path.join(root, 'docs', 'records', 'decisions');
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.md')) : [];
}

function asList(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === '' ? [] : [value];
}

/** Problems in one document's frontmatter, as `{ file, key, message }`. */
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
  if (frontmatter.status !== undefined && !statusValues(docType).includes(frontmatter.status)) {
    report('status', `"${frontmatter.status}" is not one of ${statusValues(docType).join(', ')}`);
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
    if (!routeExists(route, root)) report('routes', `${route} has no page under app/[locale]`);
  }
  if ('decisions' in frontmatter && !Array.isArray(frontmatter.decisions)) report('decisions', 'must be a list');
  for (const id of asList(frontmatter.decisions)) {
    const text = String(id);
    if (text.length < 8 || !decisions.some((name) => name.includes(text))) {
      report('decisions', `${text} names no fragment under docs/records/decisions/`);
    }
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
  return { checked: files.length, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { checked, problems } = run();
  if (checked < MIN_CHECKED) {
    console.error(`[docs:meta] only ${checked} living documents found (expected at least ${MIN_CHECKED}); the walk is broken`);
    process.exit(1);
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  - ${problem.file}: \`${problem.key}\` ${problem.message}`);
    console.error(`[docs:meta] ${problems.length} problem(s) in ${checked} living documents. Templates: docs/.templates/; kinds and areas: scripts/lib/doc-types.mjs`);
    process.exit(1);
  }
  console.log(`[docs:meta] ok · ${checked} living documents carry valid metadata`);
}
