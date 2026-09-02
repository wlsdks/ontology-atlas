/**
 * The decision-record template, as a check.
 *
 * Measured on 2026-09-02: 478 records over 38 days (median 11 a day), median
 * 51 lines and 3.7 KB each, nine bold labels apiece, and the "active format"
 * of 2026-09-01 asked for fifteen fields. The ledger's own contract needs six
 * things from a record: what forced it, what it builds on, what was decided,
 * the strongest losing argument, the observation that reopens it, and who is
 * accountable. Everything else the pilot register already types per run.
 *
 * So from `TEMPLATE_SINCE` a record is exactly these six fields in this order,
 * inside a size that fits one screen. Older records are append-only evidence
 * and are not judged. The rule is mechanical on purpose: a template that lives
 * in prose is followed by whoever remembers it, which is how the ledger got to
 * two megabytes.
 */

export const TEMPLATE_SINCE = '2026-09-03';

export const FIELDS = ['Why', 'Prior', 'Decision', 'Dissent', 'Falsifier', 'Owner'];

export const LIMITS = { lines: 24, bytes: 2000 };

export const TEMPLATE = `## YYYY-MM-DD — <the decision in one line>

**Why**: <the observation that forced a decision>
**Prior**: <YYYY-MM-DD (n) cited as standing or overturned, or none>
**Decision**: <what is decided, the smallest slice>
**Dissent**: <the strongest losing argument and whose it was, or none>
**Falsifier**: <the one observable condition that reopens this>
**Owner**: <the accountable person>`;

const LABEL = /^\*\*([^*]+)\*\*/;

/**
 * Problems with one record against the template; empty when it conforms.
 * `record` is a `parseLedger` record: { line, date, title, body }.
 */
export function checkRecordTemplate(record) {
  const problems = [];
  const lines = record.body.replace(/\s+$/, '').split('\n');
  const bytes = Buffer.byteLength(record.body.trim());
  if (lines.length > LIMITS.lines) problems.push(`${lines.length} lines; the template allows ${LIMITS.lines}`);
  if (bytes > LIMITS.bytes) problems.push(`${bytes} bytes; the template allows ${LIMITS.bytes}`);

  const labels = [];
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) problems.push(`sub-heading "${line.trim()}"; a record has fields, not sections`);
    const label = LABEL.exec(line);
    if (label) labels.push(label[1].replace(/[:：]\s*$/, '').trim());
  }
  const expected = FIELDS.join(' · ');
  const found = labels.join(' · ');
  if (found !== expected) {
    const missing = FIELDS.filter((f) => !labels.includes(f));
    const extra = labels.filter((l) => !FIELDS.includes(l));
    if (missing.length > 0) problems.push(`missing field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
    if (extra.length > 0) problems.push(`field${extra.length > 1 ? 's' : ''} outside the template: ${extra.join(', ')}`);
    if (missing.length === 0 && extra.length === 0) problems.push(`fields out of order: ${found} (expected ${expected})`);
  }
  for (const line of lines) {
    const label = LABEL.exec(line);
    if (label && FIELDS.includes(label[1].replace(/[:：]\s*$/, '').trim()) && line.replace(LABEL, '').replace(/^[:：]?\s*/, '').trim() === '') {
      problems.push(`empty field: ${label[1].trim()}`);
    }
  }
  return problems;
}

/** Records dated on or after `since` that break the template, with their problems. */
export function checkLedgerTemplate(records, { since = TEMPLATE_SINCE } = {}) {
  return records
    .filter((record) => record.date >= since)
    .map((record) => ({ record, problems: checkRecordTemplate(record) }))
    .filter((entry) => entry.problems.length > 0);
}
