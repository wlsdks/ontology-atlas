import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { firstSearchText } from './search-text';

const SOURCE = path.join(process.cwd(), 'src/shared/lib/navigation/search-text.ts');

/** Runs `search-text.ts` itself in a fresh realm whose `Object.prototype` is frozen, as the installed app's window is. */
function validateInFrozenRealm(search: string): { prototype: unknown; entries: [string, unknown][] } {
  const { outputText } = ts.transpileModule(readFileSync(SOURCE, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  return JSON.parse(
    vm.runInNewContext(`
      Object.freeze(Object.prototype);
      const exports = {};
      (function (exports) { ${outputText} })(exports);
      const result = exports.screenSearch()(${search});
      JSON.stringify({ prototype: Object.getPrototypeOf(result), entries: Object.entries(result) });
    `),
  );
}

describe('screenSearch', () => {
  it('keeps a key named like an Object.prototype member as a plain key when the prototype is frozen', () => {
    const { prototype, entries } = validateInFrozenRealm(`{ constructor: '1', toString: '2', tab: 'mcp' }`);
    expect(prototype).toBeNull();
    expect(entries).toEqual([
      ['constructor', '1'],
      ['toString', '2'],
      ['tab', 'mcp'],
    ]);
  });

  it('keeps text and lists of text, whatever the screen reads, and drops anything else', () => {
    const { entries } = validateInFrozenRealm(`{ tab: 'a', tag: ['x', 'y'], other: 'z', count: 3, mixed: ['x', 1] }`);
    expect(entries).toEqual([
      ['tab', 'a'],
      ['tag', ['x', 'y']],
      ['other', 'z'],
    ]);
  });
});

describe('firstSearchText', () => {
  it('takes the first of a key written twice', () => {
    expect(firstSearchText(['a', 'b'])).toBe('a');
    expect(firstSearchText('c')).toBe('c');
    expect(firstSearchText(undefined)).toBeUndefined();
  });
});
