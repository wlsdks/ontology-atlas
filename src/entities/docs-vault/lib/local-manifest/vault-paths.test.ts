import { describe, expect, it } from 'vitest';
import { eachAncestor, isConfinedRelativePath, nameOf, withinAny } from './vault-paths';

describe('nameOf', () => {
  it('is the last segment of a path and the whole name of a root file', () => {
    expect(nameOf('notes/deep/a.md')).toBe('a.md');
    expect(nameOf('a.md')).toBe('a.md');
  });
});

describe('eachAncestor', () => {
  it('visits the folders from the nearest to the outermost, never the root or the file', () => {
    const seen: string[] = [];
    eachAncestor('a/b/c/file.md', (dir) => seen.push(dir));
    expect(seen).toEqual(['a/b/c', 'a/b', 'a']);
  });

  it('never visits an empty folder name, even for a path with a leading slash', () => {
    const seen: string[] = [];
    eachAncestor('/a/file.md', (dir) => seen.push(dir));
    expect(seen).toEqual(['/a']);
  });

  it('visits nothing for a root file', () => {
    const seen: string[] = [];
    eachAncestor('file.md', (dir) => seen.push(dir));
    expect(seen).toEqual([]);
  });
});

describe('isConfinedRelativePath', () => {
  it('accepts a relative path made of ordinary segments', () => {
    expect(isConfinedRelativePath('notes/a.md')).toBe(true);
    expect(isConfinedRelativePath('a.md')).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['parent segment', '../outside.md'],
    ['parent segment in the middle', 'notes/../../outside.md'],
    ['current-folder segment', './a.md'],
    ['absolute path', '/etc/passwd'],
    ['empty segment', 'notes//a.md'],
    ['trailing slash', 'notes/'],
    ['backslash', 'notes\\a.md'],
    ['NUL byte', 'notes/a\0.md'],
  ])('refuses a path with %s', (_name, path) => {
    expect(isConfinedRelativePath(path)).toBe(false);
  });
});

describe('withinAny', () => {
  const dirs = new Set(['a', 'a/b', 'x']);

  it('finds the nearest listed ancestor of a path', () => {
    expect(withinAny('a/b/c/file.md', dirs, false)).toBe('a/b');
    expect(withinAny('a/other/file.md', dirs, false)).toBe('a');
  });

  it('counts the path itself only when asked to be inclusive', () => {
    expect(withinAny('a/b', dirs, false)).toBe('a');
    expect(withinAny('a/b', dirs, true)).toBe('a/b');
    expect(withinAny('x', dirs, false)).toBeNull();
    expect(withinAny('x', dirs, true)).toBe('x');
  });

  it('is null when no ancestor is listed', () => {
    expect(withinAny('elsewhere/file.md', dirs, true)).toBeNull();
  });
});
