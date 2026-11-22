import { describe, expect, it } from 'vitest';
import { insertLinkEdit, prefixLineEdit, stripFrontmatterBlock, wrapSelectionEdit } from './editor-text-edit';

describe('wrapSelectionEdit', () => {
  it('wraps the selection and selects the wrapped words', () => {
    expect(wrapSelectionEdit('say hello now', 4, 9, '**', 'text')).toEqual({
      content: 'say **hello** now',
      selectionStart: 6,
      selectionEnd: 11,
    });
  });

  it('wraps the placeholder when nothing is selected', () => {
    expect(wrapSelectionEdit('ab', 1, 1, '*', 'text')).toEqual({
      content: 'a*text*b',
      selectionStart: 2,
      selectionEnd: 6,
    });
  });
});

describe('prefixLineEdit', () => {
  it('prefixes the caret line, not the first line', () => {
    expect(prefixLineEdit('one\ntwo\nthree', 6, '- ')).toEqual({
      content: 'one\n- two\nthree',
      selectionStart: 8,
      selectionEnd: 8,
    });
  });

  it('prefixes the first line when the caret has no newline before it', () => {
    expect(prefixLineEdit('one', 0, '# ').content).toBe('# one');
  });
});

describe('insertLinkEdit', () => {
  it('turns the selection into link text and selects the url placeholder', () => {
    const edit = insertLinkEdit('see docs here', 4, 8, 'link');
    expect(edit.content).toBe('see [docs](url) here');
    expect(edit.content.slice(edit.selectionStart, edit.selectionEnd)).toBe('url');
  });

  it('uses the fallback text for an empty selection', () => {
    expect(insertLinkEdit('', 0, 0, 'link text').content).toBe('[link text](url)');
  });
});

describe('stripFrontmatterBlock', () => {
  it('drops a leading frontmatter block only', () => {
    expect(stripFrontmatterBlock('---\nkind: domain\n---\n# Body\n---\nrule')).toBe('# Body\n---\nrule');
    expect(stripFrontmatterBlock('# Body')).toBe('# Body');
  });
});
