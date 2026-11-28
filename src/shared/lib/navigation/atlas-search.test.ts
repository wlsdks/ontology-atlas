import { describe, expect, it } from 'vitest';

import { parseSearch, stringifySearch } from './atlas-search';

const roundTrip = (query: string) => stringifySearch(parseSearch(query));

describe('Atlas query serializer', () => {
  it('writes an unchanged query back as the bytes it arrived as', () => {
    for (const query of [
      '?p=a%20b&workbench=edit',
      '?slug=%EC%98%A8%ED%86%A8%EB%A1%9C%EC%A7%80',
      '?a=1&b=2&a=3',
      '?tab=connectors&install=x%2Fy+z',
      '?flag',
    ]) {
      expect(roundTrip(query)).toBe(query);
    }
  });

  it('keeps a value that looks like a number or a boolean a string', () => {
    expect(parseSearch('?p=1&q=true&r=null')).toEqual({ p: '1', q: 'true', r: 'null' });
  });

  it('keeps repeated keys as a list in arrival order', () => {
    expect(parseSearch('?a=1&b=2&a=3').a).toEqual(['1', '3']);
  });

  it('writes a changed query as form-encoded text, as URLSearchParams would', () => {
    expect(stringifySearch({ p: 'a b', tab: ['x', 'y'], gone: undefined })).toBe('?p=a+b&tab=x&tab=y');
    expect(stringifySearch({})).toBe('');
  });

  it('forgets a spelling once the same query arrives in standard form', () => {
    parseSearch('?p=a%20b');
    expect(stringifySearch({ p: 'a b' })).toBe('?p=a%20b');
    parseSearch('?p=a+b');
    expect(stringifySearch({ p: 'a b' })).toBe('?p=a+b');
  });

  it('does not let a query key reach the prototype', () => {
    const search = parseSearch('?constructor=1&__proto__=2');
    expect(Object.getPrototypeOf(search)).toBeNull();
    expect(search.constructor).toBe('1');
  });
});
