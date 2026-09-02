import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseLedger } from '../decisions-find.mjs';
import { FIELDS, LIMITS, TEMPLATE, checkLedgerTemplate, checkRecordTemplate } from './decision-record-template.mjs';

const GOOD = `## 2026-09-03 — The census header loses its bracket

**Why**: Codex marked the SessionStart hook failed on every session; a leading \`[\` reads as JSON.
**Prior**: 2026-09-01 (PreCompact wiring) overturned; none standing.
**Decision**: both trees print \`ontology vault @ …\` unbracketed; one format for both runtimes.
**Dissent**: keep the Claude format and adapt only Codex (owner); lost because two formats drift.
**Falsifier**: a runtime that needs the bracket back, measured by a failed SessionStart with the plain line.
**Owner**: stark
`;

const record = (text) => parseLedger(text)[0];

describe('decision record template', () => {
  it('documents itself with the same six fields the check enforces', () => {
    const labels = [...TEMPLATE.matchAll(/^\*\*([^*]+)\*\*/gm)].map((m) => m[1]);
    assert.deepEqual(labels, FIELDS);
  });

  it('accepts a record that is exactly the six fields in order', () => {
    assert.deepEqual(checkRecordTemplate(record(GOOD)), []);
  });

  it('names a missing field and a field outside the template', () => {
    const text = GOOD.replace('**Dissent**: keep the Claude format and adapt only Codex (owner); lost because two formats drift.\n', '')
      .replace('**Owner**: stark', '**Owner**: stark\n**Review footprint**: two reviewers');
    assert.deepEqual(checkRecordTemplate(record(text)), [
      'missing field: Dissent',
      'field outside the template: Review footprint',
    ]);
  });

  it('rejects the fields out of order, so every record reads the same way', () => {
    const text = GOOD.replace('**Why**', '**Temp**').replace('**Decision**', '**Why**').replace('**Temp**', '**Decision**');
    assert.match(checkRecordTemplate(record(text))[0], /^fields out of order: Decision · Prior · Why/);
  });

  it('rejects sub-headings and empty fields', () => {
    const text = GOOD.replace('**Owner**: stark', '### Details\n\nmore\n\n**Owner**:');
    const problems = checkRecordTemplate(record(text));
    assert.ok(problems.some((p) => p.startsWith('sub-heading "### Details"')), problems.join('\n'));
    assert.ok(problems.includes('empty field: Owner'), problems.join('\n'));
  });

  it('caps a record at one screen', () => {
    const padded = GOOD.replace('**Owner**: stark', `**Owner**: stark\n${'x\n'.repeat(LIMITS.lines)}`);
    assert.match(checkRecordTemplate(record(padded))[0], new RegExp(`lines; the template allows ${LIMITS.lines}`));
    const heavy = GOOD.replace('**Decision**: both trees', `**Decision**: ${'x'.repeat(LIMITS.bytes)} both trees`);
    assert.match(checkRecordTemplate(record(heavy))[0], new RegExp(`bytes; the template allows ${LIMITS.bytes}`));
  });

  it('judges only records dated on or after the cutoff; history is evidence, not a defect', () => {
    const ledger = `## 2026-08-01 — old and long\n\n**소집**: council\n**정한 것**: a\n\n${GOOD}\n## 2026-09-04 — new and wrong\n\n**Decision**: only this.\n`;
    const broken = checkLedgerTemplate(parseLedger(ledger), { since: '2026-09-03' });
    assert.deepEqual(broken.map((b) => b.record.date), ['2026-09-04']);
    assert.match(broken[0].problems[0], /^missing fields: Why, Prior, Dissent, Falsifier, Owner/);
  });
});
