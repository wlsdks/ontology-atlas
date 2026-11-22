import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { flattenText, slugFromChildren } from './heading-text';

describe('flattenText', () => {
  it('joins the text of nested elements, strings and numbers in order', () => {
    const children = ['Use ', createElement('code', null, 'pnpm'), ' v', 10, null];
    expect(flattenText(children)).toBe('Use pnpm v10');
  });
});

describe('slugFromChildren', () => {
  it('lowercases, drops punctuation and joins words with dashes', () => {
    expect(slugFromChildren('Hello, World: Part 2!')).toBe('hello-world-part-2');
  });

  it('keeps Hangul and existing dashes', () => {
    expect(slugFromChildren(['시작하기 ', createElement('em', null, 'quick-start')])).toBe('시작하기-quick-start');
  });
});
