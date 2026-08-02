#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter } from './lib/parse-frontmatter.mjs';
import { generateNodeUid, inspectMergedUids, nodeUidIssue } from '../cli/src/lib/schema.mjs';

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

function insertUid(raw, uid) {
  if (raw.startsWith('---\r\n')) return `---\r\nuid: ${uid}\r\n${raw.slice(5)}`;
  if (raw.startsWith('---\n')) return `---\nuid: ${uid}\n${raw.slice(4)}`;
  throw new Error('ontology node frontmatter must start with an opening --- delimiter');
}

export function migrateNodeUids(targets, { write = false } = {}) {
  const files = [...new Set(targets.flatMap((target) => walkMarkdown(resolve(target))))];
  const candidates = [];
  const preserved = [];
  const claims = new Map();

  for (const file of files) {
    const raw = readFileSync(file, 'utf-8');
    const { frontmatter } = parseFrontmatter(raw);
    if (typeof frontmatter.kind !== 'string' || !frontmatter.kind.trim()) continue;
    const uid = frontmatter.uid;
    if (uid === undefined || uid === null || uid === '') {
      candidates.push({ file, raw });
      continue;
    }
    const issue = nodeUidIssue(uid);
    if (issue) throw new Error(`invalid UID in ${file}: ${issue}`);
    const merged = inspectMergedUids(uid, frontmatter.merged_uids);
    if (merged.invalidIssue) throw new Error(`invalid merged UID history in ${file}: ${merged.invalidIssue}`);
    if (merged.nonCanonical) throw new Error(`non-canonical merged UID history in ${file}`);
    preserved.push({ file, uid });
    for (const claimed of [uid, ...merged.canonical]) {
      const owner = claims.get(claimed);
      if (owner) throw new Error(`duplicate UID ${claimed} in ${owner} and ${file}`);
      claims.set(claimed, file);
    }
  }

  const assigned = [];
  if (write) {
    for (const candidate of candidates) {
      let uid = generateNodeUid();
      while (claims.has(uid)) uid = generateNodeUid();
      claims.set(uid, candidate.file);
      assigned.push({ file: candidate.file, uid });
    }
    // Validate the complete plan before the first byte changes, then write.
    for (const assignment of assigned) {
      const candidate = candidates.find(({ file }) => file === assignment.file);
      writeFileSync(assignment.file, insertUid(candidate.raw, assignment.uid), 'utf-8');
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
