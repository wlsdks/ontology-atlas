'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
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
import type { VaultDoc } from '@/entities/docs-vault';

interface Props {
  doc: VaultDoc;
  /** md 원본 취득 — 뷰어와 동일한 resolver. 로컬 볼트는 fileHandle 로 읽기. */
  getDocContent: (slug: string) => Promise<string>;
  /** 저장 시 호출. 실패 시 throw. */
  onSave: (slug: string, content: string) => Promise<void>;
  /** 편집 종료 (저장 성공 후 또는 취소). */
  onClose: () => void;
  /** vault 의 모든 문서 (wikilink 자동완성용). 없으면 autocomplete off. */
  allDocs?: VaultDoc[];
}

interface EditorDraft {
  slug: string;
  content: string;
  diskContent: string;
  updatedAt: number;
}

const DRAFT_STORAGE_PREFIX = 'ontology-atlas:docs-vault-editor-draft:';

function draftStorageKey(slug: string) {
  return `${DRAFT_STORAGE_PREFIX}${slug}`;
}

function readEditorDraft(slug: string): EditorDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(draftStorageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorDraft>;
    if (
      parsed.slug !== slug ||
      typeof parsed.content !== 'string' ||
      typeof parsed.diskContent !== 'string' ||
      typeof parsed.updatedAt !== 'number'
    ) {
      return null;
    }
    return parsed as EditorDraft;
  } catch {
    return null;
  }
}

function writeEditorDraft(draft: EditorDraft) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(draftStorageKey(draft.slug), JSON.stringify(draft));
  } catch {
    // localStorage may be unavailable in privacy modes. Disk save still works.
  }
}

function clearEditorDraft(slug: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(draftStorageKey(slug));
  } catch {
    // no-op
  }
}

/**
 * 단순 textarea 기반 마크다운 에디터. 옵시디언의 vim 모드나 live preview
 * 까지는 안 가고, "로컬 파일을 브라우저에서 빠르게 수정" 수준. 저장 시
 * 원본 파일을 File System Access API writable 로 덮어쓴다.
 */
