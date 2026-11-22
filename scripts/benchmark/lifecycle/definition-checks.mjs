// Checks the benchmark's own definitions: fixtures exist, evidence is scored on
// the side that could have written it, and fixture sections match the real vault.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CASES, TASKS, classifyEvidence } from './definitions.mjs';
import { FIXTURE_ROOT, REPO_ROOT } from './paths.mjs';

// Compares the fixture's section headings with the vault this repository keeps, so the
// benchmark cannot measure a section the product never produces.
export function fixtureHeadings() {
  const headings = new Set();
  for (const entry of CASES) {
    for (const node of entry.nodes) {
      for (const line of node.body.split('\n')) {
        if (line.startsWith('## ')) headings.add(line.slice(3).trim());
      }
    }
  }
  return headings;
}

export function vaultHeadings(vaultRoot = join(REPO_ROOT, 'docs/ontology')) {
  const headings = new Set();
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.name.endsWith('.md')) {
        for (const line of readFileSync(target, 'utf8').split('\n')) {
          if (line.startsWith('## ')) headings.add(line.slice(3).trim());
        }
      }
    }
  };
  if (existsSync(vaultRoot)) walk(vaultRoot);
  return headings;
}

export function validateDefinitions() {
  const errors = [];
  for (const entry of CASES) {
    if (!existsSync(join(FIXTURE_ROOT, entry.fixture))) errors.push(`${entry.id}: missing fixture`);
    if (TASKS[entry.id].length === 0) errors.push(`${entry.id}: no tasks`);
    const vaultSlugs = new Set(entry.nodes.map((node) => node.slug));
    for (const task of TASKS[entry.id]) {
      if (task.required.length === 0) errors.push(`${task.id}: no required evidence`);
      if (!task.prompt || !task.axis) errors.push(`${task.id}: incomplete task`);
      for (const token of task.required) {
        const kind = classifyEvidence(token);
        const onDisk = existsSync(join(FIXTURE_ROOT, entry.fixture, token));
        if (kind === 'vocabulary') {
          // A concept name must be a real entry in this subject's vault and absent from the source
          // tree, so "the side without a vault cannot score this" is a fact.
          if (!vaultSlugs.has(token)) {
            errors.push(`${task.id}: "${token}" is scored as an Atlas concept name, but the ${entry.id} vault has no such entry. Add it to the vault or score something both sides can write.`);
          }
          if (onDisk) {
            errors.push(`${task.id}: "${token}" is scored as an Atlas concept name, but it also exists in the ${entry.fixture} source tree, so the side without a vault could reach it. It is not Atlas-only.`);
          }
        } else if (kind === 'path') {
          if (!onDisk) {
            errors.push(`${task.id}: "${token}" is scored as a source path, but it does not exist in the ${entry.fixture} fixture. Neither side can name a file that is not there.`);
          }
        } else if (vaultSlugs.has(token)) {
          errors.push(`${task.id}: "${token}" is an entry in the ${entry.id} vault, so it cannot be scored as an ordinary phrase both sides could write.`);
        }
      }
    }
    for (const entryNode of entry.nodes) {
      if (!entryNode.slug || !entryNode.kind || !entryNode.title || !entryNode.body) errors.push(`${entry.id}: incomplete node`);
    }
  }
  const realHeadings = vaultHeadings();
  if (realHeadings.size > 0) {
    for (const heading of [...fixtureHeadings()].sort()) {
      if (!realHeadings.has(heading)) {
        errors.push(`the prepared vault uses a "## ${heading}" section that no node in docs/ontology/ uses. Either the fixture is inventing a shape this product does not produce, or the real vault should adopt it — decide which before measuring with it.`);
      }
    }
  }
  return errors;
}
