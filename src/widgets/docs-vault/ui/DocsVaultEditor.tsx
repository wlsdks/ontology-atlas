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
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';
import { useHeldValue } from '@/shared/lib/use-presence';
import { caretPoint, clampMenuToBox } from '../lib/caret-position';
import {
  detectMentionTrigger,
  insertMentionRelation,
  MENTION_RELATIONS,
  RELATION_LABEL_KEY,
  type MentionRelationId,
} from '../lib/mention-relation';
import { Chip, IconButton, RowButton, Surface } from '@/shared/ui';

interface Props {
  doc: VaultDoc;
  /** md 원본 취득 — 뷰어와 동일한 resolver. 로컬 볼트는 fileHandle 로 읽기. */
  getDocContent: (slug: string) => Promise<string>;
  /** 저장 시 호출. expectedMtime은 이 편집기가 원문을 읽은 시점의 값. 실패 시 throw. */
  onSave: (
    slug: string,
    content: string,
    expectedMtime?: number,
  ) => Promise<void>;
  /** 편집 종료 (저장 성공 후 또는 취소). */
  onClose: () => void;
  /** vault 의 모든 문서 (wikilink 자동완성용). 없으면 autocomplete off. */
  allDocs?: VaultDoc[];
  /**
   * 이 초안이 **어느 볼트의 것인가** — 슬러그만으로는 폴더가 달라도 같은 키가
   * 되어 서로의 초안을 덮는다(위 `draftStorageKey` 주석의 데이터 손실 경로).
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

/** 멘션 메뉴의 폭과 최대 높이 — 자리 계산과 실제 그리기가 같은 값을 쓴다. */
const MENTION_MENU_WIDTH = 320;
const MENTION_MENU_MAX_HEIGHT = 280;

const DRAFT_STORAGE_PREFIX = 'ontology-atlas:docs-vault-editor-draft:';

/**
 * 초안 키는 **볼트까지 담는다** (2026-08-01 수리).
 *
 * 종전엔 슬러그만이었다(`…:README`). 그래서 **다른 폴더의 같은 이름 파일이
 * 서로의 초안을 덮었다** — 폴더 A 의 `README.md` 를 편집하려고 열면 폴더 B 의
 * 본문이 「임시저장됨 · 최종 저장 필요」라는 딱지를 달고 나타났다. 사용자가 쓴
 * 적 없는 글이 사용자의 미저장 변경으로 제시된 것이다.
 *
 * 더 나쁜 것은 그 다음이다: 두 파일이 그 시점에 **바이트가 같으면**(README ·
 * 스캐폴드된 온톨로지 문서라면 흔하다) 충돌 분기가 안 걸리고 mtime 가드도
 * 통과해서, **저장이 폴더 A 의 초안을 폴더 B 의 파일 위에 쓴다.** 데이터 손실
 * 경로다.
 *
 * ⚠️ 옛 키(`…:<slug>`)로는 **되읽지 않는다.** 되읽는 것이 바로 이 결함이고,
 * 그 초안이 어느 볼트 것인지 알 방법이 없다. 남은 옛 키는 아무도 안 읽으므로
 * 무해하고, 사용자가 같은 문서를 다시 편집하면 새 키로 덮인다.
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
  vaultScope,
}: Props) {
  const t = useTranslations('vaultWidgets.editor');
  const locale = useLocale();
  // 관계 어휘는 공방이 소유한다 — 두 화면이 같은 일에 다른 말을 쓰지 않게
  // 여기서 새 문구를 만들지 않고 그 네임스페이스를 그대로 읽는다.
  const tStudio = useTranslations('ontologyStudio');
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
  // 외부 poll이 doc.mtime을 갱신해도 미저장 편집의 쓰기 기준은 최초로 읽은
  // 디스크 버전이어야 한다. 최신 prop을 그대로 넘기면 conflict guard가
  // 최신값끼리 비교해 외부 변경을 조용히 덮어쓴다.
  const loadedMtimeRef = useRef<number | undefined>(doc.mtime);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wikilink autocomplete 상태. open 이 null 이 아닐 때 popover 표시.
  const [autocomplete, setAutocomplete] = useState<{
    query: string;
    start: number;
    active: number;
  } | null>(null);

  /*
   * 트리거는 `@` 다 — 종전 `[[` 를 2026-08-08 에 갈아치웠다.
   *
   * 두 가지가 바뀌었다. 표기(`[[` → `@`)는 겉이고, **고른 뒤에 무엇이 쓰이나**가
   * 속이다. 종전엔 본문에 `[[slug]]` 를 넣었는데 **그건 그래프를 1비트도 바꾸지
   * 않았다**(같은 볼트에서 넣었다 뺀 컴파일 결과가 엣지 9 · 해시 동일). 지금은
   * 관계 종류를 묻고 **frontmatter 에 적는다** — 판정 로직은 `lib/mention-relation`
   * 의 순수 함수가 갖고, 여기는 화면만 맡는다.
   *
   * `[[` 를 남겨 두지 않는다. 두 문법이 공존하면 사용자는 「어느 쪽이 진짜
   * 연결인가」를 매번 판단해야 하고, 그 판단은 화면에 단서가 없다.
   */

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

