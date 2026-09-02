/**
 * The changelog entry template, as a check.
 *
 * Measured on 2026-09-02: 415 entries in `docs/CHANGELOG.md`, 761 KB, a
 * median entry of 1.5 KB, 341 entries in Korean, and only three entries that
 * named a version. The file promised "user-visible changes, not PR-level
 * grain" and had become one entry per pull request, each a narrative. What a
 * reader of a changelog needs is one entry per release that says what was
 * added, changed, fixed, or removed, in one line each.
 *
 * So an entry is a dated heading that names a release (`vX.Y.Z:`) or the
 * single `Unreleased:` entry at the top, followed by one to four category
 * lines in a fixed order, inside a size that fits one screen. Entries dated
 * before the versioning baseline (2026-09-01) may carry a plain headline,
 * because no version existed to name. The rule is mechanical for the same
 * reason the decision-record template is: prose conventions are followed by
 * whoever remembers them.
 */

const VERSIONING_BASELINE = '2026-09-01';

export const CATEGORIES = ['Added', 'Changed', 'Fixed', 'Removed'];

export const LIMITS = { lines: 6, bytes: 900 };

export const TEMPLATE = `## YYYY-MM-DD · vX.Y.Z: <what this release means in one line>

**Added**: <a new user-visible capability or surface>
**Changed**: <behavior that differs from before>
**Fixed**: <what was wrong and is now right>
**Removed**: <what no longer exists>`;

const HEADING = /^## (\d{4}-\d{2}-\d{2}) · (.+)$/;
const RELEASE = /^(v\d+\.\d+\.\d+(?:-rc\.\d+)?|Unreleased): \S/;
const LABEL = /^\*\*([^*]+)\*\*[:：]?\s*(.*)$/;

/** Split the changelog into entries; the preamble before the first entry is dropped. */
export function parseChangelog(text) {
  const lines = text.split('\n');
  const entries = [];
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const heading = HEADING.exec(lines[i]);
    if (heading) {
      current = { line: i + 1, date: heading[1], title: heading[2].trim(), bodyLines: [] };
      entries.push(current);
      continue;
    }
    if (current) current.bodyLines.push(lines[i]);
  }
  for (const entry of entries) {
    entry.body = entry.bodyLines.join('\n');
    delete entry.bodyLines;
  }
  return entries;
}

/** Problems with one entry against the template; empty when it conforms. */
export function checkEntryTemplate(entry) {
  const problems = [];
  const release = RELEASE.exec(entry.title);
  if (entry.date >= VERSIONING_BASELINE && !release) {
    problems.push(`title must start with "vX.Y.Z: " or "Unreleased: " from ${VERSIONING_BASELINE} on`);
  }
  if (/—/.test(entry.title)) problems.push('em dash in the title; use a colon or a comma');

  const lines = entry.body.replace(/\s+$/, '').split('\n');
  const bytes = Buffer.byteLength(entry.body.trim());
  if (lines.length > LIMITS.lines) problems.push(`${lines.length} lines; the template allows ${LIMITS.lines}`);
  if (bytes > LIMITS.bytes) problems.push(`${bytes} bytes; the template allows ${LIMITS.bytes}`);
  if (/—/.test(entry.body)) problems.push('em dash in the body; use a colon or a comma');

  const labels = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    if (/^#{1,6}\s/.test(line)) {
      problems.push(`sub-heading "${line.trim()}"; an entry has category lines, not sections`);
      continue;
    }
    const label = LABEL.exec(line);
    if (!label) {
      problems.push(`line outside the template: "${line.trim().slice(0, 60)}"`);
      continue;
    }
    const name = label[1].trim();
    if (!CATEGORIES.includes(name)) {
      problems.push(`category outside the template: ${name}`);
      continue;
    }
    if (labels.includes(name)) problems.push(`repeated category: ${name}`);
    if (label[2].trim() === '') problems.push(`empty category: ${name}`);
    labels.push(name);
  }
  if (labels.length === 0) problems.push(`no category line; at least one of ${CATEGORIES.join(', ')}`);
  const order = labels.filter((l) => CATEGORIES.includes(l));
  const sorted = [...order].sort((a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b));
  if (order.join() !== sorted.join()) problems.push(`categories out of order: ${order.join(' · ')} (expected ${sorted.join(' · ')})`);
  return problems;
}

/** Whole-file rules: one Unreleased entry at most, and only at the top. */
export function checkChangelogShape(entries) {
  const problems = [];
  const unreleased = entries.map((e, i) => [e, i]).filter(([e]) => /^Unreleased: /.test(e.title));
  if (unreleased.length > 1) {
    problems.push(`${unreleased.length} Unreleased entries; keep one and add lines to it until a release names it`);
  }
  if (unreleased.length === 1 && unreleased[0][1] !== 0) {
    problems.push(`the Unreleased entry sits at position ${unreleased[0][1] + 1}; it belongs at the top`);
  }
  return problems;
}

/** Every entry that breaks the template, plus whole-file problems. */
export function checkChangelogTemplate(entries) {
  return {
    entries: entries.map((entry) => ({ entry, problems: checkEntryTemplate(entry) })).filter((e) => e.problems.length > 0),
    shape: checkChangelogShape(entries),
  };
}
