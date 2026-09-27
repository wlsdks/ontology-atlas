'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { useFailureSentence } from '@/shared/lib/use-failure-sentence';
import type { FailureCopy } from '@/shared/lib/use-failure-sentence';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bold,
  Check,
  CheckSquare,
  Code as CodeIcon,
  Eye,
  EyeOff,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Save,
  X,
} from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { BrandMark } from '@/shared/ui/brand-mark';
import type { VaultDoc } from '@/entities/docs-vault';
import { useOntologyKindLabel } from '@/entities/ontology-class';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';
import { useDelayedVisible, useHeldValue } from '@/shared/lib/use-presence';
import { caretPoint, clampMenuToBox } from '../lib/caret-position';
import {
  detectMentionTrigger,
  insertMentionRelation,
  MENTION_RELATIONS,
  RELATION_LABEL_KEY,
  type MentionRelationId,
} from '../lib/mention-relation';
import { Chip, IconButton, RowButton, Surface, OntologyMapKindGlyph } from '@/shared/ui';

interface Props {
  doc: VaultDoc;
  /** Fetch the raw md — the same resolver as the viewer. A local vault reads through fileHandle. */
  getDocContent: (slug: string) => Promise<string>;
  /** Called on save. expectedMtime is the value at the time this editor read the source. Throws on failure. */
  onSave: (
    slug: string,
    content: string,
    expectedMtime?: number,
  ) => Promise<void>;
  /** End editing (after a successful save, or on cancel). */
  onClose: () => void;
  /** Every document in the vault (for wikilink autocomplete). Without it, autocomplete is off. */
  allDocs?: VaultDoc[];
  /**
   * The vault this draft belongs to; with the slug alone, different folders share a key and
   * overwrite each other's drafts.
   */
  vaultScope: string;
}

interface EditorDraft {
  slug: string;
  content: string;
  diskContent: string;
  diskMtime?: number;
  updatedAt: number;
}

/** The mention menu's width and max height — position calculation and drawing use the same values. */
const MENTION_MENU_WIDTH = 320;
const MENTION_MENU_MAX_HEIGHT = 280;

const DRAFT_STORAGE_PREFIX = 'ontology-atlas:docs-vault-editor-draft:';

/**
 * Draft key carries the vault, or same-named files in different folders share drafts and a save can
 * write one folder's draft over another's file. Old slug-only keys are never read back, because
 * their vault is unknown.
 */
function draftStorageKey(vaultScope: string, slug: string) {
  return `${DRAFT_STORAGE_PREFIX}${vaultScope}:${slug}`;
}

function readEditorDraft(vaultScope: string, slug: string): EditorDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(draftStorageKey(vaultScope, slug));
    if (!raw) return null;
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

function writeEditorDraft(vaultScope: string, draft: EditorDraft) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(draftStorageKey(vaultScope, draft.slug), JSON.stringify(draft));
  } catch {
    // localStorage may be unavailable in privacy modes. Disk save still works.
  }
}

function clearEditorDraft(vaultScope: string, slug: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(draftStorageKey(vaultScope, slug));
  } catch {
    // no-op
  }
}

