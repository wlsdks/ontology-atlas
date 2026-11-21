import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shellQuote, splitShellWords } from './agent-brief/shell-words.mjs';

describe('shell words', () => {
  it('leaves a plain word unquoted and quotes anything else', () => {
    assert.equal(shellQuote('capabilities/list-vaults'), 'capabilities/list-vaults');
    assert.equal(shellQuote('my vault'), "'my vault'");
  });

  it('splits back exactly what shellQuote wrote, spaces and double quotes included', () => {
    for (const word of ['plain', 'two words', 'a"b', '$HOME']) {
      assert.deepEqual(splitShellWords(`cmd ${shellQuote(word)}`), ['cmd', word]);
    }
  });

  it('returns no tokens for an unclosed quote so the caller refuses the command', () => {
    assert.deepEqual(splitShellWords("hubs 'unclosed"), []);
  });
});
