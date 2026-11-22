import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { DOGFOOD_RESPONSE_LABELS } from './rpc-client.mjs';
import {
  STRICT_REJECTION_SECTIONS,
  printStrictRejectionSections,
  strictRejectionLines,
} from './strict-rejection-report.mjs';

const ALL_ROWS = STRICT_REJECTION_SECTIONS.flatMap((section) => section.rows);

describe('strict rejection report table', () => {
  it('names every probe by the response label its request id carries', () => {
    for (const row of ALL_ROWS) {
      const snakeCaseKey = row.key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      assert.equal(DOGFOOD_RESPONSE_LABELS.get(row.id), snakeCaseKey, `${row.key} is wired to id ${row.id}`);
    }
  });

  it('reads each response id and each key once', () => {
    assert.equal(new Set(ALL_ROWS.map((row) => row.id)).size, ALL_ROWS.length);
    assert.equal(new Set(ALL_ROWS.map((row) => row.key)).size, ALL_ROWS.length);
  });
});

describe('strictRejectionLines', () => {
  const rejection = {
    result: {
      isError: true,
      content: [{ text: 'Unknown argument "limt". Did you mean "limit"?' }],
    },
  };

  it('prints the rejected flag and the server message', () => {
    assert.deepEqual(strictRejectionLines({ label: 'kind rejected' }, rejection), [
      '  kind rejected: true',
      '  Unknown argument "limt". Did you mean "limit"?',
    ]);
  });

  it('prints false, and no message line, when the call was accepted or missing', () => {
    const accepted = { result: { isError: false, content: [{ text: '' }] } };
    assert.deepEqual(strictRejectionLines({ label: 'kind rejected' }, accepted), ['  kind rejected: false']);
    assert.deepEqual(strictRejectionLines({ label: 'kind rejected' }, undefined), ['  kind rejected: false']);
  });

  it('puts the repair summary and write-metadata verdict between the flag and the message', () => {
    const lines = strictRejectionLines(
      { label: 'rejected', extras: ['repair', 'write metadata'] },
      rejection,
    );
    assert.equal(lines.length, 4);
    assert.equal(lines[0], '  rejected: true');
    assert.match(lines[1], /^ {2}repair: rejected true/);
    assert.equal(lines[2], '  write metadata: absent');
    assert.match(lines[3], /^ {2}Unknown argument/);
  });
});

describe('printStrictRejectionSections', () => {
  it('prints each header before its rows and returns the responses by key', () => {
    const printed = [];
    const log = mock.method(console, 'log', (line) => printed.push(line));
    try {
      const responses = [{ id: 46, result: { isError: true, content: [{ text: 'boom' }] } }];
      const found = printStrictRejectionSections(responses, (title) => printed.push(`# ${title}`));

      assert.equal(found.strictArgs, responses[0]);
      assert.equal(found.strictEnum, undefined);
      assert.deepEqual(printed.slice(0, 4), [
        '# strict arguments — unknown tool argument rejection',
        '  rejected: true',
        '  repair: rejected true',
        '  boom',
      ]);
      assert.equal(printed.filter((line) => line.startsWith('# ')).length, STRICT_REJECTION_SECTIONS.length);
    } finally {
      log.mock.restore();
    }
  });
});