  /**
   * 자동완성의 **열림**과 **내용**을 가른다 — 그래야 퇴장이 성립한다.
   *
   * ★ `useHeldValue` 에 **키**를 넘긴다. 이 모델은 매 렌더 새로 만들어지는
   * 객체라, 키 없이 넘기면 정체성 비교가 끝없이 돌아 React #301 이 난다
   * (엣지 패널이 실제로 그렇게 지도를 죽였다). 질의어와 커서 위치가 바뀔
   * 때만 새 값으로 친다.
   */
  const acOpen = autocomplete !== null && acMatches.length > 0;
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
  /**
   * 고른 개념 — 아직 **관계를 안 정했다.** 이 단계가 존재하는 것이 이 기능의
   * 전부다: 이름만 넣고 끝내면 종전 위키링크와 같아지고, 그건 그래프에 안 잡힌다.
   */
  const [pendingMention, setPendingMention] = useState<{
    doc: VaultDoc;
    trigger: { query: string; start: number };
  } | null>(null);
  /** 2단계에서 지금 고른 방위 — 키보드 이동의 커서. */
  const [pendingRelation, setPendingRelation] = useState<MentionRelationId>(
    MENTION_RELATIONS[0].id,
  );

  /**
   * 관계가 적혔다는 것을 **말한다.** 이 동작의 결과는 frontmatter 안이라
   * 아무 말도 안 하면 본문에 이름만 들어간 것처럼 보인다 — 그러면 사용자는
   * 종전 위키링크와 같은 일이 일어났다고 읽는다.
   */
  const [mentionNotice, setMentionNotice] = useState<'added' | 'exists' | null>(null);
  useEffect(() => {
    if (!mentionNotice) return;
    const timer = setTimeout(() => setMentionNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [mentionNotice]);

  /**
   * 메뉴가 설 자리 — **적던 그 자리**. 종전엔 편집기 왼쪽 아래 구석에
   * 고정이었다(위키링크 팝오버에서 물려받은 자리). 멘션 메뉴는 지금 치고
   * 있는 글자의 연장이라, 눈에서 멀면 「방금 내가 한 행동의 결과」로 안
   * 읽힌다 — 소유자 지적 2026-08-08.
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
        // 메뉴 실제 크기는 그린 뒤에야 알지만, 자리를 정하는 데는 상한이면
        // 충분하다 — 실제가 더 작으면 여유가 남을 뿐 잘리지 않는다.
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
      const { doc, trigger } = pendingMention;
      const result = insertMentionRelation({
        content,
        trigger,
        target: {
          slug: doc.slug,
          title: resolveLocaleDisplayName(doc.frontmatter, locale, doc.title),
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
    [content, locale, pendingMention],
  );


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

  // 정상 저장 뒤 parent manifest가 새 mtime으로 갱신되면 다음 편집의 기준도
  // 전진시킨다. dirty 동안의 외부 mtime 변화는 절대 흡수하지 않는다.
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
      {/* 상단 액션 바 */}
      <div className="flex flex-none items-center gap-2 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-4 py-2 text-label">
        <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {t('editorEyebrow', { slug: doc.slug })}
        </span>
        {/* ⚠️ **이 줄의 상태 칩 셋은 한 규격이다** (2026-08-08 실측 수리).
            저장 상태 칩만 `text-caption`(9.5px) 이었고 옆의 「자동 백업 · 최종
            저장」·「검증 · 되돌리기」는 `text-label`(11px) 이었다 — 같은 줄에
            나란히 선 같은 종류의 칩인데 램프가 한 단 밀려 있었다(부모 줄 자체가
            `text-label` 이다). 2026-08-02 설정 시트에서 잡은 것과 같은 결함
            유형이고, 원인도 같다: 아무도 "이 칩만 작게" 라고 정하지 않았다.
            게이트: `tests/contract/editor-status-chip-dialect.contract.test.ts`. */}
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
      {/* 포맷 툴바 */}
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
               * 2단계(관계 고르기)도 **키보드로 끝까지 간다.** 1단계를 Enter 로
               * 고른 사람은 손이 이미 키보드에 있는데, 거기서 마우스를 요구하면
               * 그 흐름이 끊긴다 — 그리고 키보드만 쓰는 사람에게는 아예 막힌
               * 문이 된다. 포커스는 textarea 에 남아 있으므로 여기서 받는다.
               */
              if (pendingMention) {
                if (e.key === 'Escape') {
                  e.preventDefault();
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
                pickMentionTarget(pick);
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
              // 편집기 왼쪽 아래에 매달려 위로 자란다 — 등장 원점도 그 모서리.
              origin="bottom left"
              /*
                이 저장소의 메뉴 방언을 쓴다 — 볼트 칩·정렬 메뉴와 같은
                `--chrome-radius-inner` · `border-soft` · `elevated` ·
                `--chrome-shadow`. 종전엔 인디고 테두리 + `surface-deep` +
                `elevation-2` 라 이 화면에서 **이 메뉴만 다른 물건**처럼
                보였다(소유자 지적 2026-08-08).
              */
              className="pointer-events-auto absolute z-10 overflow-hidden rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] shadow-[var(--chrome-shadow)]"
              style={{
                width: MENTION_MENU_WIDTH,
                top: menuAt?.top ?? 0,
                left: menuAt?.left ?? 0,
              }}
            >
              <div className="border-b border-[color:var(--color-border-soft)] px-2 py-1.5 text-label text-[color:var(--color-text-tertiary)]">
                {/* 질의어가 비면 `· ""` 라는 빈 따옴표가 화면에 남았다(실기기 확인). */}
                {t('mentionLabel', {
                  query: heldAutocomplete.query ? ` · “${heldAutocomplete.query}”` : '',
                })}
              </div>
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
                      <span className="truncate text-body text-[color:var(--color-text-primary)]">
                        {d.title}
                      </span>
                      <span className="ml-auto truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                        {d.slug}
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
            2단계 — **관계를 고르는 자리.** 이 단계가 이 기능의 전부다.
            여기서 이름만 넣고 끝내면 종전 위키링크와 같아지고, 그건 지도에도
            경로 찾기에도 안 잡힌다(실측: 넣었다 뺀 컴파일 결과가 동일).
            어휘는 공방의 나침반과 같은 것을 쓴다 — 같은 일에 다른 말을 쓰면
            사용자가 두 기능으로 배운다.
          */}
          {/*
            관계는 frontmatter 안에 적히므로 **말하지 않으면 안 보인다.**
            침묵하면 사용자는 본문에 이름만 들어간 것으로 읽고, 그건 정확히
            우리가 없앤 종전 위키링크의 인상이다. 보조기술에도 같이 간다.
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
                이 저장소의 메뉴 방언을 쓴다 — 볼트 칩·정렬 메뉴와 같은
                `--chrome-radius-inner` · `border-soft` · `elevated` ·
                `--chrome-shadow`. 종전엔 인디고 테두리 + `surface-deep` +
                `elevation-2` 라 이 화면에서 **이 메뉴만 다른 물건**처럼
                보였다(소유자 지적 2026-08-08).
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
                        {tStudio(`relationShort.${RELATION_LABEL_KEY[relation.id]}`)}
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
