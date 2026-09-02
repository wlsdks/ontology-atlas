import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { citedBy, findRecord, formatRecord, parseLedger, resolveRef, searchRecords } from './decisions-find.mjs';

/**
 * The fixture mirrors the two shapes the real ledger carries: numbered English
 * records with `**Decision**` / `**Falsifier**` labels, and unnumbered Korean
 * records with the Korean falsifier label. Retrieval that only understood one of them would
 * silently hide half the ledger, which is the failure this file guards.
 */
const LEDGER = `# Decisions

## 이 원장의 계약 (읽지 않으면 존재 이유가 없다)

Preamble that is not a record.

## 2026-08-16 (2) — Inside the vault auto-allow, outside ask

**Decision**: a tool call whose path is inside the vault is auto-allowed. Title strings are never a gate.

**반증 조건**: an unasked write inside the vault that a person would have refused.

## 2026-08-24 (111) — Codex leaves in-app chat until MCP writes have a gate

**Prior decisions**: 2026-08-16 (2) treated session mode as a gate. This record overturns only that claim.

**Observed falsifier**: an installed-app probe wrote a relation with no permission card.

**Decision (accountable: owner)**: remove codex-acp from the guarded table. Do not call a session mode a write gate.

**Dissent and falsifier**: if a Codex build ships a write gate, restore the row.

## 2026-09-01 — Inside-the-vault auto-allow narrows to read-only tool kinds

**Prior decision**: 2026-08-16 (2) §3 said inside the vault auto-allow, outside ask. Decisions (111) and (113) later set the standard this record applies.

**Decision**: a non-Atlas tool is auto-allowed only when its path is inside the vault AND its kind is read-only.

**Falsifier**: two weeks of real sessions in which the permission card fires for a read the person would have allowed.

## 2026-07-27 — 웹과 앱은 같은 화면을 약속하지 않는다

**결정**: 웹은 관문이고 앱이 볼트의 집이다. 화면이 같다고 약속하지 않는다.

**반증 조건**: 설치한 앱에서만 되는 능력이 웹 사용자에게 필요해지면 이 결정을 뒤집는다.
`;

describe('decision ledger retrieval', () => {
  const records = parseLedger(LEDGER);

  it('splits the ledger into dated records and drops the preamble', () => {
    assert.deepEqual(
      records.map((r) => [r.line, r.date, r.number]),
      [
        [7, '2026-08-16', 2],
        [13, '2026-08-24', 111],
        [23, '2026-09-01', null],
        [31, '2026-07-27', null],
      ],
    );
  });

  it('reads decision and falsifier fields under English and Korean labels alike', () => {
    assert.match(records[0].fields.decision, /^a tool call whose path/);
    assert.match(records[0].fields.falsifier, /^an unasked write/);
    assert.match(records[1].fields.decision, /^remove codex-acp/);
    assert.match(records[1].fields.falsifier, /^an installed-app probe/, 'the first falsifier-shaped label wins');
    assert.match(records[1].fields.dissent, /^if a Codex build/);
    assert.match(records[3].fields.decision, /^웹은 관문이고/);
    assert.match(records[3].fields.falsifier, /^설치한 앱에서만/);
  });

  it('extracts the records a record cites, by date-and-number or bare number', () => {
    assert.deepEqual(records[1].refs, [{ date: '2026-08-16', number: 2 }]);
    assert.deepEqual(records[2].refs, [
      { date: '2026-08-16', number: 2 },
      { number: 111 },
      { number: 113 },
    ]);
  });

  it('answers who cites a record later, the cheapest sign it may be overturned', () => {
    const later = citedBy(records, records[0]).map((r) => r.line);
    assert.deepEqual(later, [13, 23]);
    assert.deepEqual(citedBy(records, records[1]).map((r) => r.line), [23]);
  });

  it('ranks a record matching every term above one matching a single term many times', () => {
    const hits = searchRecords(records, ['auto-allow', 'read-only']);
    assert.equal(hits[0].line, 23);
    assert.equal(hits[1].line, 7);
    assert.equal(hits.length, 2, 'the Codex record mentions neither term');
  });

  it('honours --since and returns nothing rather than something for an unmatched query', () => {
    assert.deepEqual(searchRecords(records, ['auto-allow'], { since: '2026-09-01' }).map((r) => r.line), [23]);
    assert.deepEqual(searchRecords(records, ['nonexistent-surface']), []);
  });

  it('finds one record by number, by date, or by both', () => {
    assert.equal(findRecord(records, '111').line, 13);
    assert.equal(findRecord(records, '2026-09-01').line, 23);
    assert.equal(findRecord(records, '2026-08-16 (2)').line, 7);
    assert.equal(findRecord(records, '2026-08-16 (3)'), null);
  });

  it('prints a record as a clickable line, its decision, its falsifier, and who cites it', () => {
    const text = formatRecord(records[0], records);
    assert.match(text, /^docs\/DECISIONS\.md:7  2026-08-16 \(2\)  Inside the vault auto-allow, outside ask$/m);
    assert.match(text, /^  decision:  a tool call whose path is inside the vault is auto-allowed\.$/m);
    assert.match(text, /^  falsifier: an unasked write inside the vault that a person would have refused\.$/m);
    assert.match(text, /cited by:  2026-08-24 \(111\), 2026-09-01 — read these/);
  });

  it('resolves a bare number to the nearest earlier record when numbers repeat', () => {
    const repeated = parseLedger(
      `## 2026-08-01 (5) — first five\n\n**Decision**: a.\n\n## 2026-08-10 (5) — second five\n\n**Decision**: b.\n\n## 2026-08-20 — cites five\n\n**Decision**: applies (5).\n`,
    );
    assert.equal(resolveRef(repeated, { number: 5 }, repeated[2]).line, 5, 'the 08-10 record, not the 08-01 one');
    assert.deepEqual(citedBy(repeated, repeated[0]), []);
    assert.deepEqual(citedBy(repeated, repeated[1]).map((r) => r.line), [9]);
  });

  it('parses the real ledger: hundreds of records, most with a decision and a falsifier', () => {
    const real = parseLedger(readFileSync('docs/DECISIONS.md', 'utf8'));
    assert.ok(real.length > 400, `expected hundreds of records, parsed ${real.length}`);
    // Decision numbers repeat in this ledger (record 96 says so); the finder
    // must cope, which the test above pins, rather than assume uniqueness.
    const withDecision = real.filter((r) => r.fields.decision).length;
    const withFalsifier = real.filter((r) => r.fields.falsifier).length;
    // Measured 2026-09-02: 418/478 decisions, 365/478 falsifiers. The margin
    // below catches a label census the parser stopped understanding, not a
    // handful of records written without one.
    assert.ok(withDecision / real.length > 0.8, `only ${withDecision}/${real.length} records expose a decision label`);
    assert.ok(withFalsifier / real.length > 0.7, `only ${withFalsifier}/${real.length} records expose a falsifier label`);
  });
});
