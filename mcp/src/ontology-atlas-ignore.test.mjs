import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { parseOntologyAtlasIgnore, refMatchesOntologyAtlasIgnore } from './ontology-atlas-ignore.mjs';

describe('parseOntologyAtlasIgnore', () => {
  it('skips blank lines, comments and negations (!)', () => {
    const patterns = parseOntologyAtlasIgnore(`
# this is a comment
src/views/**

!keep-this

cli/src/commands/*.mjs
    `);
    assert.deepEqual(patterns, ['src/views/**', 'cli/src/commands/*.mjs']);
  });

  it('strips a trailing /', () => {
    assert.deepEqual(parseOntologyAtlasIgnore('public/'), ['public']);
  });

  it('empty input yields an empty array', () => {
    assert.deepEqual(parseOntologyAtlasIgnore(''), []);
    assert.deepEqual(parseOntologyAtlasIgnore('\n\n# comment\n'), []);
  });
});

describe('refMatchesOntologyAtlasIgnore', () => {
  it('* matches any character except /', () => {
    assert.equal(refMatchesOntologyAtlasIgnore('src/foo.ts', ['src/*.ts']), true);
    assert.equal(refMatchesOntologyAtlasIgnore('src/views/foo.ts', ['src/*.ts']), false);
  });

  it('** crosses directories', () => {
    assert.equal(refMatchesOntologyAtlasIgnore('src/views/foo.ts', ['src/**']), true);
    assert.equal(refMatchesOntologyAtlasIgnore('src/views/deep/foo.ts', ['src/**']), true);
    assert.equal(refMatchesOntologyAtlasIgnore('cli/views/foo.ts', ['src/**']), false);
  });

  it('** in the middle — src/**/foo.ts', () => {
    assert.equal(refMatchesOntologyAtlasIgnore('src/views/foo.ts', ['src/**/foo.ts']), true);
    assert.equal(refMatchesOntologyAtlasIgnore('src/views/deep/foo.ts', ['src/**/foo.ts']), true);
    assert.equal(refMatchesOntologyAtlasIgnore('src/foo.ts', ['src/**/foo.ts']), true);
    assert.equal(refMatchesOntologyAtlasIgnore('src/views/bar.ts', ['src/**/foo.ts']), false);
  });

  it('? matches a single character', () => {
    assert.equal(refMatchesOntologyAtlasIgnore('src/a.ts', ['src/?.ts']), true);
    assert.equal(refMatchesOntologyAtlasIgnore('src/ab.ts', ['src/?.ts']), false);
  });

  it('exact match', () => {
    assert.equal(refMatchesOntologyAtlasIgnore('mcp/src/index.js', ['mcp/src/index.js']), true);
    assert.equal(refMatchesOntologyAtlasIgnore('mcp/src/index.mjs', ['mcp/src/index.js']), false);
  });

  it('true when any of several patterns matches', () => {
    const patterns = ['src/**', 'mcp/src/*.mjs'];
    assert.equal(refMatchesOntologyAtlasIgnore('src/views/foo.ts', patterns), true);
    assert.equal(refMatchesOntologyAtlasIgnore('mcp/src/parser.mjs', patterns), true);
    assert.equal(refMatchesOntologyAtlasIgnore('cli/src/index.mjs', patterns), false);
  });

  it('empty patterns match nothing', () => {
    assert.equal(refMatchesOntologyAtlasIgnore('anything', []), false);
    assert.equal(refMatchesOntologyAtlasIgnore('anything', null), false);
    assert.equal(refMatchesOntologyAtlasIgnore('anything', undefined), false);
  });

  it('escapes regex metacharacters safely', () => {
    // path.with.dots — `.` is any-char in a regex, but our patterns must treat it as a literal
    assert.equal(refMatchesOntologyAtlasIgnore('path.with.dots', ['path.with.dots']), true);
    assert.equal(refMatchesOntologyAtlasIgnore('pathXwithXdots', ['path.with.dots']), false);
  });
});
