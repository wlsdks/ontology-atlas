#!/usr/bin/env node
/**
 * `pnpm dev-checks:check` — every entry in `docs/DEVELOPMENT-CHECKS.md` fits
 * the entry template, every `pnpm` command it names exists, and every area is
 * named once. Shape and reference integrity only; the template and the
 * measurement behind it live in `scripts/lib/dev-checks-template.mjs`.
 *
 * It also keeps the two contributor registries order-keyed: the entries sorted
 * by area and the README command table sorted by command, so parallel branches
 * that each add one insert at different lines instead of the same last row.
 * `-- --fix` rewrites both orders in place.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import {
  COMMAND_TABLE_HEADER,
  FIELDS,
  LIMITS,
  TEMPLATE,
  checkDevChecks,
  commandTableOrderItems,
  devChecksOrderItems,
  orderProblems,
  sortCommandTable,
  sortDevChecks,
} from './lib/dev-checks-template.mjs';

const FILE = 'docs/DEVELOPMENT-CHECKS.md';
const README = 'README.md';

/** Order problems in both registries, as printable lines; empty when both are sorted. */
function orderReport(checks, readme) {
  const report = [];
  const table = commandTableOrderItems(readme);
  if (!table) report.push(`${README} has no "${COMMAND_TABLE_HEADER}" table; the command registry lives there`);
  const lists = [
    [FILE, 'area', devChecksOrderItems(checks)],
    [README, 'command', table ?? []],
  ];
  for (const [file, key, items] of lists) {
    for (const p of orderProblems(items)) {
      report.push(`${file}:${p.line}  "${p.label}" is out of ${key} order; move it ${p.where} line ${p.anchor} ("${p.anchorLabel}")`);
    }
  }
  return report;
}

export function runDevChecksCheck(argv, io = console, { cwd = process.cwd() } = {}) {
  if (argv.includes('--template')) {
    io.log(TEMPLATE);
    return 0;
  }
  if (argv.includes('--fix')) {
    writeFileSync(`${cwd}/${FILE}`, sortDevChecks(readFileSync(`${cwd}/${FILE}`, 'utf8')));
    writeFileSync(`${cwd}/${README}`, sortCommandTable(readFileSync(`${cwd}/${README}`, 'utf8')));
  }
  const scripts = JSON.parse(readFileSync(`${cwd}/package.json`, 'utf8')).scripts ?? {};
  const text = readFileSync(`${cwd}/${FILE}`, 'utf8');
  const order = orderReport(text, readFileSync(`${cwd}/${README}`, 'utf8'));
  const { shape, entries, count } = checkDevChecks(text, { scripts });
  if (shape.length === 0 && entries.length === 0 && order.length === 0) {
    io.log(`[dev-checks] ${count} entries fit the template and name real scripts; both registries are in key order ✓`);
    return 0;
  }
  for (const problem of shape) io.error(`[dev-checks] ${problem}`);
  if (order.length > 0) {
    io.error(`[dev-checks] ${order.length} registry line${order.length === 1 ? ' is' : 's are'} out of order (keys compare lowercased, by code point):`);
    for (const line of order.slice(0, 20)) io.error(`[dev-checks]   ${line}`);
    if (order.length > 20) io.error(`[dev-checks]   ...and ${order.length - 20} more`);
    io.error('[dev-checks]   `pnpm dev-checks:check -- --fix` sorts both lists in place.');
  }
  if (entries.length === 0) return 1;
  io.error(`[dev-checks] ${entries.length} entr${entries.length === 1 ? 'y does' : 'ies do'} not fit the template:`);
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
