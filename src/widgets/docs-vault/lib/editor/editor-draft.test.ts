import { afterEach, describe, expect, it } from 'vitest';
import {
  clearEditorDraft,
  draftStorageKey,
  parseEditorDraft,
  readEditorDraft,
  resolveLoadedContent,
  writeEditorDraft,
  type EditorDraft,
} from './editor-draft';

const draft: EditorDraft = {
  slug: 'wiki/page',
  content: 'my edit',
  diskContent: 'disk v1',
  diskMtime: 100,
  updatedAt: 5,
};

afterEach(() => window.localStorage.clear());

describe('draft storage', () => {
  it('keys a draft by vault and slug so two folders never share one', () => {
    expect(draftStorageKey('vault-a', 'page')).not.toBe(draftStorageKey('vault-b', 'page'));
  });

  it('reads back what it wrote, and nothing after clear', () => {
    writeEditorDraft('vault-a', draft);
    expect(readEditorDraft('vault-a', draft.slug)).toEqual(draft);
    expect(readEditorDraft('vault-b', draft.slug)).toBeNull();
    clearEditorDraft('vault-a', draft.slug);
    expect(readEditorDraft('vault-a', draft.slug)).toBeNull();
  });

  it('never reads a slug-only key written before drafts carried the vault', () => {
    window.localStorage.setItem('ontology-atlas:docs-vault-editor-draft:wiki/page', JSON.stringify(draft));
    expect(readEditorDraft('vault-a', draft.slug)).toBeNull();
  });
});

describe('parseEditorDraft', () => {
  it('accepts a draft without an mtime', () => {
    const { diskMtime: _omitted, ...legacy } = draft;
    expect(parseEditorDraft(JSON.stringify(legacy), draft.slug)).toEqual(legacy);
  });

  it('refuses a draft for another slug, a wrong field type, or broken JSON', () => {
    expect(parseEditorDraft(JSON.stringify(draft), 'other')).toBeNull();
    expect(parseEditorDraft(JSON.stringify({ ...draft, content: 3 }), draft.slug)).toBeNull();
    expect(parseEditorDraft(JSON.stringify({ ...draft, diskMtime: '100' }), draft.slug)).toBeNull();
    expect(parseEditorDraft(JSON.stringify({ ...draft, updatedAt: undefined }), draft.slug)).toBeNull();
    expect(parseEditorDraft('{not json', draft.slug)).toBeNull();
  });
});

describe('resolveLoadedContent', () => {
  it('opens the disk text when there is no draft or the draft equals it', () => {
    expect(resolveLoadedContent(null, 'disk v1', 200)).toEqual({
      content: 'disk v1',
      loadedMtime: 200,
      diskChangedSinceDraft: false,
      legacyDraftConflict: false,
      draftSavedAt: null,
    });
    expect(resolveLoadedContent({ ...draft, content: 'disk v1' }, 'disk v1', 200).draftSavedAt).toBeNull();
  });

  it('restores a draft written against the disk text it still sees', () => {
    expect(resolveLoadedContent(draft, 'disk v1', 200)).toEqual({
      content: 'my edit',
      loadedMtime: 200,
      diskChangedSinceDraft: false,
      legacyDraftConflict: false,
      draftSavedAt: 5,
    });
  });

  it('keeps the draft but saves against the mtime it was written on when the disk moved on', () => {
    expect(resolveLoadedContent(draft, 'disk v2', 200)).toMatchObject({
      content: 'my edit',
      loadedMtime: 100,
      diskChangedSinceDraft: true,
      legacyDraftConflict: false,
    });
  });

  it('flags a draft that cannot say which disk version it was written on', () => {
    const { diskMtime: _omitted, ...legacy } = draft;
    expect(resolveLoadedContent(legacy, 'disk v2', 200)).toMatchObject({
      loadedMtime: 200,
      diskChangedSinceDraft: true,
      legacyDraftConflict: true,
    });
  });
});