export function DocsVaultEditor({
  doc,
  getDocContent,
  onSave,
  onClose,
  allDocs,
}: Props) {
  const t = useTranslations('vaultWidgets.editor');
  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [debounced, setDebounced] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wikilink autocomplete 상태. open 이 null 이 아닐 때 popover 표시.
  const [autocomplete, setAutocomplete] = useState<{
    query: string;
    start: number;
    active: number;
  } | null>(null);

  // 현재 캐럿 기준으로 `[[ ` 트리거 검사. 매치되면 query, start index 반환.
  const detectWikilinkTrigger = (
    src: string,
    caret: number,
  ): { query: string; start: number } | null => {
    // 직전 200자 내에서 `[[` 찾기 + 그 사이에 `]]` 이 없어야 함.
    const back = src.slice(Math.max(0, caret - 200), caret);
    const idx = back.lastIndexOf('[[');
    if (idx === -1) return null;
    const between = back.slice(idx);
    if (between.includes(']]')) return null;
    // query 에 줄바꿈 있으면 off
    if (/\n/.test(between.slice(2))) return null;
    const start = caret - (back.length - idx);
    return { query: between.slice(2), start };
  };

  const acMatches = useMemo<VaultDoc[]>(() => {
    if (!autocomplete || !allDocs) return [];
    const q = autocomplete.query.toLowerCase();
    if (!q) return allDocs.slice(0, 8);
    return allDocs
      .filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.slug.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [autocomplete, allDocs]);

  const dirty = content !== null && content !== savedContent;
  // Atlas A#5(a) — latest dirty in a ref so the content-load effect can skip a
  // poll-driven re-fetch over unsaved edits WITHOUT listing dirty as a dep
  // (which would re-fetch on every dirty toggle, incl. on save). Synced in an
  // effect, not during render (lint-clean).
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Live preview 디바운스 — 키 입력 시 200ms 뒤에 debounced 를 갱신해
  // react-markdown 재렌더 비용 완충. preview 꺼져있으면 no-op.
  useEffect(() => {
    if (!preview || content === null) return;
    const handle = window.setTimeout(() => setDebounced(content), 200);
    return () => window.clearTimeout(handle);
  }, [preview, content]);

  // 미리보기용 본문 — frontmatter 블록 제거.
  const previewBody = useMemo(() => {
    const src = debounced ?? content ?? '';
    return src.startsWith('---')
      ? src.replace(/^---[\s\S]*?\n---\n?/, '')
      : src;
  }, [debounced, content]);

  // 선택 영역을 wrapper (ex. **) 로 감싸고 caret 복구. 선택 없으면 caret
  // 위치에 placeholder 삽입 후 자동 선택.
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
  // 현재 줄 앞에 prefix 를 붙인다 (heading, list, quote 용).
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
  // Wikilink autocomplete 선택 — content 의 [[<query> 부분을 [[slug]] 로
  // 치환. caret 대신 autocomplete.start + 2 + query.length 를 명시적으로
  // 써서 사용자가 화살표로 caret 을 옮겼어도 트리거 범위를 정확히 덮는다.
  const applyWikilink = useCallback((slug: string) => {
    const ta = taRef.current;
    if (!ta || content === null || !autocomplete) return;
    const replacement = `[[${slug}]]`;
    const triggerEnd =
      autocomplete.start + 2 + autocomplete.query.length;
    const next =
      content.slice(0, autocomplete.start) +
      replacement +
      content.slice(triggerEnd);
    setContent(next);
    setAutocomplete(null);
    requestAnimationFrame(() => {
      ta.focus();
      const p = autocomplete.start + replacement.length;
      ta.setSelectionRange(p, p);
    });
  }, [autocomplete, content]);

  // 링크 형식 [text](url) 삽입. 선택이 있으면 그걸 text 로.
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
      // url 자리에 caret — text 부분 뒤 1+...(url 이 4글자) 역산
      const urlStart = start + body.indexOf('(url)') + 1;
      ta.setSelectionRange(urlStart, urlStart + 3);
    });
  }, [content, t]);

  const doSave = useCallback(async () => {
    if (saving || content === null || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(doc.slug, content);
      setSavedContent(content);
      clearEditorDraft(doc.slug);
      setDraftSavedAt(null);
      setSavedFlash(true);
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
      const conflict = err instanceof Error && err.name === 'VaultConflictError';
      setError(
        conflict
          ? t('saveConflict')
          : err instanceof Error
            ? err.message
            : t('saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  }, [content, dirty, doc.slug, onSave, saving, t]);

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
      clearEditorDraft(doc.slug);
      setDraftSavedAt(null);
    }
    onClose();
  }, [dirty, doc.slug, onClose, saving, t]);

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
        const draft = readEditorDraft(doc.slug);
        const shouldRestoreDraft =
          draft !== null && draft.content !== text;
        setContent(shouldRestoreDraft ? draft.content : text);
        setSavedContent(text);
        setLoadedSlug(doc.slug);
        setDebounced(shouldRestoreDraft ? draft.content : text);
        setError(null);
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
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [doc.slug, getDocContent]);

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
      clearEditorDraft(doc.slug);
      if (draftSavedAt !== null) {
        window.queueMicrotask(() => setDraftSavedAt(null));
      }
      return;
    }
    const handle = window.setTimeout(() => {
      const updatedAt = Date.now();
      writeEditorDraft({
        slug: doc.slug,
        content,
        diskContent: savedContent,
        updatedAt,
      });
      setDraftSavedAt(updatedAt);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [content, dirty, doc.slug, draftSavedAt, loadedSlug, savedContent]);

  // Cmd+S / Ctrl+S 저장, Cmd+B/I/K 포맷 단축키.
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
        <div className="text-[13px] text-[color:var(--color-text-tertiary)]">
          {t('loadFailed')}
        </div>
        <div className="font-mono text-[11px] text-[color:var(--color-text-quaternary)]">
          {error}
        </div>
        <button
          type="button"
          onClick={requestClose}
          className="mt-2 rounded-sm border border-[color:var(--color-divider)] px-2 py-1 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.3)] hover:text-[color:var(--color-text-primary)]"
        >
          {t('close')}
        </button>
      </div>
    );
  }
  if (loading || content === null) {
    return (
      <div className="flex flex-col gap-3 p-8" role="status" aria-label={t('loadingLabel')}>
        <div className="h-3 w-2/3 animate-pulse rounded bg-[color:var(--color-border-soft)]" aria-hidden />
        <div className="h-3 w-5/6 animate-pulse rounded bg-[color:var(--color-overlay-2)]" aria-hidden />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[color:var(--color-overlay-2)]" aria-hidden />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      {/* 상단 액션 바 */}
      <div className="flex flex-none items-center gap-2 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-4 py-2 text-[11.5px]">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {t('editorEyebrow', { slug: doc.slug })}
        </span>
        <span
          className={
            saveState.tone === 'dirty'
              ? "inline-flex items-center gap-1.5 rounded-sm border border-[color:rgba(232,200,148,0.25)] bg-[color:rgba(232,200,148,0.08)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:rgba(232,200,148,0.95)]"
              : saveState.tone === 'saved'
                ? "inline-flex items-center gap-1.5 rounded-sm border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:rgba(139,151,255,0.95)]"
                : "inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)]"
          }
          aria-live="polite"
        >
          {saveState.tone === 'saved' ? <Check size={11} aria-hidden /> : null}
          <span>{saveState.label}</span>
          <span className="hidden normal-case tracking-normal text-[color:var(--color-text-quaternary)] sm:inline">
            {saveState.body}
          </span>
        </span>
        <span
          className="hidden min-w-0 items-center gap-1.5 rounded-sm border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] lg:inline-flex"
          aria-label={t('saveContractAriaLabel')}
        >
          <Check size={11} className="text-[color:var(--color-text-quaternary)]" aria-hidden />
          <span className="font-mono uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
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
            size={11}
            className={
              dirty
                ? 'text-[color:rgba(232,200,148,0.95)]'
                : 'text-[color:var(--color-text-quaternary)]'
            }
            aria-hidden
          />
          <span className="font-mono uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {t('diskContract')}
          </span>
          <span
            className={`truncate ${
              dirty
                ? 'font-medium text-[color:rgba(232,200,148,0.95)]'
                : 'text-[color:var(--color-text-tertiary)]'
            }`}
          >
            {dirty ? t('diskContractNeedsSave') : t('diskContractClean')}
          </span>
        </span>
        <span
          className="hidden min-w-0 items-center gap-1.5 rounded-sm border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] 2xl:inline-flex"
          aria-label={t('saveWorkflowAriaLabel')}
        >
          <CheckSquare
            size={11}
            className={
              dirty
                ? 'text-[color:rgba(232,200,148,0.95)]'
                : 'text-[color:var(--color-text-quaternary)]'
            }
            aria-hidden
          />
          <span className="font-mono uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {t('validateContract')}
          </span>
          <span
            className={`truncate ${
              dirty
                ? 'font-medium text-[color:rgba(232,200,148,0.95)]'
                : 'text-[color:var(--color-text-tertiary)]'
            }`}
          >
            {dirty ? t('validateContractDirty') : t('validateContractClean')}
          </span>
          <span className="text-[color:var(--color-text-quaternary)]" aria-hidden>
            ·
          </span>
          <X
            size={11}
            className={
              dirty
                ? 'text-[color:rgba(232,200,148,0.95)]'
                : 'text-[color:var(--color-text-quaternary)]'
            }
            aria-hidden
          />
          <span className="font-mono uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {t('revertContract')}
          </span>
          <span className="truncate">
            {dirty ? t('revertContractDirty') : t('revertContractClean')}
          </span>
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] transition-colors ${
              preview
                ? 'border-[color:rgba(139,151,255,0.45)] bg-[color:rgba(94,106,210,0.08)] text-[color:rgba(200,210,255,0.92)]'
                : 'border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)] hover:border-[color:rgba(139,151,255,0.3)] hover:text-[color:var(--color-text-primary)]'
            }`}
            aria-pressed={preview}
            title={t('previewTooltip')}
          >
            {preview ? (
              <EyeOff size={11} aria-hidden />
            ) : (
              <Eye size={11} aria-hidden />
            )}
            {t('preview')}
          </button>
          <button
            type="button"
            onClick={() => void doSave()}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[color:rgba(139,151,255,0.35)] bg-[color:rgba(94,106,210,0.14)] px-2 py-1 text-[11px] text-[color:rgba(200,210,255,0.95)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] disabled:cursor-not-allowed disabled:opacity-50"
            title={t('saveTooltip')}
          >
            {saving ? (
              <>
                <Loader2 size={11} className="animate-spin" aria-hidden />
                {t('saving')}
              </>
            ) : (
              <>
                <Save size={11} aria-hidden />
                {t('save')}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-sm border border-transparent px-2 py-1 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-overlay-3)] hover:text-[color:var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            title={dirty ? t('closeUnsavedTooltip') : t('closeTooltip')}
          >
            <X size={11} aria-hidden />
            {dirty ? t('cancel') : t('closeAction')}
          </button>
        </div>
      </div>
      {error ? (
        <div
          className="break-keep border-b border-[color:rgba(220,120,120,0.3)] bg-[color:rgba(220,120,120,0.08)] px-4 py-1.5 text-[11px] leading-4 text-[color:rgba(240,180,180,0.95)]"
          aria-live="polite"
        >
          {error}
        </div>
      ) : null}
      {/* 포맷 툴바 */}
      <div className="flex flex-none items-center gap-0.5 border-b border-[color:var(--color-overlay-2)] bg-[color:var(--color-elevated)] px-3 py-1 text-[color:var(--color-text-tertiary)]">
        <ToolbarButton
          icon={<Bold size={12} />}
          label={t('tbBold')}
          onClick={() => wrapSelection('**')}
        />
        <ToolbarButton
          icon={<Italic size={12} />}
          label={t('tbItalic')}
          onClick={() => wrapSelection('*')}
        />
        <ToolbarButton
          icon={<CodeIcon size={12} />}
          label={t('tbCode')}
          onClick={() => wrapSelection('`')}
        />
        <span className="mx-1 h-4 w-px bg-[color:var(--color-divider)]" />
        <ToolbarButton
          icon={<Heading1 size={12} />}
          label={t('tbH1')}
          onClick={() => prefixLine('# ')}
        />
        <ToolbarButton
          icon={<Heading2 size={12} />}
          label={t('tbH2')}
          onClick={() => prefixLine('## ')}
        />
        <ToolbarButton
          icon={<Heading3 size={12} />}
          label={t('tbH3')}
          onClick={() => prefixLine('### ')}
        />
        <span className="mx-1 h-4 w-px bg-[color:var(--color-divider)]" />
        <ToolbarButton
          icon={<List size={12} />}
          label={t('tbBullet')}
          onClick={() => prefixLine('- ')}
        />
        <ToolbarButton
          icon={<ListOrdered size={12} />}
          label={t('tbNumbered')}
          onClick={() => prefixLine('1. ')}
        />
        <ToolbarButton
          icon={<CheckSquare size={12} />}
          label={t('tbCheckbox')}
          onClick={() => prefixLine('- [ ] ')}
        />
        <ToolbarButton
          icon={<Quote size={12} />}
          label={t('tbQuote')}
          onClick={() => prefixLine('> ')}
        />
        <span className="mx-1 h-4 w-px bg-[color:var(--color-divider)]" />
        <ToolbarButton
          icon={<LinkIcon size={12} />}
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
                const match = detectWikilinkTrigger(next, caret);
                setAutocomplete(
                  match ? { ...match, active: 0 } : null,
                );
              }
            }}
            onKeyDown={(e) => {
              if (!autocomplete || acMatches.length === 0) return;
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
                applyWikilink(pick.slug);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setAutocomplete(null);
              }
            }}
            onKeyUp={(e) => {
              // 방향키만 눌려도 caret 위치 업데이트 → 재감지
              if (!allDocs || !taRef.current) return;
              const caret = taRef.current.selectionStart;
              const src = (e.target as HTMLTextAreaElement).value;
              const match = detectWikilinkTrigger(src, caret);
              setAutocomplete((cur) => {
                if (!match) return null;
                if (cur && cur.start === match.start && cur.query === match.query)
                  return cur;
                return { ...match, active: 0 };
              });
            }}
            spellCheck={false}
            className="absolute inset-0 resize-none bg-[color:rgba(12,14,20,0.4)] px-6 py-6 font-mono text-[13px] leading-[1.7] text-[color:rgba(220,226,240,0.92)] outline-none md:px-10"
          />
          {autocomplete && acMatches.length > 0 ? (
            <div className="pointer-events-auto absolute bottom-3 left-3 z-10 w-[320px] overflow-hidden rounded-md border border-[color:rgba(139,151,255,0.3)] bg-[color:rgba(12,14,20,0.98)] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
              <div className="border-b border-[color:var(--color-overlay-2)] px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                {t('wikilinkLabel', { query: autocomplete.query })}
              </div>
              <ul className="max-h-[220px] overflow-auto py-0.5">
                {acMatches.map((d, idx) => (
                  <li key={d.slug}>
                    <button
                      type="button"
                      onMouseEnter={() =>
                        setAutocomplete((ac) =>
                          ac ? { ...ac, active: idx } : ac,
                        )
                      }
                      onClick={() => applyWikilink(d.slug)}
                      className={`flex w-full items-center gap-2 px-2 py-1 text-left transition-colors ${
                        idx === autocomplete.active
                          ? 'bg-[color:rgba(94,106,210,0.14)]'
                          : 'hover:bg-[color:var(--color-overlay-1)]'
                      }`}
                    >
                      <span className="truncate text-[12px] text-[color:var(--color-text-primary)]">
                        {d.title}
                      </span>
                      <span className="ml-auto truncate font-mono text-[9.5px] text-[color:var(--color-text-quaternary)]">
                        {d.slug}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-[color:var(--color-overlay-2)] px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                {t('wikilinkFooter')}
              </div>
            </div>
          ) : null}
        </div>
        {preview ? (
          <div className="min-h-0 w-1/2 overflow-auto bg-[color:rgba(12,14,20,0.2)]">
            <article className="mx-auto max-w-[720px] px-6 py-6 md:px-8">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: (props) => (
                    <h1
                      className="mt-0 mb-4 text-[22px] font-semibold text-[color:var(--color-text-primary)]"
                      {...props}
                    />
                  ),
                  h2: (props) => (
                    <h2
                      className="mt-8 mb-2 text-[16px] font-semibold text-[color:var(--color-text-primary)]"
                      {...props}
                    />
                  ),
                  h3: (props) => (
                    <h3
                      className="mt-6 mb-2 text-[14px] font-semibold text-[color:var(--color-text-primary)]"
                      {...props}
                    />
                  ),
                  p: (props) => (
                    <p
                      className="my-3 text-[13px] leading-[1.65] text-[color:var(--color-text-secondary)]"
                      {...props}
                    />
                  ),
                  ul: (props) => (
                    <ul
                      className="my-3 list-disc pl-6 text-[13px] leading-[1.7] text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
                      {...props}
                    />
                  ),
                  ol: (props) => (
                    <ol
                      className="my-3 list-decimal pl-6 text-[13px] leading-[1.7] text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
                      {...props}
                    />
                  ),
                  code: ({ className, children, ...rest }) => {
                    const isBlock = /language-/.test(className ?? '');
                    if (!isBlock) {
                      return (
                        <code
                          className="rounded-sm bg-[color:rgba(139,151,255,0.08)] px-1 py-0.5 font-mono text-[11.5px] text-[color:rgba(200,210,255,0.95)]"
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
                      className="my-3 overflow-x-auto rounded-md border border-[color:var(--color-overlay-2)] bg-[color:rgba(12,14,20,0.8)] p-3 font-mono text-[12px] text-[color:rgba(200,210,255,0.92)]"
                      {...props}
                    />
                  ),
                  blockquote: (props) => (
                    <blockquote
                      className="my-3 border-l-2 border-[color:rgba(139,151,255,0.35)] pl-3 italic text-[color:var(--color-text-tertiary)]"
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
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-sm transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
    >
      {icon}
    </button>
  );
}
