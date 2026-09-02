#!/usr/bin/env node
/**
 * `pnpm changelog:check` — every entry in `docs/CHANGELOG.md` fits the entry
 * template, and the file keeps one Unreleased entry at the top.
 *
 * The template and the measurement behind it live in
 * `scripts/lib/changelog-entry-template.mjs`. This gate runs inside
 * `pnpm docs:check`, so the pre-push docs lane and CI see it; it judges shape
 * and size, not whether the entry says anything true.
 */

import { readFileSync } from 'node:fs';

import { CATEGORIES, LIMITS, TEMPLATE, checkChangelogTemplate, parseChangelog } from './lib/changelog-entry-template.mjs';

const FILE = 'docs/CHANGELOG.md';

export function runChangelogCheck(argv, io = console, { cwd = process.cwd() } = {}) {
  if (argv.includes('--template')) {
    io.log(TEMPLATE);
    return 0;
  }
  const entries = parseChangelog(readFileSync(`${cwd}/${FILE}`, 'utf8'));
  const { entries: broken, shape } = checkChangelogTemplate(entries);
  if (broken.length === 0 && shape.length === 0) {
    io.log(`[changelog] ${entries.length} entries fit the template ✓`);
    return 0;
  }
  for (const problem of shape) io.error(`[changelog] ${problem}`);
  if (broken.length > 0) io.error(`[changelog] ${broken.length} entr${broken.length === 1 ? 'y does' : 'ies do'} not fit the template:`);
  for (const { entry, problems } of broken.slice(0, 20)) {
    io.error(`[changelog]   ${FILE}:${entry.line}  ${entry.date}  ${entry.title.slice(0, 70)}`);
    for (const problem of problems) io.error(`[changelog]     - ${problem}`);
  }
  if (broken.length > 20) io.error(`[changelog]   ...and ${broken.length - 20} more`);
  io.error(`
[changelog] An entry is a dated heading naming a release or the single Unreleased entry, then one to four
[changelog] category lines in this order, ${CATEGORIES.join(', ')}, within ${LIMITS.lines} lines and ${LIMITS.bytes} bytes:
${TEMPLATE.split('\n').map((line) => `[changelog]   ${line}`).join('\n')}
[changelog]
[changelog] A pull request adds a line to the Unreleased entry; the release cut renames that entry to its tag.
[changelog] What a user cannot see belongs in the commit message, not here.`);
  return 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runChangelogCheck(process.argv.slice(2));
}
