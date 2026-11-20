import { describe, expect, it } from 'vitest';
import type { DocumentRef } from './document-detail';
import { createDocumentStore, DETAIL_READ_BATCH } from './document-store';

function countingReader() {
  const calls: string[][] = [];
  return {
    calls,
    filesRead: () => calls.reduce((sum, call) => sum + call.length, 0),
    readTexts: async (docs: readonly DocumentRef[]) => {
      calls.push(docs.map((doc) => doc.path));
      return docs.map((doc) => `# ${doc.slug}\n\nBody of ${doc.slug} at ${doc.mtime}.`);
    },
  };
}

const ref = (slug: string, mtime = 1): DocumentRef => ({ slug, path: `${slug}.md`, mtime });

describe('createDocumentStore', () => {
  it('reads nothing for a second detail at the same stamp, and one file at a changed stamp', async () => {
    const reader = countingReader();
    const store = createDocumentStore(reader);
    const first = await store.detail(ref('a'));
    expect(first?.headings[0]?.text).toBe('a');
    await store.detail(ref('a'));
    expect(reader.filesRead()).toBe(1);
    const edited = await store.detail(ref('a', 2));
    expect(reader.filesRead()).toBe(2);
    expect(edited?.excerpt).toContain('at 2');
  });

  it('answers 200 documents in at most 4 read calls of at most 64 files', async () => {
    const reader = countingReader();
    const store = createDocumentStore(reader);
    const docs = Array.from({ length: 200 }, (_, index) => ref(`doc-${index}`));
    const answers = await store.details(docs);
    expect(reader.calls.length).toBeLessThanOrEqual(4);
    expect(Math.max(...reader.calls.map((call) => call.length))).toBeLessThanOrEqual(DETAIL_READ_BATCH);
    expect(answers.map((detail) => detail?.headings[0]?.text)).toEqual(docs.map((doc) => doc.slug));
  });

  it('joins a read already in flight instead of reading the file again', async () => {
    const reader = countingReader();
    const store = createDocumentStore(reader);
    await Promise.all([store.detail(ref('a')), store.details([ref('a'), ref('a'), ref('b')])]);
    expect(reader.filesRead()).toBe(2);
  });

  it('keeps only the most recent details up to its capacity', async () => {
    const reader = countingReader();
    const store = createDocumentStore(reader, 2);
    await store.details([ref('a'), ref('b'), ref('c')]);
    expect(store.peek(ref('a'))).toBeUndefined();
    expect(store.peek(ref('c'))).toBeDefined();
  });

  it('answers null for a file the source cannot read, and caches nothing for it', async () => {
    const calls: number[] = [];
    const store = createDocumentStore({
      readTexts: async (docs) => {
        calls.push(docs.length);
        return docs.map(() => null);
      },
    });
    expect(await store.detail(ref('gone'))).toBeNull();
    expect(store.peek(ref('gone'))).toBeUndefined();
  });

  it('forgets every detail when cleared, and a read finishing after the clear is not kept', async () => {
    let release: () => void = () => {};
    const store = createDocumentStore({
      readTexts: (docs) => new Promise((resolve) => {
        release = () => resolve(docs.map(() => '# late'));
      }),
    });
    const pending = store.detail(ref('a'));
    store.clear();
    release();
    await pending;
    expect(store.peek(ref('a'))).toBeUndefined();
  });

  it('derives from text a surface is already reading, and reads no file for it', async () => {
    const reader = countingReader();
    const store = createDocumentStore(reader);
    store.adoptText(ref('open'), Promise.resolve('# Open\n\nHeld text.'));
    const detail = await store.detail(ref('open'));
    expect(reader.filesRead()).toBe(0);
    expect(detail?.headings.map((heading) => heading.text)).toEqual(['Open']);
  });

  it('serves a source that already holds details without deriving', async () => {
    const store = createDocumentStore({
      readDetails: async (docs) => docs.map((doc) => ({ headings: [], excerpt: doc.slug, wordCount: 3 })),
    });
    expect(await store.detail(ref('held'))).toEqual({ headings: [], excerpt: 'held', wordCount: 3 });
  });
});
