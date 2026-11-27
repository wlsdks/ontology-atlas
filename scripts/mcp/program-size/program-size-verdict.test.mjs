import assert from 'node:assert/strict';
import test from 'node:test';

import { programSizeVerdict, sumSizeOutput } from './program-size-verdict.mjs';

const MIB = 1024 * 1024;

test('a Rust program one byte larger than the Bun program fails; an equal one passes', () => {
  const larger = programSizeVerdict({ rustBytes: 60 * MIB + 1, bunBytes: 60 * MIB, grammarBytes: null });
  const equal = programSizeVerdict({ rustBytes: 60 * MIB, bunBytes: 60 * MIB, grammarBytes: null });
  assert.equal(larger.passes, false);
  assert.equal(equal.passes, true);
});

test('the goals are reported on the figures they name, and unknown when the grammars are not measured', () => {
  const known = programSizeVerdict({ rustBytes: 13 * MIB, bunBytes: 62 * MIB, grammarBytes: 8 * MIB });
  assert.equal(known.withGrammarsGoalMet, true);
  assert.equal(known.withoutGrammarsMib, 5);
  assert.equal(known.withoutGrammarsGoalMet, true);
  const over = programSizeVerdict({ rustBytes: 25 * MIB, bunBytes: 62 * MIB, grammarBytes: 8 * MIB });
  assert.equal(over.passes, true, 'a missed goal never fails the gate');
  assert.equal(over.withGrammarsGoalMet, false);
  assert.equal(over.withoutGrammarsGoalMet, false);
  const unknown = programSizeVerdict({ rustBytes: 13 * MIB, bunBytes: 62 * MIB, grammarBytes: null });
  assert.equal(unknown.withoutGrammarsGoalMet, null);
});

test('size output of an archive sums the total column of every member', () => {
  const output = [
    '__TEXT\t__DATA\t__OBJC\tothers\tdec\thex',
    '2853679\t7608\t0\t0\t2861287\t2ba667\tlibx.a(parser.o)',
    '1000\t10\t0\t0\t1010\t3f2\tlibx.a(scanner.o)',
    '',
  ].join('\n');
  assert.equal(sumSizeOutput(output), 2862297);
});
