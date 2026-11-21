'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { useFailureSentence } from '@/shared/lib/failures/use-failure-sentence';
import type { FailureCopy } from '@/shared/lib/failures/use-failure-sentence';
import type { VaultDoc } from '@/entities/docs-vault';
import { isImeComposing } from '@/shared/lib/keyboard/ime-composition';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-text/locale-display-name';
import { useDelayedVisible, useHeldValue } from '@/shared/lib/render-timing/use-presence';
import { caretPoint, clampMenuToBox } from '../lib/caret-position';
import {
  clearEditorDraft,
  readEditorDraft,
  resolveLoadedContent,
  writeEditorDraft,
  type EditorDraft,
} from '../lib/editor/editor-draft';
import {
  insertLinkEdit,
  prefixLineEdit,
  stripFrontmatterBlock,
  wrapSelectionEdit,
  type TextEdit,
} from '../lib/editor/editor-text-edit';
import { cycleIndex, matchMentionCandidates } from '../lib/editor/mention-candidates';
import { saveFailureMessageKey } from '../lib/editor/save-failure';
import {
  detectMentionTrigger,
  insertMentionRelation,
  MENTION_RELATIONS,
  type MentionRelationId,
} from '../lib/mention-relation';
import { Button, Chip, Dialog } from '@/shared/ui';
import { EditorPreview } from './editor/EditorPreview';
import { EditorStatusBar } from './editor/EditorStatusBar';
import { EditorToolbar } from './editor/EditorToolbar';
import { MENTION_MENU_MAX_HEIGHT, MENTION_MENU_WIDTH } from './editor/mention-menu-box';
import { MentionRelationMenu } from './editor/MentionRelationMenu';
import { MentionTargetMenu } from './editor/MentionTargetMenu';


interface Props {
  doc: VaultDoc;
  getDocContent: (slug: string) => Promise<string>;
  /** Called on save. expectedMtime is the value at the time this editor read the source. Throws on failure. */
  onSave: (
    slug: string,
    content: string,
    expectedMtime?: number,
  ) => Promise<void>;
  onClose: () => void;
  allDocs?: VaultDoc[];
  /**
   * The vault this draft belongs to; with the slug alone, different folders share a key and
   * overwrite each other's drafts.
   */
  vaultScope: string;
}

function focusRange(ta: HTMLTextAreaElement, start: number, end: number) {
  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(start, end);
  });
}

function focusEdit(ta: HTMLTextAreaElement, edit: TextEdit) {
  focusRange(ta, edit.selectionStart, edit.selectionEnd);
}

