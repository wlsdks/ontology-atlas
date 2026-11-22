import { describe, expect, it } from 'vitest';
import { rewriteWikilinks } from '@/shared/lib/library/source-citation';
import { readerTree, type ReaderNode } from './reader-tree';

function wikilink(target: string): ReaderNode {
  const url = /\(([^)]*)\)/.exec(rewriteWikilinks(`[[${target}]]`))![1]!;
  return { type: 'link', url, children: [{ type: 'text', value: target }] };
}

const text = (value: string): ReaderNode => ({ type: 'text', value });
const paragraph = (...children: ReaderNode[]): ReaderNode => ({ type: 'paragraph', children });

function run(root: ReaderNode, namedSource?: string) {
  let counts: ReadonlyMap<string, number> = new Map();
  readerTree(namedSource, (next) => { counts = next; })(root);
  return counts;
}

describe('readerTree', () => {
  it('puts a dot between page links that only whitespace separates', () => {
    const para = paragraph(wikilink('a'), text(' '), wikilink('b'), text(' and '), wikilink('c'));
    run({ type: 'root', children: [para] });
    expect(para.children![1]).toMatchObject({ type: 'text', value: ' · ' });
    expect(para.children![3]).toMatchObject({ value: ' and ' });
  });

  it('leaves whitespace beside a citation alone', () => {
    const para = paragraph(wikilink('a'), text(' '), wikilink('src:docs/x.md'));
    run({ type: 'root', children: [para] });
    expect(para.children![1]).toEqual(text(' '));
  });

  it('counts each drawn citation once per NFC path and forgets the previous run', () => {
    const root: ReaderNode = {
      type: 'root',
      children: [paragraph(text('Fact '), wikilink('src:docs/x.md')), paragraph(text('Again '), wikilink('src:docs/x.md'), wikilink('src:docs/y.md'))],
    };
    let counts: ReadonlyMap<string, number> = new Map();
    const counted = readerTree(undefined, (next) => { counts = next; });
    counted(root);
    counted(root);
    expect([...counts]).toEqual([['docs/x.md', 2], ['docs/y.md', 1]]);
  });

  it('lowers a trailing citation run onto its own line only when one names its file', () => {
    const named = paragraph(text('A fact. '), wikilink('src:docs/x.md'), text(' '), wikilink('src:docs/y.md'));
    run({ type: 'root', children: [named] }, 'docs/x.md');
    const lowered = named.children![named.children!.length - 1]!;
    expect(lowered.type).toBe('readerCitationRun');
    expect(lowered.children).toHaveLength(3);

    const unnamed = paragraph(text('A fact. '), wikilink('src:docs/x.md'));
    run({ type: 'root', children: [unnamed] }, 'docs/x.md');
    expect(unnamed.children!.map((child) => child.type)).toEqual(['text', 'link']);
  });

  it('keeps a paragraph that holds nothing but citations inline', () => {
    const only = paragraph(wikilink('src:docs/x.md'));
    run({ type: 'root', children: [only] });
    expect(only.children![0]!.type).toBe('link');
  });
});
