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
