#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter } from './lib/parse-frontmatter.mjs';
import {
  migrate as migrateUidFile,
  prepare as prepareUidMigration,
} from './migrations/2026-08-02-add-node-uids.mjs';

function walkMarkdown(target) {
  const info = statSync(target);
  if (info.isFile()) return target.endsWith('.md') ? [target] : [];
  const files = [];
  const stack = [target];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
    }
  }
  return files.sort();
}

export function migrateNodeUids(targets, { write = false } = {}) {
  const files = [...new Set(targets.flatMap((target) => walkMarkdown(resolve(target))))];
  const migrationFiles = files.map((file) => ({
    path: file,
    relativePath: file,
    raw: readFileSync(file, 'utf-8'),
  }));
  const fileByPath = new Map(migrationFiles.map((file) => [file.path, file]));
  const context = prepareUidMigration(migrationFiles);
  const candidates = [];
  const preserved = [];

  for (const file of migrationFiles) {
    const { frontmatter } = parseFrontmatter(file.raw);
    if (typeof frontmatter.kind !== 'string' || !frontmatter.kind.trim()) continue;
    const assignedUid = context.assignments.get(file.relativePath);
    if (assignedUid) candidates.push({ file: file.path, raw: file.raw, uid: assignedUid });
    else preserved.push({ file: file.path, uid: frontmatter.uid });
  }

  const assigned = [];
  if (write) {
    for (const candidate of candidates) {
      const file = fileByPath.get(candidate.file);
      const result = migrateUidFile(file, context);
      writeFileSync(candidate.file, result.raw, 'utf-8');
      assigned.push({ file: candidate.file, uid: candidate.uid });
    }
  }

  return {
    scanned: files.length,
    candidates: candidates.map(({ file }) => file),
    preserved,
    assigned,
  };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(
      'Compatibility wrapper. Prefer: pnpm vault:migrate 2026-08-02-add-node-uids --vault <dir> [--write]\n',
    );
    return;
  }
  const write = argv.includes('--write');
  const targets = argv.filter((arg) => arg !== '--write');
  const selected = targets.length > 0 ? targets : ['docs/ontology', 'samples'];
  const result = migrateNodeUids(selected, { write });
  const action = write ? `assigned ${result.assigned.length}` : `would assign ${result.candidates.length}`;
  process.stdout.write(
    `[migrate-node-uids] scanned ${result.scanned}; preserved ${result.preserved.length}; ${action}.\n`,
  );
  if (!write && result.candidates.length > 0) {
    process.stdout.write('Re-run with --write after reviewing the candidate count.\n');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