export function DocsVaultEditor({
  doc,
  getDocContent,
  onSave,
  onClose,
  allDocs,
  vaultScope,
}: Props) {
  const t = useTranslations('vaultWidgets.editor');
  const failureSentence = useFailureSentence();
  const locale = useLocale();
  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  /*
   * A failure has two halves: `sentence` is rendered; `detail` is the machine half and only
   * reaches `data-failure-detail`.
   */
  const [error, setError] = useState<FailureCopy | null>(null);
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [legacyDraftConflict, setLegacyDraftConflict] = useState(false);
  const [preview, setPreview] = useState(false);
  const [debounced, setDebounced] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // The write baseline for unsaved edits stays the version first read, or the conflict guard
  // compares two current values and silently overwrites an external change.
  const loadedMtimeRef = useRef<number | undefined>(doc.mtime);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraftRef = useRef<{ vaultScope: string; draft: EditorDraft } | null>(null);

  const [autocomplete, setAutocomplete] = useState<{
    query: string;
    start: number;
    active: number;
  } | null>(null);

  /*
   * The trigger is `@`, which writes a relation to frontmatter (`lib/mention-relation`); `[[` is
   * not kept alongside so there is one syntax for a real connection.
   */

  const acMatches = useMemo<VaultDoc[]>(() => {
    if (!autocomplete || !allDocs) return [];
    return matchMentionCandidates(allDocs, autocomplete.query, doc.slug);
  }, [autocomplete, allDocs, doc.slug]);

  /** `useHeldValue` takes a key because the model is a fresh object each render; without it React #301 loops. */
  /**
   * Opens once a query is typed, even with zero results, so a miss is visible; with only `@` it
   * shows the first 8.
   */
  const acHasQuery = (autocomplete?.query ?? '') !== '';
  const acEmpty = autocomplete !== null && acHasQuery && acMatches.length === 0;
  const acOpen = autocomplete !== null && (acMatches.length > 0 || acEmpty);
  const heldAutocomplete = useHeldValue(
    acOpen && autocomplete
      ? { query: autocomplete.query, active: autocomplete.active, matches: acMatches }
      : null,
    acOpen && autocomplete
      ? JSON.stringify([autocomplete.query, autocomplete.active])
      : null,
  );

  const dirty = content !== null && content !== savedContent;
  // Latest dirty in a ref so the load effect can skip a poll-driven re-fetch without listing dirty
  // as a dependency (which would re-fetch on every save).
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Preview debounce of 200ms to cushion react-markdown re-renders; a no-op while the preview is
  // off.
  useEffect(() => {
    if (!preview || content === null) return;
    const handle = window.setTimeout(() => setDebounced(content), 200);
    return () => window.clearTimeout(handle);
  }, [preview, content]);

  const previewBody = useMemo(
    () => stripFrontmatterBlock(debounced ?? content ?? ''),
    [debounced, content],
  );

  const wrapSelection = useCallback((wrapper: string, placeholder?: string) => {
    const ta = taRef.current;
    if (!ta || content === null) return;
    const ph = placeholder ?? t('placeholder');
    const edit = wrapSelectionEdit(content, ta.selectionStart, ta.selectionEnd, wrapper, ph);
    setContent(edit.content);
    focusEdit(ta, edit);
  }, [content, t]);
  const prefixLine = useCallback((prefix: string) => {
    const ta = taRef.current;
    if (!ta || content === null) return;
    const edit = prefixLineEdit(content, ta.selectionStart, prefix);
    setContent(edit.content);
    focusEdit(ta, edit);
  }, [content]);
  /**
   * The chosen concept before its relation is decided; stopping at the name would add nothing to
   * the graph.
   */
  const [pendingMention, setPendingMention] = useState<{
    doc: VaultDoc;
    trigger: { query: string; start: number };
  } | null>(null);
  const [pendingRelation, setPendingRelation] = useState<MentionRelationId>(
    MENTION_RELATIONS[0].id,
  );

  const [mentionNotice, setMentionNotice] = useState<'added' | 'exists' | null>(null);
  useEffect(() => {
    if (!mentionNotice) return;
    const timer = setTimeout(() => setMentionNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [mentionNotice]);

  const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(null);
  const placeMenuAtCaret = useCallback((caretIndex: number) => {
    const ta = taRef.current;
    const host = ta?.parentElement;
    if (!ta || !host) return;
    const caret = caretPoint(ta, caretIndex);
    setMenuAt(
      clampMenuToBox({
        caret,
        box: { width: ta.clientWidth, height: ta.clientHeight },
        // Placement uses an upper bound on the menu size; a smaller real size leaves slack, never
        // clipping.
        menu: { width: MENTION_MENU_WIDTH, height: MENTION_MENU_MAX_HEIGHT },
      }),
    );
  }, []);

  const pickMentionTarget = useCallback(
    (doc: VaultDoc) => {
      if (!autocomplete) return;
      setPendingMention({
        doc,
        trigger: { query: autocomplete.query, start: autocomplete.start },
      });
      setPendingRelation(MENTION_RELATIONS[0].id);
      setAutocomplete(null);
    },
    [autocomplete],
  );

  const applyMentionRelation = useCallback(
    (relationId: MentionRelationId) => {
      const ta = taRef.current;
      if (!ta || content === null || !pendingMention) return;
      /*
       * Do not destructure this as `doc`: it shadows the edited document and the link comes out
       * as `./same-folder.md`.
       */
      const { doc: targetDoc, trigger } = pendingMention;
      const result = insertMentionRelation({
        content,
        editingSlug: doc.slug,
        trigger,
        target: {
          slug: targetDoc.slug,
          title: resolveLocaleDisplayName(targetDoc.frontmatter, locale, targetDoc.title),
        },
        relationId,
      });
      setContent(result.content);
      setMentionNotice(result.relationAdded ? 'added' : 'exists');
      setPendingMention(null);
      focusRange(ta, result.caret, result.caret);
    },
    [content, doc.slug, locale, pendingMention],
  );


  const insertLink = useCallback(() => {
    const ta = taRef.current;
    if (!ta || content === null) return;
    const edit = insertLinkEdit(content, ta.selectionStart, ta.selectionEnd, t('linkText'));
    setContent(edit.content);
    focusEdit(ta, edit);
  }, [content, t]);

  const doSave = useCallback(async () => {
    if (saving || content === null || !dirty) return;
    if (legacyDraftConflict) {
      setError({ sentence: t('saveConflict'), detail: null });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(doc.slug, content, loadedMtimeRef.current);
      setSavedContent(content);
      clearEditorDraft(vaultScope, doc.slug);
      setDraftSavedAt(null);
      setSavedFlash(true);
      setLegacyDraftConflict(false);
      if (savedFlashTimerRef.current) {
        clearTimeout(savedFlashTimerRef.current);
      }
      savedFlashTimerRef.current = setTimeout(() => {
        setSavedFlash(false);
      }, 1500);
    } catch (caughtError) {
      // A rejected save (e.g. VaultConflictError) must not mark the buffer clean, so the poll guard
      // keeps the edits; show a localized message for conflicts.
      const messageKey = saveFailureMessageKey(caughtError);
      setError(
        messageKey
          ? { sentence: t(messageKey), detail: null }
          : failureSentence(caughtError, t('saveFailed')),
      );
    } finally {
      setSaving(false);
    }
  }, [content, dirty, doc.slug, failureSentence, legacyDraftConflict, onSave, saving, t, vaultScope]);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }, [dirty, onClose, saving]);

  const discardChanges = useCallback(() => {
    pendingDraftRef.current = null;
    clearEditorDraft(vaultScope, doc.slug);
    setDraftSavedAt(null);
    setDiscardOpen(false);
    onClose();
  }, [doc.slug, onClose, vaultScope]);

  useEffect(() => {
    // Data-loss guard: a poll gives `getDocContent` a new identity; with unsaved edits do not
    // re-fetch. A clean editor still re-fetches, and new documents mount fresh with dirtyRef false.
    if (dirtyRef.current) return;
    let cancelled = false;
    getDocContent(doc.slug)
      .then((text) => {
        // Re-check dirty: an in-flight clean re-fetch must not land over edits started meanwhile.
        if (cancelled || dirtyRef.current) return;
        const opened = resolveLoadedContent(readEditorDraft(vaultScope, doc.slug), text, doc.mtime);
        setContent(opened.content);
        setSavedContent(text);
        setLoadedSlug(doc.slug);
        loadedMtimeRef.current = opened.loadedMtime;
        setDebounced(opened.content);
        setLegacyDraftConflict(opened.legacyDraftConflict);
        setError(opened.diskChangedSinceDraft ? { sentence: t('saveConflict'), detail: null } : null);
        setSavedFlash(false);
        setDraftSavedAt(opened.draftSavedAt);
        setAutocomplete(null);
      })
      .catch((caughtError) => {
        if (cancelled) return;
        setContent(null);
        setSavedContent(null);
        setLoadedSlug(doc.slug);
        setDraftSavedAt(null);
        setLegacyDraftConflict(false);
        setError(failureSentence(caughtError, t('loadFailed')));
      });
    return () => {
      cancelled = true;
    };
  }, [doc.mtime, doc.slug, failureSentence, getDocContent, t, vaultScope]);

  // After a clean save the baseline advances with the refreshed mtime; external changes while dirty
  // are never absorbed.
  useEffect(() => {
    if (!dirty && loadedSlug === doc.slug) {
      loadedMtimeRef.current = doc.mtime;
    }
  }, [dirty, doc.mtime, doc.slug, loadedSlug]);

  useEffect(
    () => () => {
      if (savedFlashTimerRef.current) {
        clearTimeout(savedFlashTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  // Leaving for another Library tab keeps the last keystroke before the draft debounce elapses;
  // disk writes still need Save.
  useEffect(() => () => {
    const pending = pendingDraftRef.current;
    if (pending) writeEditorDraft(pending.vaultScope, pending.draft);
    pendingDraftRef.current = null;
  }, []);

  useEffect(() => {
    if (content === null || savedContent === null || loadedSlug !== doc.slug) return;
    if (!dirty) {
      pendingDraftRef.current = null;
      clearEditorDraft(vaultScope, doc.slug);
      if (draftSavedAt !== null) {
        window.queueMicrotask(() => setDraftSavedAt(null));
      }
      return;
    }
    const draft: EditorDraft = {
        slug: doc.slug,
        content,
        diskContent: savedContent,
        diskMtime: loadedMtimeRef.current,
        updatedAt: Date.now(),
    };
    pendingDraftRef.current = { vaultScope, draft };
    const handle = window.setTimeout(() => {
      writeEditorDraft(vaultScope, draft);
      pendingDraftRef.current = null;
      setDraftSavedAt(draft.updatedAt);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [content, dirty, doc.slug, draftSavedAt, loadedSlug, savedContent, vaultScope]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (discardOpen) return;
      if (!(e.metaKey || e.ctrlKey)) {
        if (e.key === 'Escape') requestClose();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        void doSave();
      } else if (k === 'b') {
        e.preventDefault();
        wrapSelection('**');
      } else if (k === 'i') {
        e.preventDefault();
        wrapSelection('*');
      } else if (k === 'k' && !e.shiftKey) {
        e.preventDefault();
        insertLink();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [discardOpen, doSave, insertLink, requestClose, wrapSelection]);

  const loading = loadedSlug !== doc.slug;
  /* Deferred like the viewer's skeleton so switching documents does not flash it for a frame. */
  const showSkeleton = useDelayedVisible(loading || content === null);
  if (!loading && error && content === null) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center"
        data-failure-detail={error.detail ?? undefined}
      >
        {/* The sentence is the reader's; the English cause stays on `data-failure-detail`. */}
        <div className="text-body text-[color:var(--color-text-tertiary)]">
          {error.sentence}
        </div>
        <Chip
          onClick={requestClose}
          className="mt-2 hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]"
        >
          {t('close')}
        </Chip>
      </div>
    );
  }
  if (loading || content === null) {
    if (!showSkeleton) return <div className="p-8" aria-hidden />;
    return (
      <div className="flex flex-col gap-3 p-8" role="status" aria-label={t('loadingLabel')}>
        <div className="h-3 w-2/3 animate-pulse rounded-micro bg-[color:var(--color-border-soft)]" aria-hidden />
        <div className="h-3 w-5/6 animate-pulse rounded-micro bg-[color:var(--color-overlay-2)]" aria-hidden />
        <div className="h-3 w-1/2 animate-pulse rounded-micro bg-[color:var(--color-overlay-2)]" aria-hidden />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <Dialog open={discardOpen} onClose={() => setDiscardOpen(false)} labelledBy="docs-discard-title" size="sm">
        <h2 id="docs-discard-title" className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
          {t('discardConfirm')}
        </h2>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDiscardOpen(false)}>{t('discardKeep')}</Button>
          <Button variant="primary" onClick={discardChanges}>{t('discardAction')}</Button>
        </div>
      </Dialog>
      <EditorStatusBar
        slug={doc.slug}
        dirty={dirty}
        saving={saving}
        savedFlash={savedFlash}
        draftSavedAt={draftSavedAt}
        preview={preview}
        onTogglePreview={() => setPreview((v) => !v)}
        onSave={() => void doSave()}
        onClose={requestClose}
      />
      {error ? (
        <div
          className="break-keep border-b border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-4 py-1.5 text-label leading-label text-[color:var(--color-danger-text-strong)]"
          aria-live="polite"
          data-failure-detail={error.detail ?? undefined}
        >
          {error.sentence}
        </div>
      ) : null}
      <EditorToolbar
        onWrapSelection={wrapSelection}
        onPrefixLine={prefixLine}
        onInsertLink={insertLink}
      />
      <div className="flex min-h-0 flex-1">
        <div
          className={`relative min-h-0 ${
            preview ? 'w-1/2 border-r border-[color:var(--color-overlay-2)]' : 'flex-1'
          }`}
        >
          <textarea
            ref={taRef}
            aria-label={t('textareaAriaLabel')}
            value={content}
            onChange={(e) => {
              const next = e.target.value;
              setContent(next);
              if (allDocs && taRef.current) {
                const caret = taRef.current.selectionStart;
                const match = detectMentionTrigger(next, caret);
                if (match) placeMenuAtCaret(caret);
                setAutocomplete(
                  match ? { ...match, active: 0 } : null,
                );
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isImeComposing(e)) return;
              if (pendingMention) {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  // Dismissing the picker must not reach the window-level Escape handler, which
                  // would close the editor.
                  e.stopPropagation();
                  setPendingMention(null);
                  return;
                }
                const index = MENTION_RELATIONS.findIndex((r) => r.id === pendingRelation);
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  const step = e.key === 'ArrowDown' ? 1 : -1;
                  const next = cycleIndex(index, step, MENTION_RELATIONS.length);
                  setPendingRelation(MENTION_RELATIONS[next].id);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  applyMentionRelation(pendingRelation);
                  return;
                }
                return;
              }
              if (!autocomplete) return;
              if (acMatches.length === 0) {
                // Closable even with no results, so the user can keep writing.
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setAutocomplete(null);
                }
                return;
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAutocomplete((ac) =>
                  ac
                    ? { ...ac, active: cycleIndex(ac.active, 1, acMatches.length) }
                    : ac,
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAutocomplete((ac) =>
                  ac
                    ? { ...ac, active: cycleIndex(ac.active, -1, acMatches.length) }
                    : ac,
                );
              } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const pick = acMatches[autocomplete.active];
                if (!pick) return;
                pickMentionTarget(pick);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setAutocomplete(null);
              }
            }}
            onKeyUp={(e) => {
              if (!allDocs || !taRef.current) return;
              const caret = taRef.current.selectionStart;
              const src = (e.target as HTMLTextAreaElement).value;
              const match = detectMentionTrigger(src, caret);
              if (match) placeMenuAtCaret(caret);
              setAutocomplete((cur) => {
                if (!match) return null;
                if (cur && cur.start === match.start && cur.query === match.query)
                  return cur;
                return { ...match, active: 0 };
              });
            }}
            spellCheck={false}
            className="absolute inset-0 resize-none bg-[color:var(--color-surface-deep-a40)] px-6 py-6 font-mono text-body leading-prose text-[color:var(--color-text-secondary)] outline-none md:px-10"
          />
          {heldAutocomplete ? (
            <MentionTargetMenu
              held={heldAutocomplete}
              open={acOpen}
              at={menuAt}
              onHover={(index) =>
                setAutocomplete((ac) =>
                  ac ? { ...ac, active: index } : ac,
                )
              }
              onPick={pickMentionTarget}
            />
          ) : null}
          {mentionNotice ? (
            <p
              role="status"
              aria-live="polite"
              data-testid="editor-mention-notice"
              className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-chip border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-surface-deep-a98)] px-2 py-1 text-label text-[color:var(--color-text-secondary)]"
            >
              {mentionNotice === 'added'
                ? t('mentionRelationAdded')
                : t('mentionRelationExists')}
            </p>
          ) : null}
          {pendingMention ? (
            <MentionRelationMenu
              target={pendingMention.doc}
              selected={pendingRelation}
              at={menuAt}
              onHover={setPendingRelation}
              onPick={applyMentionRelation}
            />
          ) : null}
        </div>
        {preview ? <EditorPreview body={previewBody} /> : null}
      </div>
    </div>
  );
}
