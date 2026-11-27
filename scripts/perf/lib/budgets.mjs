// Reads scripts/perf/budgets.json and prints every budget row for one measured run.
import { readFileSync } from 'node:fs';

const BUDGETS = JSON.parse(readFileSync(new URL('../budgets.json', import.meta.url), 'utf8'));

/** The limit for `files` documents of `shape`: the exact size, else the next larger budgeted size. */
function limitFor(row, shape, files) {
  const table = { ...row.limits['*'], ...row.limits[shape] };
  const sizes = Object.keys(table).map(Number).sort((a, b) => a - b);
  const size = sizes.find((candidate) => candidate >= files);
  return size === undefined ? null : table[size];
}

function format(value, unit) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (unit === 's') return value.toFixed(2);
  if (unit === 'ms') return value.toFixed(1);
  return value.toFixed(0);
}

/**
 * Prints the whole budget table for one run. `measured` maps a row id to a number, or to
 * `{ value, note }`. A row another command owns names that command; a row this command owns but
 * did not measure says why when `notes[id]` explains it. Returns the rows over their limit.
 */
export function printBudgetTable({ command, shape, files, measured, notes = {}, gated = true }) {
  const over = [];
  console.log(`\n| Budget (${shape}, ${files.toLocaleString('en-US')} files) | Limit | Measured | Verdict |`);
  console.log('|---|---|---|---|');
  for (const row of BUDGETS.rows) {
    const limit = limitFor(row, shape, files);
    const limitText = limit === null ? '—' : `≤ ${limit} ${row.unit}`;
    const owned = row.command.split(' ').includes(command);
    const entry = measured[row.id];
    const value = typeof entry === 'object' && entry !== null ? entry.value : entry;
    const entryNote = typeof entry === 'object' && entry !== null ? (entry.note ?? null) : null;
    let shown;
    let verdict;
    if (!owned) {
      shown = '—';
      verdict = `measured by ${row.command.startsWith('perf:') ? `pnpm ${row.command}` : row.command}`;
    } else if (format(value, row.unit) === null) {
      shown = 'n.m.';
      verdict = entryNote ?? notes[row.id] ?? 'not measured in this run';
    } else {
      shown = `${format(value, row.unit)} ${row.unit}`;
      if (limit === null) verdict = 'no limit at this size';
      else if (!gated) verdict = value <= limit ? 'within (reported only)' : 'over (reported only)';
      else if (value <= limit) verdict = 'within';
      else {
        verdict = 'OVER';
        over.push({ id: row.id, value, limit, unit: row.unit });
      }
      if (entryNote) verdict += `; ${entryNote}`;
    }
    console.log(`| ${row.label} | ${limitText} | ${shown} | ${verdict} |`);
  }
  return over;
}
