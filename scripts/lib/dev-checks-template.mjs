/**
 * The development-checks reference, as a check.
 *
 * Measured on 2026-09-02: `docs/DEVELOPMENT-CHECKS.md` was 114 KB and 1,402
 * lines, 918 of them prose, for a document whose job is to tell a contributor
 * which command to run first for an area and when to escalate. The commands
 * lived in a 60-row matrix; the other 900 lines retold the incidents behind
 * each gate, which the decision ledger and the gate headers already keep.
 *
 * So the reference is a list of entries, one per check area, each exactly:
 *
 *   ### <area>
 *   **Run**: `<the first command>`
 *   **Proves**: <what a pass means, one sentence>
 *   **Escalate**: `<command>` when <condition>, or none
 *
 * with an optional `**Fix**:` line naming what to change when it is red. One
 * screen per entry, every command a real script, every area named once.
 * `pnpm dev-checks:check` refuses anything else; the reasons behind a gate
 * belong in `docs/DECISIONS.md` and the gate's own header, not here.
 */

export const FIELDS = ['Run', 'Proves', 'Escalate', 'Fix'];
const REQUIRED = ['Run', 'Proves', 'Escalate'];
export const LIMITS = { lines: 5, bytes: 700 };

export const TEMPLATE = `### <area a contributor recognizes>

**Run**: \`pnpm <first check>\`
**Proves**: <what a pass means, in one sentence>
**Escalate**: \`pnpm <broader check>\` when <condition>, or none
**Fix**: <what to change when it is red>`;

const HEADING = /^### (.+)$/;
const LABEL = /^\*\*([^*]+)\*\*[:：]?\s*(.*)$/;

/** Entries under `### ` headings inside the `## Checks` section; the preamble is dropped. */
export function parseDevChecks(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^## Checks\b/.test(l));
  const entries = [];
  let current = null;
  for (let i = start < 0 ? lines.length : start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) break;
    const heading = HEADING.exec(lines[i]);
    if (heading) {
      current = { line: i + 1, area: heading[1].trim(), bodyLines: [] };
      entries.push(current);
      continue;
    }
    if (current) current.bodyLines.push(lines[i]);
  }
  for (const entry of entries) {
    entry.body = entry.bodyLines.join('\n');
    delete entry.bodyLines;
  }
  return { hasSection: start >= 0, entries };
}

/**
 * Script names a line invokes: `pnpm <name>` and `pnpm run <name>`. `pnpm exec`
 * runs a binary and `pnpm --dir <pkg> <name>` runs another package's script,
 * so neither names a root script and both are left alone.
 */
const commandsIn = (text) =>
  [...text.matchAll(/`pnpm (?:run )?([^\s`]+)/g)]
    .map((m) => m[1])
    .filter((name) => name !== 'exec' && !name.startsWith('-'));

/** Problems with one entry; `scripts` is package.json's script map when given. */
export function checkEntry(entry, { scripts = null } = {}) {
  const problems = [];
  const lines = entry.body.replace(/\s+$/, '').split('\n');
  const bytes = Buffer.byteLength(entry.body.trim());
  if (lines.length > LIMITS.lines) problems.push(`${lines.length} lines; the template allows ${LIMITS.lines}`);
  if (bytes > LIMITS.bytes) problems.push(`${bytes} bytes; the template allows ${LIMITS.bytes}`);
  if (/—/.test(`${entry.area}\n${entry.body}`)) problems.push('em dash; use a colon or a comma');
  const labels = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    const label = LABEL.exec(line);
    if (!label) {
      problems.push(`line outside the template: "${line.trim().slice(0, 60)}"`);
      continue;
    }
    const name = label[1].trim();
    if (!FIELDS.includes(name)) {
      problems.push(`field outside the template: ${name}`);
      continue;
    }
    if (labels.includes(name)) problems.push(`repeated field: ${name}`);
    if (label[2].trim() === '') problems.push(`empty field: ${name}`);
    labels.push(name);
    if (name === 'Run' && !/^`[^`]+`/.test(label[2].trim())) problems.push('Run must start with a command in backticks');
  }
  for (const name of REQUIRED) if (!labels.includes(name)) problems.push(`missing field: ${name}`);
  const order = labels.filter((l) => FIELDS.includes(l));
  const sorted = [...order].sort((a, b) => FIELDS.indexOf(a) - FIELDS.indexOf(b));
  if (order.join() !== sorted.join()) problems.push(`fields out of order: ${order.join(' · ')} (expected ${sorted.join(' · ')})`);
  if (scripts) {
    for (const name of commandsIn(entry.body)) {
      if (!(name in scripts)) problems.push(`\`pnpm ${name}\` is not a package.json script`);
    }
  }
  return problems;
}

/** Whole-document rules: the section exists, every area is named once. */
export function checkDevChecks(text, { scripts = null } = {}) {
  const { hasSection, entries } = parseDevChecks(text);
  const shape = [];
  if (!hasSection) shape.push('no `## Checks` section; entries live under it');
  const seen = new Map();
  for (const entry of entries) {
    const key = entry.area.toLowerCase();
    if (seen.has(key)) shape.push(`area "${entry.area}" appears twice (lines ${seen.get(key)} and ${entry.line})`);
    else seen.set(key, entry.line);
  }
  if (hasSection && entries.length === 0) shape.push('the `## Checks` section has no entries');
  return {
    shape,
    entries: entries.map((entry) => ({ entry, problems: checkEntry(entry, { scripts }) })).filter((e) => e.problems.length > 0),
    count: entries.length,
  };
}

/*
 * Order keys, so two branches that each add an entry insert in different places.
 *
 * Measured on 2026-09-26: 25 of 60 README commits added a row to the
 * contributor command table, each appended after the same last row, and #1913
 * and #1916 conflicted on that anchor within one day; the entries here were
 * appended the same way. A list sorted by a key a writer can derive puts an
 * addition beside its alphabetical neighbour instead. Keys compare by code
 * point after lowercasing, so no locale changes the order.
 */

const orderKey = (text) => text.toLowerCase();
const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * The fewest items (`{ key, line, label }`) to move so the list is sorted: the
 * complement of a longest sorted subsequence. Each names the kept neighbour it
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

/** Entries under `## Checks` as order items, keyed by area. */
export function devChecksOrderItems(text) {
  return parseDevChecks(text).entries.map((entry) => ({ key: orderKey(entry.area), line: entry.line, label: entry.area }));
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

/** The development-checks reference with its `## Checks` entries sorted by area. */
export function sortDevChecks(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^## Checks\b/.test(l));
  if (start < 0) return text;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  const first = lines.findIndex((l, i) => i > start && i < end && HEADING.test(l));
  if (first < 0) return text;
  const blocks = [];
  for (let i = first; i < end; i += 1) {
    if (HEADING.test(lines[i])) blocks.push({ key: orderKey(HEADING.exec(lines[i])[1].trim()), lines: [] });
    blocks.at(-1).lines.push(lines[i]);
  }
  const trimmed = blocks.map((block) => {
    const body = [...block.lines];
    while (body.length > 0 && body.at(-1).trim() === '') body.pop();
    return { key: block.key, text: body.join('\n') };
  });
  const sorted = [...trimmed].sort(byKey).map((block) => block.text).join('\n\n');
  const tail = end < lines.length ? `\n\n${lines.slice(end).join('\n')}` : '\n';
  return `${lines.slice(0, first).join('\n')}\n${sorted}${tail}`;
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
