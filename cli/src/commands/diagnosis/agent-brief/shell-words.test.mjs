import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { graphDbShellQuote, splitShellWords } from './shell-words.mjs';

describe('shell words', () => {
  it('leaves a plain word unquoted and quotes anything else', () => {
    assert.equal(graphDbShellQuote('capabilities/list-vaults'), 'capabilities/list-vaults');
    assert.equal(graphDbShellQuote('my vault'), "'my vault'");
  });

  it('splits back exactly what graphDbShellQuote wrote, spaces and double quotes included', () => {
    for (const word of ['plain', 'two words', 'a"b', '$HOME']) {
      assert.deepEqual(splitShellWords(`cmd ${graphDbShellQuote(word)}`), ['cmd', word]);
    }
  });

  it('returns no tokens for an unclosed quote so the caller refuses the command', () => {
    assert.deepEqual(splitShellWords("hubs 'unclosed"), []);
  });
});
