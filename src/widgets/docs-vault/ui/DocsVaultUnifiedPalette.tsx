'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  Clock,
  FileText,
  Hash,
  Pin,
  Search,
  Terminal,
  X,
} from 'lucide-react';
import { buildDocsVaultHref, type VaultDoc } from '@/entities/docs-vault';
import { searchDocs, type DocsSearchMatch } from '../lib/search';
import type { VaultCommand } from '../model/command';

interface Props {
  onClose: () => void;
  docs: VaultDoc[];
  recentSlugs: string[];
  pinnedSlugs: string[];
  commands: VaultCommand[];
  tagCounts: Array<{ tag: string; count: number }>;
  /** 문서 선택 핸들러. 두 번째 인자 query 는 매치어 하이라이트 용도. */
  onDocSelect: (slug: string, query?: string) => void;
  /** 태그 선택 핸들러 — 트리 필터에 즉시 반영. */
  onTagSelect: (tag: string) => void;
  /** 초기 쿼리 — `> ` (명령) / `#` (태그) / '' (기본). */
  initialQuery?: string;
  getDocHref?: (slug: string) => string;
}

// combobox aria-activedescendant 가 가리킬 option id — listbox 옵션 li 와
// 입력의 active descendant 를 같은 규칙으로 묶어 스크린리더가 방향키 이동 시
// 활성 항목을 읽게 한다 (WAI-ARIA combobox 패턴).
const PALETTE_LISTBOX_ID = 'docs-vault-palette-listbox';
const paletteOptionId = (idx: number) => `docs-vault-palette-option-${idx}`;

type ResultKind = 'doc' | 'command' | 'tag';

interface PaletteRow {
  kind: ResultKind;
  key: string;
  label: React.ReactNode;
  hint?: string;
  /** 오른쪽에 표시할 보조 텍스트. 단축키·slug·count. */
  meta?: string;
  icon: React.ReactNode;
  onRun: () => void;
}

function Highlight({
  text,
  hit,
}: {
  text: string;
  hit: { start: number; end: number } | null;
}) {
  if (!hit) return <>{text}</>;
  return (
    <>
      {text.slice(0, hit.start)}
      <mark className="rounded-sm bg-[color:rgba(139,151,255,0.22)] px-0.5 text-[color:rgba(210,218,255,0.98)]">
        {text.slice(hit.start, hit.end)}
      </mark>
      {text.slice(hit.end)}
    </>
  );
}

/**
 * 통합 팔레트 — VSCode/Spotlight 관례 + Obsidian 의 multi-section.
 *
 *  - 빈 쿼리: 고정 → 최근 → 추천 명령 순 세 섹션
 *  - `>` 시작: 명령 퍼지 매칭
 *  - `#` 시작: 태그 매칭
 *  - 일반 쿼리: 문서 title/slug/tags/excerpt 혼합 검색 (+ 명령 적합 매치
 *    섞기)
 *
 * 기존 SearchPalette (전문) / QuickSwitcher (제목) / CommandPalette
 * (명령) 세 개를 이 하나로 대체.
 */
