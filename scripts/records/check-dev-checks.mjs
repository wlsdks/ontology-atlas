#!/usr/bin/env node
/**
 * `pnpm dev-checks:check` — the README contributor command table stays sorted by command, so
 * parallel branches that each add a row insert at different lines instead of the same last row,
 * and every `pnpm` name that table or `docs/DEVELOPMENT-CHECKS.md` names is a package.json
 * script. `-- --fix` sorts the table in place.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import {
  COMMAND_TABLE_HEADER,
  commandTableLines,
  commandTableOrderItems,
  missingScripts,
  numberedLines,
  orderProblems,
  sortCommandTable,
} from '../lib/records/dev-checks-template.mjs';

const FILE = 'docs/DEVELOPMENT-CHECKS.md';
const README = 'README.md';

export function runDevChecksCheck(argv, io = console, { cwd = process.cwd() } = {}) {
  if (argv.includes('--fix')) {
    writeFileSync(`${cwd}/${README}`, sortCommandTable(readFileSync(`${cwd}/${README}`, 'utf8')));
  }
  const scripts = JSON.parse(readFileSync(`${cwd}/package.json`, 'utf8')).scripts ?? {};
  const readme = readFileSync(`${cwd}/${README}`, 'utf8');
  const table = commandTableOrderItems(readme);
  const problems = [];
  if (!table) problems.push(`${README} has no "${COMMAND_TABLE_HEADER}" table; the command registry lives there`);
  const order = orderProblems(table ?? []).map(
    (p) => `${README}:${p.line}  "${p.label}" is out of command order; move it ${p.where} line ${p.anchor} ("${p.anchorLabel}")`,
  );
  const missing = [
    ...missingScripts(commandTableLines(readme), scripts).map((m) => ({ ...m, file: README })),
    ...missingScripts(numberedLines(readFileSync(`${cwd}/${FILE}`, 'utf8')), scripts).map((m) => ({ ...m, file: FILE })),
  ].map((m) => `${m.file}:${m.line}  \`pnpm ${m.name}\` is not a package.json script`);
  if (problems.length === 0 && order.length === 0 && missing.length === 0) {
    io.log(`[dev-checks] the README command table (${table.length} rows) is in command order and every pnpm name is a real script ✓`);
    return 0;
  }
  for (const problem of [...problems, ...missing]) io.error(`[dev-checks] ${problem}`);
  if (order.length > 0) {
    io.error(`[dev-checks] ${order.length} row${order.length === 1 ? ' is' : 's are'} out of order (keys compare lowercased, by code point):`);
    for (const line of order.slice(0, 20)) io.error(`[dev-checks]   ${line}`);
    if (order.length > 20) io.error(`[dev-checks]   ...and ${order.length - 20} more`);
    io.error('[dev-checks]   `pnpm dev-checks:check -- --fix` sorts the table in place.');
  }
  return 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runDevChecksCheck(process.argv.slice(2));
}
