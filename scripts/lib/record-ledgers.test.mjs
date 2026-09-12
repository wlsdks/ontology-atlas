import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { readLedgerSource } from './record-ledgers.mjs';

const hash = (s) => createHash('sha256').update(s).digest('hex');
function repo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'record-ledgers-'));
  mkdirSync(path.join(root, 'docs/records/decisions'), { recursive: true });
  mkdirSync(path.join(root, 'docs/records/changes'), { recursive: true });
  mkdirSync(path.join(root, 'docs/records/releases'), { recursive: true });
  const decisions = '# DECISIONS\n\nPreamble.\n\n## 2026-01-01 — legacy\n\n**Decision**: legacy.\n';
  const changelog = '# CHANGELOG\n\nPreamble.\n\n---\n\n## 2026-01-01 · v1.0.0: legacy\n\n**Added**: legacy.\n';
  writeFileSync(path.join(root, 'docs/DECISIONS.md'), decisions);
  writeFileSync(path.join(root, 'docs/CHANGELOG.md'), changelog);
  writeFileSync(path.join(root, 'docs/records/legacy.json'), JSON.stringify({ version: 1, documents: { 'docs/DECISIONS.md': { sha256: hash(decisions) }, 'docs/CHANGELOG.md': { sha256: hash(changelog) } } }));
  return root;
}
describe('record ledgers', () => {
  it('keeps legacy mode byte-compatible without policy or fragments', () => {
    const root = repo();
    rmSync(path.join(root, 'docs/records/legacy.json'));
    assert.equal(readLedgerSource('docs/DECISIONS.md', { root }).content, readFile(root, 'docs/DECISIONS.md'));
  });
  it('orders simultaneous decisions by stable id and rejects duplicate ids', () => {
    const root = repo();
    const ids = ['ffffffff-ffff-4fff-8fff-ffffffffffff', '11111111-1111-4111-8111-111111111111'];
    for (const [index, id] of ids.entries()) writeFileSync(path.join(root, `docs/records/decisions/2026-02-02-d${index}-${id}.md`), `---\nid: ${id}\ndate: 2026-02-02\n---\n## 2026-02-02 — decision ${index}\n\n**Why**: why.\n**Prior**: none.\n**Decision**: yes.\n**Dissent**: none.\n**Falsifier**: no.\n**Owner**: owner.\n`);
    const content = readLedgerSource('docs/DECISIONS.md', { root }).content;
    assert.ok(content.indexOf('decision 1') < content.indexOf('decision 0'));
    writeFileSync(path.join(root, `docs/records/changes/2026-02-02-dup-${ids[0]}.md`), `---\nid: ${ids[0]}\ndate: 2026-02-02\ncategory: Added\n---\nduplicate only across ledger types is allowed\n`);
    assert.match(readLedgerSource('docs/DECISIONS.md', { root }).content, /decision 0/);
  });
  it('rejects unknown and double release assignments', () => {
    const root = repo(); const id = randomUUID();
    writeFileSync(path.join(root, `docs/records/changes/2026-02-01-a-${id}.md`), `---\nid: ${id}\ndate: 2026-02-01\ncategory: Added\n---\nA\n`);
    writeFileSync(path.join(root, 'docs/records/releases/v1.1.0.md'), `---\nversion: v1.1.0\ndate: 2026-02-02\ntitle: one\n---\n- ${randomUUID()}\n`);
    assert.throws(() => readLedgerSource('docs/CHANGELOG.md', { root }), /unknown change id/);
    writeFileSync(path.join(root, 'docs/records/releases/v1.1.0.md'), `---\nversion: v1.1.0\ndate: 2026-02-02\ntitle: one\n---\n- ${id}\n`);
    writeFileSync(path.join(root, 'docs/records/releases/v1.2.0.md'), `---\nversion: v1.2.0\ndate: 2026-02-03\ntitle: two\n---\n- ${id}\n`);
    assert.throws(() => readLedgerSource('docs/CHANGELOG.md', { root }), /assigned by both/);
  });
  it('aggregates distinct changes and additive releases', () => {
    const root = repo(); const a = randomUUID(); const b = randomUUID();
    writeFileSync(path.join(root, `docs/records/changes/2026-02-01-a-${a}.md`), `---\nid: ${a}\ndate: 2026-02-01\ncategory: Added\n---\nnew A\n`);
    writeFileSync(path.join(root, `docs/records/changes/2026-02-02-b-${b}.md`), `---\nid: ${b}\ndate: 2026-02-02\ncategory: Fixed\n---\nfixed B\n`);
    writeFileSync(path.join(root, 'docs/records/releases/v1.1.0.md'), `---\nversion: v1.1.0\ndate: 2026-02-03\ntitle: release\n---\n- ${a}\n`);
    const result = readLedgerSource('docs/CHANGELOG.md', { root });
    assert.match(result.content, /Unreleased[\s\S]*Fixed.*fixed B/);
    assert.match(result.content, /v1\.1\.0: release[\s\S]*Added.*new A/);
    assert.ok(result.inputs.some((p) => p.endsWith(`${b}.md`)));
  });
  it('rejects a frozen legacy edit and fragments without policy', () => {
    const root = repo();
    writeFileSync(path.join(root, 'docs/DECISIONS.md'), 'changed');
    assert.throws(() => readLedgerSource('docs/DECISIONS.md', { root }), /changed after it was frozen/);
  });
  it('uses the greatest legacy date and rejects an existing legacy release version', () => {
    const root = repo(); const id = randomUUID();
    const legacy = '# CHANGELOG\n\n## 2026-03-01 · v1.2.0: newer\n\n**Added**: newer.\n\n## 2026-04-01 · v1.1.0: greatest date appears later\n\n**Fixed**: later.\n';
    writeFileSync(path.join(root, 'docs/CHANGELOG.md'), legacy);
    const decisions = readFile(root, 'docs/DECISIONS.md');
    writeFileSync(path.join(root, 'docs/records/legacy.json'), JSON.stringify({ version: 1, documents: { 'docs/DECISIONS.md': { sha256: hash(decisions) }, 'docs/CHANGELOG.md': { sha256: hash(legacy) } } }));
    writeFileSync(path.join(root, `docs/records/changes/2026-04-02-a-${id}.md`), `---\nid: ${id}\ndate: 2026-04-02\ncategory: Added\n---\nA\n`);
    writeFileSync(path.join(root, 'docs/records/releases/v1.2.0.md'), `---\nversion: v1.2.0\ndate: 2026-04-02\ntitle: duplicate\n---\n- ${id}\n`);
    assert.throws(() => readLedgerSource('docs/CHANGELOG.md', { root }), /already exists in the frozen changelog/);
  });
  it('rejects impossible calendar dates without trusting their shape', () => {
    const root = repo(); const id = randomUUID();
    writeFileSync(path.join(root, `docs/records/changes/2026-02-30-a-${id}.md`), `---\nid: ${id}\ndate: 2026-02-30\ncategory: Added\n---\nA\n`);
    assert.throws(() => readLedgerSource('docs/CHANGELOG.md', { root }), /real YYYY-MM-DD calendar date/);
  });
});

function readFile(root, relative) { return readFileSync(path.join(root, relative), 'utf8'); }
