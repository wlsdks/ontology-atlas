import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildBlindSet, collectAnswers, renderPacket, seededShuffle } from './benchmark-blind-set.mjs';

function writeCell(root, name, answer) {
  writeFileSync(join(root, name), `${JSON.stringify(answer)}\n\n[stderr]\nexec\n`, 'utf8');
}

const answer = (text) => ({ answer: text, evidence: ['README.md'], nextAction: 'Read it.', unknowns: ['nothing measured'] });

test('the packet order is reproducible from the run id alone', () => {
  const items = Array.from({ length: 24 }, (_, index) => index);
  assert.deepEqual(seededShuffle(items, 'run-a'), seededShuffle(items, 'run-a'));
  assert.notDeepEqual(seededShuffle(items, 'run-a'), seededShuffle(items, 'run-b'));
  assert.deepEqual([...seededShuffle(items, 'run-a')].sort((a, b) => a - b), items, 'nothing is lost or duplicated');
});

test('a packet withholds which side wrote each answer, and the key restores it', () => {
  const root = mkdtempSync(join(tmpdir(), 'blind-set-'));
  try {
    writeCell(root, 'run-greenfield-G1-off-r1.txt', answer('the control answer'));
    writeCell(root, 'run-greenfield-G1-on-r1.txt', answer('the Atlas answer'));
    const { entries, key, packetPath } = buildBlindSet({ runId: 'run', resultRoot: root, outputRoot: root });
    assert.equal(entries.length, 2);
    const packet = readFileSync(packetPath, 'utf8');
    assert.match(packet, /## C01/);
    assert.doesNotMatch(packet, /\boff\b|\bon\b/, 'the packet must not name the side');
    assert.doesNotMatch(packet, /run-greenfield/, 'the packet must not leak the filename');
    assert.deepEqual(Object.keys(key).sort(), ['C01', 'C02']);
    assert.deepEqual(Object.values(key).map((row) => row.side).sort(), ['off', 'on']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the question is kept, because grading without it is impossible', () => {
  const packet = renderPacket({
    runId: 'run',
    entries: [{ id: 'C01', task: 'G2', answer: answer('a boundary answer'), parseError: null }],
  });
  assert.match(packet, /question G2/);
  assert.match(packet, /a boundary answer/);
  assert.match(packet, /Next step proposed/);
});

test('an unreadable answer is shown as one, not silently dropped', () => {
  const root = mkdtempSync(join(tmpdir(), 'blind-set-'));
  try {
    writeFileSync(join(root, 'run-greenfield-G1-off-r1.txt'), 'not json\n\n[stderr]\nexec\n', 'utf8');
    const collected = collectAnswers({ runId: 'run', resultRoot: root });
    assert.equal(collected.length, 1);
    assert.equal(collected[0].answer, null);
    assert.match(collected[0].parseError, /JSON/i);
    const packet = renderPacket({ runId: 'run', entries: collected.map((entry) => ({ ...entry, id: 'C01' })) });
    assert.match(packet, /produced no readable answer/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
