import { describe, expect, it } from 'vitest';
import { buildMdEntry, createMetadataStringPool, mdEntryRowValue, storedMdEntry } from './md-entry';
import type { WalkEntry } from './walk-vault';

const entry: WalkEntry = { relativePath: 'notes/plan.md', kind: 'md', handle: {} as FileSystemFileHandle };
const RAW = '---\ntitle: Plan\nkind: capability\ndomains: [notes]\n---\n# Plan\n\nThe plan links [[notes/other]] and [up](../README.md).\n\n## Later\n\nMore words here.\n';

function built() {
  return buildMdEntry(entry, RAW, 1_700_000_000_000, createMetadataStringPool());
}

describe('the stored row of a Markdown file', () => {
  it('holds only the spine document and reads back to the entry the build made', () => {
    const fresh = built();
    const value = mdEntryRowValue(fresh);
    expect(value).not.toBeNull();
    const stored = JSON.parse(value!);
    expect(Object.keys(stored)).toEqual(['doc']);
    expect(stored.doc.linksOut).toEqual(['README', 'notes/other']);
    const back = storedMdEntry(entry, stored, createMetadataStringPool());
    expect(back).toEqual({ ...fresh, handle: entry.handle });
  });

  it('rejects a row an older producer wrote with detail and link passages, so the file is read again', () => {
    const { doc } = JSON.parse(mdEntryRowValue(built())!);
    const intern = createMetadataStringPool();
    const oldRow = {
      doc: { ...doc, headings: [{ depth: 1, text: 'Plan', slug: 'plan' }], excerpt: 'The plan links', wordCount: 9 },
      linkContexts: [{ target: 'notes/other', context: 'The plan links **[notes/other]**', linkText: 'notes/other' }],
    };
    expect(storedMdEntry(entry, oldRow, intern)).toBeUndefined();
    expect(storedMdEntry(entry, { doc: oldRow.doc }, intern)).toBeUndefined();
    expect(storedMdEntry(entry, { doc, linkContexts: oldRow.linkContexts }, intern)).toBeUndefined();
    expect(storedMdEntry(entry, { doc }, intern)?.doc).toEqual(doc);
  });

  it('rejects a row whose document belongs to another path or lacks its stamp or link targets', () => {
    const { doc } = JSON.parse(mdEntryRowValue(built())!);
    const intern = createMetadataStringPool();
    for (const broken of [{ ...doc, path: 'elsewhere.md' }, { ...doc, mtime: undefined }, { ...doc, linksOut: undefined }]) {
      expect(storedMdEntry(entry, { doc: broken }, intern)).toBeUndefined();
    }
    expect(storedMdEntry(entry, null, intern)).toBeUndefined();
  });

  it('keeps no row for frontmatter a JSON round trip would change', () => {
    const fresh = buildMdEntry(entry, '---\ntitle: Plan\nweight: Infinity\n---\nbody\n', 1, createMetadataStringPool());
    expect(fresh.doc?.frontmatter.weight).toBe(Number.POSITIVE_INFINITY);
    expect(mdEntryRowValue(fresh)).toBeNull();
  });
});