export function DocsVaultUnifiedPalette({
  onClose,
  docs,
  recentSlugs,
  pinnedSlugs,
  commands,
  tagCounts,
  onDocSelect,
  onTagSelect,
  initialQuery = '',
  getDocHref = (slug) => buildDocsVaultHref({ slug }),
}: Props) {
  const t = useTranslations('vaultWidgets.palette');
  const [query, setQuery] = useState(initialQuery);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const bySlug = useMemo(() => {
    const m = new Map<string, VaultDoc>();
    for (const d of docs) m.set(d.slug, d);
    return m;
  }, [docs]);

  // mount 시 input focus + caret 을 prefix 뒤로 + unmount 에 trigger 로 focus 복원.
  // 다른 modal (SearchPalette / ProjectDrawer / DocsQuickDrawer / ShortcutSheet)
  // 와 동일한 a11y 패턴 — 키보드 사용자가 ⌘K 로 열고 Esc 로 닫을 때 원래
  // 작업하던 element 로 돌아가도록.
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const handle = requestAnimationFrame(() => {
      inputRef.current?.focus();
      // `> ` prefix 주입 시 caret 을 prefix 뒤로 배치
      const ql = initialQuery.length;
      inputRef.current?.setSelectionRange(ql, ql);
    });
    return () => {
      cancelAnimationFrame(handle);
      previousFocusRef.current?.focus?.();
    };
  }, [initialQuery]);

  // activeIdx 이 변경되면 리스트 스크롤 따라가기
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // ─ 결과 빌드 ─────────────────────────────────────────────────────────
  const { rows, sections } = useMemo(() => {
    const trimmed = query.trim();
    const mode: 'commands' | 'tags' | 'mixed' | 'empty' =
      trimmed.startsWith('>')
        ? 'commands'
        : trimmed.startsWith('#')
          ? 'tags'
          : trimmed === ''
            ? 'empty'
            : 'mixed';

    const out: PaletteRow[] = [];
    const sections: Array<{ title: string; icon: React.ReactNode; size: number }> = [];

    if (mode === 'empty') {
      // 고정
      const pinnedRows: PaletteRow[] = [];
      for (const slug of pinnedSlugs) {
        const d = bySlug.get(slug);
        if (!d) continue;
        pinnedRows.push({
          kind: 'doc',
          key: `pin:${slug}`,
          label: d.title,
          icon: (
            <Pin
              size={11}
              className="text-[color:rgba(224,196,140,0.85)]"
              aria-hidden
              fill="currentColor"
            />
          ),
          meta: slug,
          onRun: () => onDocSelect(slug),
        });
      }
      if (pinnedRows.length > 0) {
        sections.push({ title: t('secPinned'), icon: <Pin size={10} aria-hidden />, size: pinnedRows.length });
        out.push(...pinnedRows);
      }
      // 최근
      const recentRows: PaletteRow[] = [];
      for (const slug of recentSlugs) {
        if (pinnedSlugs.includes(slug)) continue;
        const d = bySlug.get(slug);
        if (!d) continue;
        recentRows.push({
          kind: 'doc',
          key: `rec:${slug}`,
          label: d.title,
          icon: (
            <Clock
              size={11}
              className="text-[color:var(--color-text-quaternary)]"
              aria-hidden
            />
          ),
          meta: slug,
          onRun: () => onDocSelect(slug),
        });
      }
      if (recentRows.length > 0) {
        sections.push({ title: t('secRecent'), icon: <Clock size={10} aria-hidden />, size: recentRows.length });
        out.push(...recentRows);
      }
      // 추천 명령 (top 5 visible)
      const cmdRows: PaletteRow[] = commands
        .filter((c) => c.visible !== false)
        .slice(0, 5)
        .map((c) => ({
          kind: 'command' as const,
          key: `cmd:${c.id}`,
          label: c.label,
          icon: (
            <span
              aria-hidden
              className="flex h-4 w-4 items-center justify-center"
            >
              {c.icon}
            </span>
          ),
          meta: c.shortcut,
          onRun: () => void c.onRun(),
        }));
      if (cmdRows.length > 0) {
        sections.push({
          title: t('secCommonCommands'),
          icon: <Terminal size={10} aria-hidden />,
          size: cmdRows.length,
        });
        out.push(...cmdRows);
      }
      return { rows: out, sections };
    }

    if (mode === 'commands') {
      const q = trimmed.slice(1).trim().toLowerCase();
      const cmdRows: PaletteRow[] = commands
        .filter((c) => c.visible !== false)
        .filter((c) => !q || c.label.toLowerCase().includes(q))
        .slice(0, 30)
        .map((c) => {
          const idx = q ? c.label.toLowerCase().indexOf(q) : -1;
          const hit = idx >= 0 ? { start: idx, end: idx + q.length } : null;
          return {
            kind: 'command' as const,
            key: `cmd:${c.id}`,
            label: <Highlight text={c.label} hit={hit} />,
            icon: (
              <span
                aria-hidden
                className="flex h-4 w-4 items-center justify-center"
              >
                {c.icon}
              </span>
            ),
            meta: c.shortcut,
            onRun: () => void c.onRun(),
          };
        });
      if (cmdRows.length > 0) {
        sections.push({
          title: t('secCommands'),
          icon: <Terminal size={10} aria-hidden />,
          size: cmdRows.length,
        });
        out.push(...cmdRows);
      }
      return { rows: out, sections };
    }

    if (mode === 'tags') {
      const q = trimmed.slice(1).trim().toLowerCase();
      const tagRows: PaletteRow[] = tagCounts
        .filter((tagItem) => !q || tagItem.tag.toLowerCase().includes(q))
        .slice(0, 20)
        .map((tagItem) => {
          const idx = q ? tagItem.tag.toLowerCase().indexOf(q) : -1;
          const hit = idx >= 0 ? { start: idx, end: idx + q.length } : null;
          return {
            kind: 'tag' as const,
            key: `tag:${tagItem.tag}`,
            label: <Highlight text={`#${tagItem.tag}`} hit={hit ? { start: hit.start + 1, end: hit.end + 1 } : null} />,
            icon: (
              <Hash
                size={11}
                className="text-[color:var(--color-text-quaternary)]"
                aria-hidden
              />
            ),
            meta: t('tagMeta', { count: tagItem.count }),
            onRun: () => onTagSelect(tagItem.tag),
          };
        });
      if (tagRows.length > 0) {
        sections.push({
          title: t('secTags'),
          icon: <Hash size={10} aria-hidden />,
          size: tagRows.length,
        });
        out.push(...tagRows);
      }
      return { rows: out, sections };
    }

    // mixed 모드 — 문서 먼저, 명령 보조로
    const docMatches: DocsSearchMatch[] = searchDocs(trimmed, docs, 15);
    const docRows: PaletteRow[] = docMatches.map((m) => ({
      kind: 'doc' as const,
      key: `doc:${m.doc.slug}`,
      label: <Highlight text={m.doc.title} hit={m.titleHit} />,
      icon: (
        <FileText
          size={11}
          className="text-[color:var(--color-text-quaternary)]"
          aria-hidden
        />
      ),
      meta: m.doc.slug,
      onRun: () => onDocSelect(m.doc.slug, trimmed),
    }));
    if (docRows.length > 0) {
      sections.push({
        title: t('secDocs'),
        icon: <FileText size={10} aria-hidden />,
        size: docRows.length,
      });
      out.push(...docRows);
    }
    // 명령도 부분 매치 있으면 뒤에 보여주기 (최대 5)
    const qLc = trimmed.toLowerCase();
    const cmdMatches = commands
      .filter((c) => c.visible !== false)
      .filter((c) => c.label.toLowerCase().includes(qLc))
      .slice(0, 5);
    if (cmdMatches.length > 0) {
      sections.push({
        title: t('secCommands'),
        icon: <Terminal size={10} aria-hidden />,
        size: cmdMatches.length,
      });
      out.push(
        ...cmdMatches.map((c) => {
          const idx = c.label.toLowerCase().indexOf(qLc);
          const hit = idx >= 0 ? { start: idx, end: idx + qLc.length } : null;
          return {
            kind: 'command' as const,
            key: `cmd:${c.id}`,
            label: <Highlight text={c.label} hit={hit} />,
            icon: (
              <span
                aria-hidden
                className="flex h-4 w-4 items-center justify-center"
              >
                {c.icon}
              </span>
            ),
            meta: c.shortcut,
            onRun: () => void c.onRun(),
          };
        }),
      );
    }
    return { rows: out, sections };
  }, [
    query,
    commands,
    docs,
    bySlug,
    pinnedSlugs,
    recentSlugs,
    tagCounts,
    onDocSelect,
    onTagSelect,
    t,
  ]);

  // 섹션 별 시작 인덱스 계산 — 렌더 시 헤더를 어디에 끼울지.
  const sectionOffsets = useMemo(() => {
    const offsets = new Map<number, { title: string; icon: React.ReactNode }>();
    let offset = 0;
    for (const s of sections) {
      offsets.set(offset, { title: s.title, icon: s.icon });
      offset += s.size;
    }
    return offsets;
  }, [sections]);

  const handleQueryChange = (next: string) => {
    setQuery(next);
    setActiveIdx(0);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rows.length === 0) return;
      setActiveIdx((i) => (i + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length === 0) return;
      setActiveIdx((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[activeIdx];
      if (!row) return;
      row.onRun();
      onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      // Tab 으로 prefix 순환 전환 — '' → '>' → '#' → ''
      e.preventDefault();
      const t = query.trim();
      if (t.startsWith('>')) setQuery('#');
      else if (t.startsWith('#')) setQuery('');
      else setQuery('> ');
      setActiveIdx(0);
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) return;
        const len = input.value.length;
        input.setSelectionRange(len, len);
      });
    }
  };

  return (
    <motion.div
      key="unified-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-[color:rgba(0,0,0,0.5)] p-4 pt-[12vh]"
      onClick={onClose}
    >
      <motion.div
        key="unified-palette"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('dialogAriaLabel')}
        className="w-full max-w-[560px] overflow-hidden rounded-lg border border-[color:var(--color-divider)] bg-[color:rgba(12,14,20,0.98)] shadow-[0_20px_60px_rgba(0,0,0,0.4)]"
      >
        <div className="flex items-center gap-2 border-b border-[color:var(--color-overlay-2)] px-3 py-2">
          <Search
            size={14}
            className="text-[color:var(--color-text-quaternary)]"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('inputPlaceholder')}
            aria-label={t('inputAriaLabel')}
            role="combobox"
            aria-expanded
            aria-controls={PALETTE_LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              rows.length > 0 ? paletteOptionId(activeIdx) : undefined
            }
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeAriaLabel')}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            <X size={12} />
          </button>
        </div>
        <ul
          ref={listRef}
          id={PALETTE_LISTBOX_ID}
          className="max-h-[56vh] overflow-auto py-1"
          role="listbox"
        >
          {rows.length === 0 ? (
            <li className="px-3 py-8 text-center text-[12px] text-[color:var(--color-text-tertiary)]">
              {t('noMatches')}
            </li>
          ) : (
            rows.map((row, idx) => {
              const active = idx === activeIdx;
              const sectionHeader = sectionOffsets.get(idx);
              return (
                <Fragment key={row.key}>
                  {sectionHeader ? (
                    <li
                      key={`h-${sectionHeader.title}`}
                      className="mb-0.5 mt-1.5 flex items-center gap-1.5 px-3 pb-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]"
                    >
                      {sectionHeader.icon}
                      {sectionHeader.title}
                    </li>
                  ) : null}
                  <li
                    key={row.key}
                    id={paletteOptionId(idx)}
                    data-idx={idx}
                    role="option"
                    aria-selected={active}
                  >
                    <ResultRow
                      row={row}
                      active={active}
                      onHover={() => setActiveIdx(idx)}
                      onClose={onClose}
                      getDocHref={getDocHref}
                    />
                  </li>
                </Fragment>
              );
            })
          )}
        </ul>
        <div className="flex items-center gap-3 border-t border-[color:var(--color-overlay-2)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          <span>
            <kbd className="rounded border border-[color:var(--color-divider)] px-1">
              ↑↓
            </kbd>{' '}
            {t('footerMove')}
          </span>
          <span>
            <kbd className="rounded border border-[color:var(--color-divider)] px-1">
              ↵
            </kbd>{' '}
            {t('footerRun')}
          </span>
          <span>
            <kbd className="rounded border border-[color:var(--color-divider)] px-1">
              Tab
            </kbd>{' '}
            {t('footerSwitch')}
          </span>
          <span>
            <kbd className="rounded border border-[color:var(--color-divider)] px-1">
              Esc
            </kbd>{' '}
            {t('footerClose')}
          </span>
          <span className="ml-auto opacity-80">{t('footerLegend')}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ResultRow({
  row,
  active,
  onHover,
  onClose,
  getDocHref,
}: {
  row: PaletteRow;
  active: boolean;
  onHover: () => void;
  onClose: () => void;
  getDocHref: (slug: string) => string;
}) {
  const base = `group relative flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
    active
      ? 'bg-[color:rgba(94,106,210,0.14)]'
      : 'hover:bg-[color:var(--color-overlay-1)]'
  }`;
  const inner = (
    <>
      {active ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full bg-[color:var(--color-indigo-accent)]"
        />
      ) : null}
      <span className="flex h-5 w-5 flex-none items-center justify-center text-[color:var(--color-text-quaternary)]">
        {row.icon}
      </span>
      <span className="flex-1 truncate text-[13px] text-[color:var(--color-text-primary)]">
        {row.label}
      </span>
      {row.meta ? (
        <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
          {row.meta}
        </span>
      ) : null}
    </>
  );
  // 문서 행은 Link 로 render — 새탭 가능 + prefetch.
  if (row.kind === 'doc' && typeof row.meta === 'string') {
    return (
      <Link
        href={getDocHref(row.meta)}
        className={base}
        onMouseEnter={onHover}
        onClick={(e) => {
          // 수식어(⌘ click 등) 은 Link 기본 동작 (새 탭) 로 두고, 일반 클릭만
          // 내부 핸들러 실행해 팔레트 닫음.
          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          row.onRun();
          onClose();
        }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={() => {
        row.onRun();
        onClose();
      }}
      className={base}
    >
      {inner}
    </button>
  );
}
