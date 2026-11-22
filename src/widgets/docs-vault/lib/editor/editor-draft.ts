export interface EditorDraft {
  slug: string;
  content: string;
  diskContent: string;
  diskMtime?: number;
  updatedAt: number;
}

const DRAFT_STORAGE_PREFIX = 'ontology-atlas:docs-vault-editor-draft:';

/**
 * The draft key carries the vault: same-named files in different folders would share drafts and a
 * save could write one folder's draft over another's file. Slug-only keys are never read back.
 */
export function draftStorageKey(vaultScope: string, slug: string) {
  return `${DRAFT_STORAGE_PREFIX}${vaultScope}:${slug}`;
}

/** A stored draft is trusted only when it names this slug and every field has its type. */
export function parseEditorDraft(raw: string, slug: string): EditorDraft | null {
  try {
    const parsed = JSON.parse(raw) as Partial<EditorDraft>;
    if (
      parsed.slug !== slug ||
      typeof parsed.content !== 'string' ||
      typeof parsed.diskContent !== 'string' ||
      (parsed.diskMtime !== undefined &&
        typeof parsed.diskMtime !== 'number') ||
      typeof parsed.updatedAt !== 'number'
    ) {
      return null;
    }
    return parsed as EditorDraft;
  } catch {
    return null;
  }
}

export function readEditorDraft(vaultScope: string, slug: string): EditorDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(draftStorageKey(vaultScope, slug));
    if (!raw) return null;
    return parseEditorDraft(raw, slug);
  } catch {
    return null;
  }
}

export function writeEditorDraft(vaultScope: string, draft: EditorDraft) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(draftStorageKey(vaultScope, draft.slug), JSON.stringify(draft));
  } catch {
    // localStorage may be unavailable in privacy modes. Disk save still works.
  }
}

export function clearEditorDraft(vaultScope: string, slug: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(draftStorageKey(vaultScope, slug));
  } catch {
    // no-op
  }
}

export interface LoadedEditorContent {
  content: string;
  /** The version the next save is checked against. */
  loadedMtime: number | undefined;
  /** The file changed on disk after the draft was written. */
  diskChangedSinceDraft: boolean;
  /** The file changed, and the draft carries no mtime to compare a save against. */
  legacyDraftConflict: boolean;
  draftSavedAt: number | null;
}

/**
 * What the editor opens with: the draft when it differs from the disk text, else the disk text.
 * A draft written against an older disk version keeps that version's mtime as the save baseline.
 */
export function resolveLoadedContent(
  draft: EditorDraft | null,
  diskText: string,
  docMtime: number | undefined,
): LoadedEditorContent {
  const shouldRestoreDraft = draft !== null && draft.content !== diskText;
  const diskChangedSinceDraft = shouldRestoreDraft && draft.diskContent !== diskText;
  return {
    content: shouldRestoreDraft ? draft.content : diskText,
    loadedMtime:
      diskChangedSinceDraft && typeof draft.diskMtime === 'number' ? draft.diskMtime : docMtime,
    diskChangedSinceDraft,
    legacyDraftConflict: diskChangedSinceDraft && typeof draft.diskMtime !== 'number',
    draftSavedAt: shouldRestoreDraft ? draft.updatedAt : null,
  };
}
