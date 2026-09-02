#!/usr/bin/env node
/**
 * `pnpm dev-checks:check` — every entry in `docs/DEVELOPMENT-CHECKS.md` fits
 * the entry template, every `pnpm` command it names exists, and every area is
 * named once. Shape and reference integrity only; the template and the
 * measurement behind it live in `scripts/lib/dev-checks-template.mjs`.
 */

import { readFileSync } from 'node:fs';

import { FIELDS, LIMITS, TEMPLATE, checkDevChecks } from './lib/dev-checks-template.mjs';

const FILE = 'docs/DEVELOPMENT-CHECKS.md';

export function runDevChecksCheck(argv, io = console, { cwd = process.cwd() } = {}) {
  if (argv.includes('--template')) {
    io.log(TEMPLATE);
    return 0;
  }
  const scripts = JSON.parse(readFileSync(`${cwd}/package.json`, 'utf8')).scripts ?? {};
  const { shape, entries, count } = checkDevChecks(readFileSync(`${cwd}/${FILE}`, 'utf8'), { scripts });
  if (shape.length === 0 && entries.length === 0) {
    io.log(`[dev-checks] ${count} entries fit the template and name real scripts ✓`);
    return 0;
  }
  for (const problem of shape) io.error(`[dev-checks] ${problem}`);
  if (entries.length > 0) io.error(`[dev-checks] ${entries.length} entr${entries.length === 1 ? 'y does' : 'ies do'} not fit the template:`);
  for (const { entry, problems } of entries.slice(0, 20)) {
    io.error(`[dev-checks]   ${FILE}:${entry.line}  ${entry.area}`);
    for (const problem of problems) io.error(`[dev-checks]     - ${problem}`);
  }
  if (entries.length > 20) io.error(`[dev-checks]   ...and ${entries.length - 20} more`);
  io.error(`
[dev-checks] An entry is a "### <area>" heading under "## Checks", then ${FIELDS.slice(0, 3).join(', ')} (and optionally Fix),
[dev-checks] one line each, within ${LIMITS.lines} lines and ${LIMITS.bytes} bytes; every pnpm command must be a package.json script:
${TEMPLATE.split('\n').map((line) => `[dev-checks]   ${line}`).join('\n')}
[dev-checks]
[dev-checks] Why a gate exists belongs in docs/DECISIONS.md and the gate's own header, not in this reference.`);
  return 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runDevChecksCheck(process.argv.slice(2));
}