/**
 * A textarea markdown editor that saves over the original file through the File System Access API.
 */
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
  // The relation vocabulary is read from the same namespace by the map editor and the document editor.
  const tRelations = useTranslations('ontologyRelations');
  // Kind names use the same source the map and the new-document dialog use.
  const kindLabel = useOntologyKindLabel();
  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  /*
   * A failure has two halves: `sentence` is rendered; `detail` is the machine half and only reaches
   * `data-failure-detail`.
   */
  const [error, setError] = useState<FailureCopy | null>(null);
  const [saving, setSaving] = useState(false);
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

  // Wikilink autocomplete state. The popover shows while open is not null.
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
    const q = autocomplete.query.toLowerCase();
    // The current document is not a candidate — a node cannot link to itself.
    if (!q) return allDocs.filter((d) => d.slug !== doc.slug).slice(0, 8);
    return allDocs
      .filter(
        (d) =>
          d.slug !== doc.slug &&
          (d.title.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [autocomplete, allDocs, doc.slug]);

  /**
   * Separate the menu's openness from its content. `useHeldValue` gets a key because the model is a
   * fresh object each render; without it React #301 loops.
   */
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

  // The body used for the preview — frontmatter block removed.
  const previewBody = useMemo(() => {
    const src = debounced ?? content ?? '';
    return src.startsWith('---')
      ? src.replace(/^---[\s\S]*?\n---\n?/, '')
      : src;
  }, [debounced, content]);

  // Wrap the selection and restore the caret; with no selection insert a selected placeholder.
  const wrapSelection = useCallback((wrapper: string, placeholder?: string) => {
    const ta = taRef.current;
    if (!ta || content === null) return;
    const ph = placeholder ?? t('placeholder');
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end) || ph;
    const next =
      content.slice(0, start) + wrapper + selected + wrapper + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      const selStart = start + wrapper.length;
      ta.setSelectionRange(selStart, selStart + selected.length);
    });
  }, [content, t]);
  // Prefix the current line (for headings, lists and quotes).
  const prefixLine = useCallback((prefix: string) => {
    const ta = taRef.current;
    if (!ta || content === null) return;
    const caret = ta.selectionStart;
    const lineStart = content.lastIndexOf('\n', caret - 1) + 1;
    const next = content.slice(0, lineStart) + prefix + content.slice(lineStart);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      const p = caret + prefix.length;
      ta.setSelectionRange(p, p);
    });
  }, [content]);
  // Replace exactly `autocomplete.start + 2 + query.length`, so the range holds even after arrow
  // keys moved the caret.
  /**
   * The chosen concept before its relation is decided; stopping at the name would add nothing to
   * the graph.
   */
  const [pendingMention, setPendingMention] = useState<{
    doc: VaultDoc;
    trigger: { query: string; start: number };
  } | null>(null);
  /** The bearing currently selected in step 2 — the keyboard cursor. */
  const [pendingRelation, setPendingRelation] = useState<MentionRelationId>(
    MENTION_RELATIONS[0].id,
  );

  /** Announce that the relation was written, since its result is only in frontmatter. */
  const [mentionNotice, setMentionNotice] = useState<'added' | 'exists' | null>(null);
  useEffect(() => {
    if (!mentionNotice) return;
    const timer = setTimeout(() => setMentionNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [mentionNotice]);

  /** The menu stands where the typing was. */
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
       * Do not destructure this as `doc`: it shadows the edited document and the link comes out as
       * `./same-folder.md`.
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
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(result.caret, result.caret);
      });
    },
    [content, doc.slug, locale, pendingMention],
  );


  // Insert a [text](url) link. With a selection, that becomes the text.
  const insertLink = useCallback(() => {
    const ta = taRef.current;
    if (!ta || content === null) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end);
    const body = `[${selected || t('linkText')}](url)`;
    const next = content.slice(0, start) + body + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
  // Put the caret at the url, computed back from the text part (`url` is 4 characters).
      const urlStart = start + body.indexOf('(url)') + 1;
      ta.setSelectionRange(urlStart, urlStart + 3);
    });
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
    } catch (err) {
      // A rejected save (e.g. VaultConflictError) must not mark the buffer clean, so the poll guard
      // keeps the edits; show a localized message for conflicts.
      const name = err instanceof Error ? err.name : '';
      setError(
        name === 'VaultConflictError'
          ? { sentence: t('saveConflict'), detail: null }
          : name === 'VaultIdentityUidError'
            ? { sentence: t('saveIdentityUid'), detail: null }
            : name === 'VaultIdentityHistoryError'
              ? { sentence: t('saveIdentityHistory'), detail: null }
              : failureSentence(err, t('saveFailed')),
      );
    } finally {
      setSaving(false);
    }
  }, [content, dirty, doc.slug, failureSentence, legacyDraftConflict, onSave, saving, t, vaultScope]);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (
      dirty &&
      typeof window !== 'undefined' &&
      !window.confirm(t('discardConfirm'))
    ) {
      return;
    }
    if (dirty) {
      clearEditorDraft(vaultScope, doc.slug);
      setDraftSavedAt(null);
    }
    onClose();
  }, [dirty, doc.slug, onClose, saving, t, vaultScope]);

  useEffect(() => {
    // Data-loss guard: a poll gives `getDocContent` a new identity; with unsaved edits do not
    // re-fetch. A clean editor still re-fetches, and new documents mount fresh with dirtyRef false.
    if (dirtyRef.current) return;
    let cancelled = false;
    getDocContent(doc.slug)
      .then((text) => {
        // Re-check dirty: an in-flight clean re-fetch must not land over edits started meanwhile.
        if (cancelled || dirtyRef.current) return;
        const draft = readEditorDraft(vaultScope, doc.slug);
        const shouldRestoreDraft =
          draft !== null && draft.content !== text;
        const diskChangedSinceDraft =
          shouldRestoreDraft && draft.diskContent !== text;
        setContent(shouldRestoreDraft ? draft.content : text);
        setSavedContent(text);
        setLoadedSlug(doc.slug);
        loadedMtimeRef.current =
          diskChangedSinceDraft && typeof draft.diskMtime === 'number'
            ? draft.diskMtime
            : doc.mtime;
        setDebounced(shouldRestoreDraft ? draft.content : text);
        const cannotVerifyLegacyDraft =
          diskChangedSinceDraft && typeof draft.diskMtime !== 'number';
        setLegacyDraftConflict(cannotVerifyLegacyDraft);
        setError(diskChangedSinceDraft ? { sentence: t('saveConflict'), detail: null } : null);
        setSavedFlash(false);
        setDraftSavedAt(shouldRestoreDraft ? draft.updatedAt : null);
        setAutocomplete(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setContent(null);
        setSavedContent(null);
        setLoadedSlug(doc.slug);
        setDraftSavedAt(null);
        setLegacyDraftConflict(false);
        setError(failureSentence(err, t('loadFailed')));
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

  // Cmd+S / Ctrl+S to save; Cmd+B/I/K formatting shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
  }, [doSave, insertLink, requestClose, wrapSelection]);

  const loading = loadedSlug !== doc.slug;
  /* Deferred like the viewer's skeleton so switching documents does not flash it for a frame. */
  const showSkeleton = useDelayedVisible(loading || content === null);
  const saveState = saving
    ? { label: t('saving'), body: t('savingDetail'), tone: 'saving' }
    : dirty
      ? {
          label: draftSavedAt ? t('draftSaved') : t('dirty'),
          body: draftSavedAt ? t('draftSavedDetail') : t('dirtyDetail'),
          tone: 'dirty',
        }
      : savedFlash
        ? { label: t('saved'), body: t('savedDetail'), tone: 'saved' }
        : { label: t('clean'), body: t('cleanDetail'), tone: 'clean' };

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
      <div className="flex flex-none items-center gap-2 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-4 py-2 text-label">
        <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {t.rich('editorEyebrow', {
            slug: doc.slug,
            value: (chunks) => <span className="normal-case tracking-normal">{chunks}</span>,
          })}
        </span>
        {/*
         * The status chips on this row share one type step
         * (`tests/contract/editor-status-chip-dialect.contract.test.ts`).
         */}
        <span
          className={
            saveState.tone === 'dirty'
              ? "inline-flex items-center gap-1.5 rounded-micro border border-[color:var(--color-amber-docs-a25)] bg-[color:var(--color-amber-docs-a08)] px-2 py-1 font-mono text-label uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-amber-docs-a95)]"
              : saveState.tone === 'saved'
                ? "inline-flex items-center gap-1.5 rounded-micro border border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-indigo-a08)] px-2 py-1 font-mono text-label uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-indigo-line-a90)]"
                : "inline-flex items-center gap-1.5 rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2 py-1 font-mono text-label uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-tertiary)]"
          }
          aria-live="polite"
        >
          {saveState.tone === 'saved' ? <Check size={ICON_SIZE.sm} aria-hidden /> : null}
          <span>{saveState.label}</span>
          <span className="hidden normal-case tracking-normal text-[color:var(--color-text-quaternary)] sm:inline">
            {saveState.body}
          </span>
        </span>
        <span
          className="hidden min-w-0 items-center gap-1.5 rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-label text-[color:var(--color-text-tertiary)] lg:inline-flex"
          aria-label={t('saveContractAriaLabel')}
        >
          <Check size={ICON_SIZE.sm} className="text-[color:var(--color-text-quaternary)]" aria-hidden />
          <span className="font-mono uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
            {t('draftContract')}
          </span>
          <span className="truncate">
            {draftSavedAt
              ? t('draftContractActive')
              : dirty
                ? t('draftContractPending')
                : t('draftContractIdle')}
          </span>
          <span className="text-[color:var(--color-text-quaternary)]" aria-hidden>
            ·
          </span>
          <Save
            size={ICON_SIZE.sm}
            className={
              dirty
                ? 'text-[color:var(--color-amber-docs-a95)]'
                : 'text-[color:var(--color-text-quaternary)]'
            }
            aria-hidden
          />
          <span className="font-mono uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
            {t('diskContract')}
          </span>
          <span
            className={`truncate ${
              dirty
                ? 'font-[var(--font-weight-signature)] text-[color:var(--color-amber-docs-a95)]'
                : 'text-[color:var(--color-text-tertiary)]'
            }`}
          >
            {dirty ? t('diskContractNeedsSave') : t('diskContractClean')}
          </span>
        </span>
        <span
          className="hidden min-w-0 items-center gap-1.5 rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-label text-[color:var(--color-text-tertiary)] 2xl:inline-flex"
          aria-label={t('saveWorkflowAriaLabel')}
        >
          <CheckSquare
            size={ICON_SIZE.sm}
            className={
              dirty
                ? 'text-[color:var(--color-amber-docs-a95)]'
                : 'text-[color:var(--color-text-quaternary)]'
            }
            aria-hidden
          />
          <span className="font-mono uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
            {t('validateContract')}
          </span>
          <span
            className={`truncate ${
              dirty
                ? 'font-[var(--font-weight-signature)] text-[color:var(--color-amber-docs-a95)]'
                : 'text-[color:var(--color-text-tertiary)]'
            }`}
          >
            {dirty ? t('validateContractDirty') : t('validateContractClean')}
          </span>
          <span className="text-[color:var(--color-text-quaternary)]" aria-hidden>
            ·
          </span>
          <X
            size={ICON_SIZE.sm}
            className={
              dirty
                ? 'text-[color:var(--color-amber-docs-a95)]'
                : 'text-[color:var(--color-text-quaternary)]'
            }
            aria-hidden
          />
          <span className="font-mono uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
            {t('revertContract')}
          </span>
          <span className="truncate">
            {dirty ? t('revertContractDirty') : t('revertContractClean')}
          </span>
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Chip
            active={preview}
            onClick={() => setPreview((v) => !v)}
            className="hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]"
            aria-pressed={preview}
            title={t('previewTooltip')}
          >
            {preview ? (
              <EyeOff size={ICON_SIZE.sm} aria-hidden />
            ) : (
              <Eye size={ICON_SIZE.sm} aria-hidden />
            )}
            {t('preview')}
          </Chip>
          <Chip
            active
            tone="accentOnTint"
            onClick={() => void doSave()}
            disabled={saving || !dirty}
            className="hover:border-[color:var(--color-indigo-line-a54)]"
            title={t('saveTooltip')}
          >
            {saving ? (
              <>
                {/* Keep the 12px layout slot while the micro master stays native 16px. */}
                <span className="relative inline-flex size-3 shrink-0" aria-hidden="true">
                  <BrandMark detail="micro" alt="" className="atlas-inline-waiting-mark absolute left-1/2 top-1/2 size-4 max-w-none -translate-x-1/2 -translate-y-1/2" />
                </span>
                {t('saving')}
              </>
            ) : (
              <>
                <Save size={ICON_SIZE.sm} aria-hidden />
                {t('save')}
              </>
            )}
          </Chip>
          <Chip
            onClick={requestClose}
            disabled={saving}
            className="hover:border-[color:var(--color-overlay-3)] hover:text-[color:var(--color-text-primary)]"
            title={dirty ? t('closeUnsavedTooltip') : t('closeTooltip')}
          >
            <X size={ICON_SIZE.sm} aria-hidden />
            {dirty ? t('cancel') : t('closeAction')}
          </Chip>
        </div>
      </div>
      {error ? (
        <div
          className="break-keep border-b border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-4 py-1.5 text-label leading-label text-[color:var(--color-danger-text-strong)]"
          aria-live="polite"
          data-failure-detail={error.detail ?? undefined}
        >
          {error.sentence}
        </div>
      ) : null}
      <div className="flex flex-none items-center gap-0.5 border-b border-[color:var(--color-overlay-2)] bg-[color:var(--color-elevated)] px-3 py-1 text-[color:var(--color-text-tertiary)]">
        <ToolbarButton
          icon={<Bold size={ICON_SIZE.sm} />}
          label={t('tbBold')}
          onClick={() => wrapSelection('**')}
        />
        <ToolbarButton
          icon={<Italic size={ICON_SIZE.sm} />}
          label={t('tbItalic')}
          onClick={() => wrapSelection('*')}
        />
        <ToolbarButton
          icon={<CodeIcon size={ICON_SIZE.sm} />}
          label={t('tbCode')}
          onClick={() => wrapSelection('`')}
        />
        <span className="mx-1 h-4 w-px bg-[color:var(--color-divider)]" />
        <ToolbarButton
          icon={<Heading1 size={ICON_SIZE.sm} />}
          label={t('tbH1')}
          onClick={() => prefixLine('# ')}
        />
        <ToolbarButton
          icon={<Heading2 size={ICON_SIZE.sm} />}
          label={t('tbH2')}
          onClick={() => prefixLine('## ')}
        />
        <ToolbarButton
          icon={<Heading3 size={ICON_SIZE.sm} />}
          label={t('tbH3')}
          onClick={() => prefixLine('### ')}
        />
        <span className="mx-1 h-4 w-px bg-[color:var(--color-divider)]" />
        <ToolbarButton
          icon={<List size={ICON_SIZE.sm} />}
          label={t('tbBullet')}
          onClick={() => prefixLine('- ')}
        />
        <ToolbarButton
          icon={<ListOrdered size={ICON_SIZE.sm} />}
          label={t('tbNumbered')}
          onClick={() => prefixLine('1. ')}
        />
        <ToolbarButton
          icon={<CheckSquare size={ICON_SIZE.sm} />}
          label={t('tbCheckbox')}
          onClick={() => prefixLine('- [ ] ')}
        />
        <ToolbarButton
          icon={<Quote size={ICON_SIZE.sm} />}
          label={t('tbQuote')}
          onClick={() => prefixLine('> ')}
        />
        <span className="mx-1 h-4 w-px bg-[color:var(--color-divider)]" />
        <ToolbarButton
          icon={<LinkIcon size={ICON_SIZE.sm} />}
          label={t('tbLink')}
          onClick={insertLink}
        />
      </div>
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
              /*
               * Step 2 is completable from the keyboard; focus stays in the textarea, so it is
               * handled here.
               */
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
                  const next =
                    (index + step + MENTION_RELATIONS.length) % MENTION_RELATIONS.length;
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
                    ? { ...ac, active: (ac.active + 1) % acMatches.length }
                    : ac,
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAutocomplete((ac) =>
                  ac
                    ? {
                        ...ac,
                        active:
                          (ac.active - 1 + acMatches.length) %
                          acMatches.length,
                      }
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
              // An arrow key alone updates the caret position → re-detect.
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
            <Surface
              open={acOpen}
              origin="bottom left"
              /*
               * This repository's menu dialect: `--chrome-radius-inner`, `border-soft`, `elevated`,
               * `--chrome-shadow`.
               */
              className="pointer-events-auto absolute z-10 overflow-hidden rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] shadow-[var(--chrome-shadow)]"
              style={{
                width: MENTION_MENU_WIDTH,
                top: menuAt?.top ?? 0,
                left: menuAt?.left ?? 0,
              }}
            >
              <div className="border-b border-[color:var(--color-border-soft)] px-2 py-1.5 text-label text-[color:var(--color-text-tertiary)]">
                {/* Hide the empty quotes for an empty query. */}
                <span className="block truncate">
                  {t('mentionLabel', {
                    query: heldAutocomplete.query ? ` · “${heldAutocomplete.query}”` : '',
                  })}
                </span>
                {/* States up front that choosing writes to frontmatter, not only a link. */}
                <span className="block truncate text-label text-[color:var(--color-text-quaternary)]">
                  {t('mentionHint')}
                </span>
              </div>
              {heldAutocomplete.matches.length === 0 ? (
                <p className="px-2 py-2 text-label text-[color:var(--color-text-tertiary)]">
                  {t('mentionEmpty')}
                </p>
              ) : null}
              <ul className="overflow-auto py-0.5" style={{ maxHeight: MENTION_MENU_MAX_HEIGHT - 64 }}>
                {heldAutocomplete.matches.map((d, idx) => (
                  <li key={d.slug}>
                    <RowButton
                      active={idx === heldAutocomplete.active}
                      onMouseEnter={() =>
                        setAutocomplete((ac) =>
                          ac ? { ...ac, active: idx } : ac,
                        )
                      }
                      onClick={() => pickMentionTarget(d)}
                      className="hover:bg-[color:var(--color-overlay-1)]"
                    >
                      {/*
                       * Kind marker, same glyphs as the map and studio, so the relation can be
                       * chosen knowingly.
                       */}
                      <OntologyMapKindGlyph
                        kind={String(d.frontmatter?.kind ?? 'unknown')}
                        size={12}
                      />
                      <span className="truncate text-body text-[color:var(--color-text-primary)]">
                        {resolveLocaleDisplayName(d.frontmatter, locale, d.title)}
                      </span>
                      <span className="ml-auto shrink-0 truncate text-label text-[color:var(--color-text-quaternary)]">
                        {kindLabel(String(d.frontmatter?.kind ?? ''))}
                      </span>
                    </RowButton>
                  </li>
                ))}
              </ul>
              <div className="border-t border-[color:var(--color-border-soft)] px-2 py-1.5 text-label text-[color:var(--color-text-quaternary)]">
                {t('mentionFooter')}
              </div>
            </Surface>
          ) : null}
          {/* Step 2 chooses the relation, with the studio compass's vocabulary. */}
          {/* Announces the frontmatter write, including to assistive technology. */}
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
            <Surface
              open
              origin="bottom left"
              role="menu"
              aria-label={t('mentionRelationLabel', {
                title: resolveLocaleDisplayName(
                  pendingMention.doc.frontmatter,
                  locale,
                  pendingMention.doc.title,
                ),
              })}
              /*
               * This repository's menu dialect: `--chrome-radius-inner`, `border-soft`, `elevated`,
               * `--chrome-shadow`.
               */
              className="pointer-events-auto absolute z-10 overflow-hidden rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] shadow-[var(--chrome-shadow)]"
              style={{
                width: MENTION_MENU_WIDTH,
                top: menuAt?.top ?? 0,
                left: menuAt?.left ?? 0,
              }}
            >
              <div className="border-b border-[color:var(--color-border-soft)] px-2 py-1.5 text-label text-[color:var(--color-text-tertiary)]">
                {t('mentionRelationLabel', {
                  title: resolveLocaleDisplayName(
                    pendingMention.doc.frontmatter,
                    locale,
                    pendingMention.doc.title,
                  ),
                })}
              </div>
              <ul className="py-0.5">
                {MENTION_RELATIONS.map((relation) => (
                  <li key={relation.id}>
                    <RowButton
                      role="menuitem"
                      active={relation.id === pendingRelation}
                      onMouseEnter={() => setPendingRelation(relation.id)}
                      data-testid={`editor-mention-relation-${relation.id}`}
                      onClick={() => applyMentionRelation(relation.id)}
                      className="hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                    >
                      <span className="truncate text-body">
                        {tRelations(`relationShort.${RELATION_LABEL_KEY[relation.id]}`)}
                      </span>
                    </RowButton>
                  </li>
                ))}
              </ul>
              <div className="border-t border-[color:var(--color-border-soft)] px-2 py-1.5 text-label leading-label text-[color:var(--color-text-quaternary)]">
                {t('mentionRelationFooter')}
              </div>
            </Surface>
          ) : null}
        </div>
        {preview ? (
          <div className="min-h-0 w-1/2 overflow-auto bg-[color:var(--color-surface-deep-a20)]">
            <article className="mx-auto max-w-[var(--measure-doc-column)] px-6 py-6 md:px-8">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: (props) => (
                    <h1
                      className="mt-0 mb-4 text-display font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
                      {...props}
                    />
                  ),
                  h2: (props) => (
                    <h2
                      className="mt-8 mb-2 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
                      {...props}
                    />
                  ),
                  h3: (props) => (
                    <h3
                      className="mt-6 mb-2 text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
                      {...props}
                    />
                  ),
                  p: (props) => (
                    <p
                      className="my-3 text-body leading-prose text-[color:var(--color-text-secondary)]"
                      {...props}
                    />
                  ),
                  ul: (props) => (
                    <ul
                      className="my-3 list-disc pl-6 text-body leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
                      {...props}
                    />
                  ),
                  ol: (props) => (
                    <ol
                      className="my-3 list-decimal pl-6 text-body leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
                      {...props}
                    />
                  ),
                  code: ({ className, children, ...rest }) => {
                    const isBlock = /language-/.test(className ?? '');
                    if (!isBlock) {
                      return (
                        <code
                          className="rounded-micro bg-[color:var(--color-indigo-line-a06)] px-1 py-0.5 font-mono text-label text-[color:var(--color-indigo-pale-a95)]"
                          {...rest}
                        >
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code className={className} {...rest}>
                        {children}
                      </code>
                    );
                  },
                  pre: (props) => (
                    <pre
                      className="my-3 overflow-x-auto rounded-chip border border-[color:var(--color-overlay-2)] bg-[color:var(--color-surface-deep-a80)] p-3 font-mono text-body text-[color:var(--color-indigo-pale-a92)]"
                      {...props}
                    />
                  ),
                  blockquote: (props) => (
                    <blockquote
                      className="my-3 border-l-2 border-[color:var(--color-indigo-line-a35)] pl-3 italic text-[color:var(--color-text-tertiary)]"
                      {...props}
                    />
                  ),
                }}
              >
                {previewBody}
              </ReactMarkdown>
            </article>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <IconButton
      label={label}
      onClick={onClick}
      className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
    >
      {icon}
    </IconButton>
  );
}
