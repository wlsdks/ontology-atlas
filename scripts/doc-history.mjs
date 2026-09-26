#!/usr/bin/env node
// Prints one document's history: its commits, across every path it had
// (`docs/.moved.json`), then the decision and change records that cite it.
//
//   pnpm doc:history -- docs/contracts/analysis-records.md
//
// A document's version is this history. Nobody writes a version number into the
// file; `revision` in the app is the count of the commits listed here.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The path and every earlier path it was moved from, newest first. */
export function formerPaths(repoPath, movedMap) {
  const reverse = Object.fromEntries(Object.entries(movedMap).map(([from, to]) => [to, from]));
  const chain = [repoPath];
  while (reverse[chain.at(-1)] && !chain.includes(reverse[chain.at(-1)])) chain.push(reverse[chain.at(-1)]);
  return chain;
}

/** Record fragments under docs/records/ whose text cites any of the paths. */
export function citingRecords(paths, root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md') && entry.name !== 'README.md') {
        const text = readFileSync(full, 'utf8');
        if (paths.some((candidate) => text.includes(candidate))) out.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  const records = path.join(root, 'docs', 'records');
  if (existsSync(records)) walk(records);
  return out.sort();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const target = process.argv.slice(2).find((arg) => arg !== '--');
  if (!target) {
    console.error('Usage: pnpm doc:history -- docs/<path>.md');
    process.exit(1);
  }
  const movedFile = path.join(ROOT, 'docs', '.moved.json');
  const movedMap = existsSync(movedFile) ? JSON.parse(readFileSync(movedFile, 'utf8')) : {};
  const paths = formerPaths(target, movedMap);
  const log = execFileSync('git', ['log', '--format=%h %cs %s', '--', ...paths], { cwd: ROOT, encoding: 'utf8' }).trim();
  const commits = log ? log.split('\n') : [];
  console.log(`${target} · revision ${commits.length}${paths.length > 1 ? ` · earlier paths: ${paths.slice(1).join(', ')}` : ''}`);
  for (const line of commits) console.log(`  ${line}`);
  const records = citingRecords(paths);
  if (records.length > 0) {
    console.log('Records citing it:');
    for (const record of records) console.log(`  ${record}`);
  }
}
