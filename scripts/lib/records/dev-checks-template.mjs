/**
 * The contributor command registry: the README command table stays sorted by command, and every
 * `pnpm` name it or `docs/DEVELOPMENT-CHECKS.md` names is a real root script.
 */

/** pnpm's own commands, which name no package.json script. */
const PNPM_BUILTINS = new Set(['add', 'audit', 'dlx', 'exec', 'i', 'install', 'outdated', 'patch', 'remove', 'update', 'why']);

/**
 * Script names a text invokes: `pnpm <name>` and `pnpm run <name>`. A pnpm
 * builtin such as `pnpm exec` and `pnpm --dir <pkg> <name>`, which runs another
 * package's script, name no root script and are left alone.
 */
const commandsIn = (text) =>
  [...text.matchAll(/`pnpm (?:run )?([^\s`]+)/g)]
    .map((m) => m[1])
    .filter((name) => !PNPM_BUILTINS.has(name) && !name.startsWith('-'));

/** Numbered lines (`{ line, text }`, 1-based) of a whole document. */
export const numberedLines = (text) => text.split('\n').map((line, i) => ({ line: i + 1, text: line }));

/** `{ line, name }` for each `pnpm` name in the numbered lines that `scripts` (package.json's map) lacks. */
export function missingScripts(lines, scripts) {
  return lines.flatMap(({ line, text }) => commandsIn(text).filter((name) => !(name in scripts)).map((name) => ({ line, name })));
}

/*
 * Order keys: a list sorted by a derivable key puts an addition beside its alphabetical neighbour,
 * so two branches that each add a row do not conflict. Keys compare by code point after
 * lowercasing.
 */

const orderKey = (text) => text.toLowerCase();
const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * The fewest items (`{ key, line, label }`) to move so the list is sorted: the
 * complement of a longest sorted subsequence, O(n^2). Each names the kept neighbour it
 * belongs beside (`where` is `above` or `below`). Empty when the list is sorted,
 * and exactly the inserted item when one addition landed in the wrong place.
 */
export function orderProblems(items) {
  const n = items.length;
  const length = new Array(n).fill(1);
  const prev = new Array(n).fill(-1);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (byKey(items[j], items[i]) <= 0 && length[j] + 1 > length[i]) {
        length[i] = length[j] + 1;
        prev[i] = j;
      }
    }
  }
  const kept = new Set();
  let at = n === 0 ? -1 : length.indexOf(Math.max(...length));
  while (at >= 0) {
    kept.add(at);
    at = prev[at];
  }
  const sorted = items.filter((_, i) => kept.has(i));
  return items
    .filter((_, i) => !kept.has(i))
    .map((item) => {
      const next = sorted.find((k) => byKey(k, item) > 0);
      const anchor = next ?? sorted.at(-1);
      return { line: item.line, label: item.label, where: next ? 'above' : 'below', anchor: anchor.line, anchorLabel: anchor.label };
    });
}

export const COMMAND_TABLE_HEADER = '| Command | What it answers |';

/** Where the README contributor command table's rows are: `{ start, end }` line indexes, end exclusive. */
function commandTableRange(lines) {
  const header = lines.findIndex((line) => line.trim() === COMMAND_TABLE_HEADER);
  if (header < 0) return null;
  let end = header + 2;
  while (end < lines.length && lines[end].startsWith('|')) end += 1;
  return { start: header + 2, end };
}

const rowCommand = (row) => /`([^`]+)`/.exec(row.split('|')[1] ?? '')?.[1] ?? row;

/** README command-table rows as order items, keyed by the first command they name; null without the table. */
export function commandTableOrderItems(text) {
  const lines = text.split('\n');
  const range = commandTableRange(lines);
  if (!range) return null;
  return lines.slice(range.start, range.end).map((row, i) => ({
    key: orderKey(rowCommand(row)),
    line: range.start + i + 1,
    label: rowCommand(row),
  }));
}

/** The README command table's rows as numbered lines; empty without the table. */
export function commandTableLines(text) {
  const range = commandTableRange(text.split('\n'));
  return range ? numberedLines(text).slice(range.start, range.end) : [];
}

/** The README with its contributor command table rows sorted by command. */
export function sortCommandTable(text) {
  const lines = text.split('\n');
  const range = commandTableRange(lines);
  if (!range) return text;
  const rows = lines.slice(range.start, range.end).map((row) => ({ key: orderKey(rowCommand(row)), row }));
  const sorted = [...rows].sort(byKey).map((r) => r.row);
  return [...lines.slice(0, range.start), ...sorted, ...lines.slice(range.end)].join('\n');
}
