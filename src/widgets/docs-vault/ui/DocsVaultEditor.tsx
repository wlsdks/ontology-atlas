'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
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
  Loader2,
  Quote,
  Save,
  X,
} from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
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
import { Chip, IconButton, RowButton, Surface, TopologyV2KindGlyph } from '@/shared/ui';

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
   * **Which vault this draft belongs to** — with the slug alone, different folders
   * produce the same key and overwrite each other's drafts (the data-loss path in
   * the `draftStorageKey` comment below).
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
 * A draft key **carries the vault too** (fix, 2026-08-01).
 *
 * It used to be slug-only (`…:README`), so **files of the same name in different
 * folders overwrote each other's drafts** — opening folder A's `README.md` to edit
 * showed folder B's body carrying a "Temporarily Saved · Final Save Required" tag. Prose the user
 * never wrote, presented as the user's unsaved changes.
 *
 * What follows is worse: if the two files were **byte-identical** at that moment
 * (common for a README or a scaffolded ontology document), the conflict branch did
 * not fire and the mtime guard passed, so **a save wrote folder A's draft over
 * folder B's file.** A data-loss path.
 *
 * ⚠️ Old keys (`…:<slug>`) are **not read back.** Reading them back is the defect,
 * and there is no way to know which vault such a draft belongs to. Leftover old
 * keys are harmless because nobody reads them, and editing the same document again
 * overwrites with the new key.
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
 * A simple textarea-based markdown editor. It does not go as far as Obsidian's vim
 * mode or live preview — the level is "quickly edit a local file in the browser".
 * On save it overwrites the original file through the File System Access API's
 * writable.
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
  const locale = useLocale();
  // The relation vocabulary is read from the same namespace by the map editor and the document editor.
  const tRelations = useTranslations('ontologyRelations');
  // Kind names use the same source the map and the new-document dialog use.
  const kindLabel = useOntologyKindLabel();
  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [legacyDraftConflict, setLegacyDraftConflict] = useState(false);
  const [preview, setPreview] = useState(false);
  const [debounced, setDebounced] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // Even when an external poll refreshes doc.mtime, the write baseline for unsaved
  // edits must be the disk version first read. Passing the latest prop through makes
  // the conflict guard compare two current values and silently overwrite an external change.
  const loadedMtimeRef = useRef<number | undefined>(doc.mtime);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wikilink autocomplete state. The popover shows while open is not null.
  const [autocomplete, setAutocomplete] = useState<{
    query: string;
    start: number;
    active: number;
  } | null>(null);

  /*
   * The trigger is `@` — it replaced the old `[[` on 2026-08-08.
   *
   * Two things changed. The notation (`[[` → `@`) is the surface; **what gets
   * written after choosing** is the substance. It used to put `[[slug]]` in the body,
   * and **that changed not one bit of the graph** (adding and removing it in the same
   * vault left the compile at 9 edges with an identical hash). Now it asks for the
   * relation kind and **writes it to frontmatter** — the decision logic lives in the
   * pure functions of `lib/mention-relation` and this file only handles the screen.
   *
   * `[[` is not kept alongside. With two syntaxes coexisting, the user has to judge
   * 「which one is the real connection」 every time, and the screen gives no clue.
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
   * Separate the autocomplete's **openness** from its **content** — that is what
   * makes an exit possible.
   *
   * ★ A **key** is passed to `useHeldValue`. This model is a fresh object every
   * render, so without a key the identity comparison loops forever and React #301
   * fires (the edge panel actually killed the map that way). Only a changed query or
   * caret position counts as a new value.
   */
  /**
   * The condition for opening the menu — **once a query is typed, it opens even with
   * zero results.**
   *
   * It used to be `matches.length > 0`, so a miss made the menu vanish silently, and
   * then the user could not distinguish 「the feature is broken」 from 「no such
   * concept exists」 — the lesson this repository keeps relearning (silence reads as
   * success, or as breakage).
   *
   * With only `@` typed it still shows the list (the first 8). Answering an empty
   * query with 「No results」 would simply be wrong.
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
  // Atlas A#5(a) — latest dirty in a ref so the content-load effect can skip a
  // poll-driven re-fetch over unsaved edits WITHOUT listing dirty as a dep
  // (which would re-fetch on every dirty toggle, incl. on save). Synced in an
  // effect, not during render (lint-clean).
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Live preview debounce — update `debounced` 200ms after a keystroke to cushion
  // the react-markdown re-render cost. A no-op while the preview is off.
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

  // Wrap the selection in a wrapper (e.g. **) and restore the caret. With no
  // selection, insert a placeholder at the caret and select it.
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
  // Wikilink autocomplete selection — replace the `[[<query>` part of content with
  // `[[slug]]`. `autocomplete.start + 2 + query.length` is used explicitly instead
  // of the caret, so the trigger range is covered exactly even after the user moved
  // the caret with arrow keys.
  /**
   * The chosen concept — **the relation is not decided yet.** This step existing is
   * the whole of this feature: stopping at the name makes it identical to the old
   * wikilink, which the graph never sees.
   */
  const [pendingMention, setPendingMention] = useState<{
    doc: VaultDoc;
    trigger: { query: string; start: number };
  } | null>(null);
  /** The bearing currently selected in step 2 — the keyboard cursor. */
  const [pendingRelation, setPendingRelation] = useState<MentionRelationId>(
    MENTION_RELATIONS[0].id,
  );

  /**
   * **Say** that the relation was written. This action's result is inside the
   * frontmatter, so saying nothing makes it look as though only a name went into the
   * body — and then the user reads it as the same thing the old wikilink did.
   */
  const [mentionNotice, setMentionNotice] = useState<'added' | 'exists' | null>(null);
  useEffect(() => {
    if (!mentionNotice) return;
    const timer = setTimeout(() => setMentionNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [mentionNotice]);

  /**
   * Where the menu stands — **exactly where the typing was**. It used to be pinned
   * to the editor's bottom-left corner (inherited from the wikilink popover). A
   * mention menu is an extension of the character being typed, so far from the eyes
   * it does not read as the result of what was just done — owner report, 2026-08-08.
   */
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
        // The menu's real size is only known after drawing, but an upper bound is
        // enough for placement — if the real size is smaller there is slack, not clipping.
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
       * ⚠️ Do not destructure this as `doc` — the component's prop is already named
       * `doc` (the document being edited) and would be shadowed. That mistake was
       * actually made, and the link's base point matched its destination, producing
       * `./same-folder.md` (measured 2026-08-08).
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
  // Put the caret at the url — computed back from after the text part (`url` is 4 characters).
      const urlStart = start + body.indexOf('(url)') + 1;
      ta.setSelectionRange(urlStart, urlStart + 3);
    });
  }, [content, t]);

  const doSave = useCallback(async () => {
    if (saving || content === null || !dirty) return;
    if (legacyDraftConflict) {
      setError(t('saveConflict'));
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
      // A rejected save (e.g. VaultConflictError — the file changed on disk
      // between read and write) must NOT mark the buffer clean: we never reached
      // setSavedContent, so dirty stays true and the #5(a) poll guard keeps the
      // unsaved edits safe. Surface a localized, reassuring message for the
      // conflict case (the raw message is technical English).
      const name = err instanceof Error ? err.name : '';
      setError(
        name === 'VaultConflictError'
          ? t('saveConflict')
          : name === 'VaultIdentityUidError'
            ? t('saveIdentityUid')
            : name === 'VaultIdentityHistoryError'
              ? t('saveIdentityHistory')
              : err instanceof Error
                ? err.message
                : t('saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  }, [content, dirty, doc.slug, legacyDraftConflict, onSave, saving, t, vaultScope]);

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
    // Atlas A#5(a) — data-loss guard. A background poll rebuilds the manifest →
    // `getDocContent` (editResolver, memoized on fileHandles) gets a new identity
    // → this effect re-runs. With UNSAVED edits, do NOT re-fetch: it would
    // silently overwrite the user's edits. A CLEAN editor still re-fetches
    // (reflects external changes). New-doc loads go through a fresh mount (the
    // editor `key` includes the slug), where dirtyRef is false.
    if (dirtyRef.current) return;
    let cancelled = false;
    getDocContent(doc.slug)
      .then((text) => {
        // Also re-check dirty here: a CLEAN re-fetch that was already in flight
        // when the user started typing must not land over the new edits.
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
        setError(diskChangedSinceDraft ? t('saveConflict') : null);
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
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [doc.mtime, doc.slug, getDocContent, t, vaultScope]);

  // After a clean save, once the parent manifest refreshes with the new mtime, the
  // baseline for the next edit advances too. External mtime changes while dirty are
  // never absorbed.
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

  useEffect(() => {
    if (content === null || savedContent === null || loadedSlug !== doc.slug) return;
    if (!dirty) {
      clearEditorDraft(vaultScope, doc.slug);
      if (draftSavedAt !== null) {
        window.queueMicrotask(() => setDraftSavedAt(null));
      }
      return;
    }
    const handle = window.setTimeout(() => {
      const updatedAt = Date.now();
      writeEditorDraft(vaultScope, {
        slug: doc.slug,
        content,
        diskContent: savedContent,
        diskMtime: loadedMtimeRef.current,
        updatedAt,
      });
      setDraftSavedAt(updatedAt);
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
  /*
   * Deferred for the same reason as the viewer — switching documents flashed this
   * three-bar skeleton for a single frame (the measurement in the `SKELETON_DELAY_MS`
   * comment). Both surfaces on the same screen have to follow the same discipline so
   * that moving between editing and reading does not make only one of them flash.
   */
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
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <div className="text-body text-[color:var(--color-text-tertiary)]">
          {t('loadFailed')}
        </div>
        <div className="font-mono text-label text-[color:var(--color-text-quaternary)]">
          {error}
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
      {/* Top action bar */}
      <div className="flex flex-none items-center gap-2 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-4 py-2 text-label">
        <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {t.rich('editorEyebrow', {
            slug: doc.slug,
            value: (chunks) => <span className="normal-case tracking-normal">{chunks}</span>,
          })}
        </span>
        {/* ⚠️ **The status chips on this row are one specification** (measured fix,
            2026-08-08). Only the save-status chip was `text-caption` (9.5px) while
            its neighbours 「Auto Backup · Last Saved」 and 「Verify · Undo」 were
            `text-label` (11px) — chips of the same kind standing side by side on one
            row, with the ramp off by a step (the parent row is itself `text-label`).
            The same defect type as the one caught in the settings sheet on
            2026-08-02, with the same cause: nobody decided "only this chip is small".
            Gate: `tests/contract/editor-status-chip-dialect.contract.test.ts`. */}
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
                <Loader2 size={ICON_SIZE.sm} className="animate-spin" aria-hidden />
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
        >
          {error}
        </div>
      ) : null}
      {/* Formatting toolbar */}
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
               * Step 2 (choosing the relation) is also **completable from the
               * keyboard**. Someone who picked step 1 with Enter already has their
               * hands on the keyboard, and demanding a mouse there breaks the flow —
               * for a keyboard-only user it is a closed door. Focus stays in the
               * textarea, so it is handled here.
               */
              if (pendingMention) {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  // Dismissing the picker must not also close the editor: the
                  // window-level Escape handler runs requestClose (with the
                  // discard dialog on a dirty buffer) on any Escape that
                  // reaches it (bug sweep 2026-09-01).
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
                // It must be **closable** even with no results. A box you cannot close
                // stops the user from continuing to write.
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
              // It hangs at the editor's bottom-left and grows upward — the entry origin is that corner too.
              origin="bottom left"
              /*
                Uses this repository's menu dialect — the same
                `--chrome-radius-inner` · `border-soft` · `elevated` ·
                `--chrome-shadow` as the vault chip and the sort menu. It used to be
                an indigo border plus `surface-deep` plus `elevation-2`, which made
                **this menu alone look like a different object** on this screen
                (owner report, 2026-08-08).
              */
              className="pointer-events-auto absolute z-10 overflow-hidden rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] shadow-[var(--chrome-shadow)]"
              style={{
                width: MENTION_MENU_WIDTH,
                top: menuAt?.top ?? 0,
                left: menuAt?.left ?? 0,
              }}
            >
              <div className="border-b border-[color:var(--color-border-soft)] px-2 py-1.5 text-label text-[color:var(--color-text-tertiary)]">
                {/* With an empty query, an empty pair of quotes (`· ""`) was left on screen (confirmed on a real device). */}
                <span className="block truncate">
                  {t('mentionLabel', {
                    query: heldAutocomplete.query ? ` · “${heldAutocomplete.query}”` : '',
                  })}
                </span>
                {/* State up front 「what happens if I choose」 — this menu's result is
                    inside the frontmatter, so unsaid it reads as a feature that only
                    inserts a link (owner: *"I don't understand what this means"* — I can't tell
                    what this means). */}
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
                      {/* Kind marker — owner: *"I don't even know which concept this refers to"* (I
                          can't tell which concept this even is). A list of titles
                          alone cannot say whether something is a domain, a capability
                          or an element, and without that you cannot decide which
                          relation to use. Same glyphs as the map and the studio. */}
                      <TopologyV2KindGlyph
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
          {/*
            Step 2 — **where the relation is chosen.** This step is the whole of the
            feature. Stopping at the name here makes it identical to the old wikilink,
            which neither the map nor path-finding sees (measured: adding and removing
            one left the compile identical). The vocabulary is the studio compass's —
            different words for the same job teach the user two features.
          */}
          {/*
            The relation is written inside the frontmatter, so **unsaid it is
            invisible.** In silence the user reads it as only a name going into the
            body, which is exactly the impression of the old wikilink we removed. It
            goes to assistive technology too.
          */}
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
                Uses this repository's menu dialect — the same
                `--chrome-radius-inner` · `border-soft` · `elevated` ·
                `--chrome-shadow` as the vault chip and the sort menu. It used to be
                an indigo border plus `surface-deep` plus `elevation-2`, which made
                **this menu alone look like a different object** on this screen
                (owner report, 2026-08-08).
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
            <article className="mx-auto max-w-[720px] px-6 py-6 md:px-8">
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
