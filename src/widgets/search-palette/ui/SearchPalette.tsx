'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Search, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBodyScrollLock } from '@/shared/lib/use-body-scroll-lock';
import type { Project } from '@/entities/project';
import { useTaxonomy } from '@/features/taxonomy';
import {
  buildDocsVaultHref,
  vaultManifest,
  type VaultDoc,
  type VaultManifest,
} from '@/entities/docs-vault';
import { searchProjects } from '../model/fuzzy-search';

// Docs Vault 매칭 — 가볍게 title/excerpt/slug includes. ⌘K 팔레트는
// 프로젝트 검색이 메인이고 문서는 보조 섹션이므로 score 정렬 없이 단순
// 매치 top 3 만 보여준다.
function matchVaultDocs(query: string, docs: VaultDoc[]): VaultDoc[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: VaultDoc[] = [];
  for (const d of docs) {
    if (
      d.title.toLowerCase().includes(q) ||
      d.slug.toLowerCase().includes(q) ||
      d.excerpt.toLowerCase().includes(q) ||
      d.tags.some((t) => t.toLowerCase().includes(q))
    ) {
      out.push(d);
      if (out.length >= 3) break;
    }
  }
  return out;
}

interface Props {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  onSelect: (slug: string) => void;
  /** 활성 컨테이너 이름. truthy 면 헤더에 "Project · {name}" 배지 노출. */
  containerLabel?: string | null;
}

const MATCH_FIELD_KEYS = {
  name: 'matchFieldName',
  nameEn: 'matchFieldNameEn',
  slug: 'matchFieldSlug',
  tags: 'matchFieldTags',
  stack: 'matchFieldStack',
  description: 'matchFieldDescription',
} as const;

const RECENT_SEARCH_KEY = 'demo:recent-search-slugs:v1';
const RECENT_MAX = 5;

function readRecentSlugs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecentSlug(slug: string) {
  if (typeof window === 'undefined') return;
  try {
    const current = readRecentSlugs().filter((s) => s !== slug);
    const next = [slug, ...current].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
  } catch {
    /* private mode — skip */
  }
}

/**
 * query 에 매칭되는 부분을 <mark> 로 감싸 하이라이트. 대소문자 무시, 첫 매치만.
 * 매치 없거나 query 비면 원문 반환.
 */
function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim().toLowerCase();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-[color:rgba(139,151,255,0.22)] px-0.5 text-[color:var(--color-text-primary)]">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/**
 * 외부에서 open을 토글받는 래퍼. 실제 다이얼로그는 open=true일 때만 mount
 * 하여 내부 state(query, activeIndex)가 매 열림마다 자동으로 초기화된다.
 */
export function SearchPalette({
  open,
  onClose,
  projects,
  onSelect,
  containerLabel,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <SearchPaletteDialog
          projects={projects}
          onClose={onClose}
          onSelect={onSelect}
          containerLabel={containerLabel}
        />
      )}
    </AnimatePresence>
  );
}

interface DialogProps {
  projects: Project[];
  onClose: () => void;
  onSelect: (slug: string) => void;
  containerLabel?: string | null;
}

type LayerFilter = 'all' | 'hub' | 'node';
type ProjectSearchResult = ReturnType<typeof searchProjects>[number];
type PaletteRow =
  | { kind: 'doc'; doc: VaultDoc }
  | { kind: 'project'; result: ProjectSearchResult };

const LAYER_FILTERS: { value: LayerFilter; labelKey: 'layerAll' | 'layerHub' | 'layerNode' }[] = [
  { value: 'all', labelKey: 'layerAll' },
  { value: 'hub', labelKey: 'layerHub' },
  { value: 'node', labelKey: 'layerNode' },
];

function matchesLayerFilter(project: Project, filter: LayerFilter): boolean {
  if (filter === 'all') return true;
  // R15 — isHub undefined 는 hub 아님으로 취급 (vault frontmatter 명시만 hub).
  const isHub = Boolean(project.isHub);
  if (filter === 'hub') return isHub;
  return !isHub;
}

function SearchPaletteDialog({
  projects,
  onClose,
  onSelect,
  containerLabel,
}: DialogProps) {
  const t = useTranslations('searchWidgets.projectSearch');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [layerFilter, setLayerFilter] = useState<LayerFilter>('all');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const { categoryLabel, statusLabel } = useTaxonomy();
  const [recentSlugs] = useState<string[]>(() => readRecentSlugs());
  const recentProjects = useMemo(
    () =>
      recentSlugs
        .map((slug) => projects.find((p) => p.slug === slug))
        .filter((p): p is Project => Boolean(p)),
    [recentSlugs, projects],
  );

  useBodyScrollLock(true);

  // 검색 대상을 layer filter 로 먼저 좁힌 뒤 query 매칭. filter='all'
  // 이면 모든 project. container/hub/node 선택 시 해당 계층만.
  const filteredProjects = useMemo(
    () => projects.filter((p) => matchesLayerFilter(p, layerFilter)),
    [projects, layerFilter],
  );
  const results = useMemo(() => {
    if (!query.trim()) {
      return filteredProjects
        .slice()
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 10)
        .map((p) => ({ project: p, score: 0, matchedField: 'name' as const }));
    }
    return searchProjects(filteredProjects, query).slice(0, 20);
  }, [filteredProjects, query]);

  // Vault 문서 매칭 — 쿼리 있을 때 top 3.
  const docResults = useMemo(() => {
    if (!query.trim()) return [];
    const manifest = vaultManifest as VaultManifest;
    return matchVaultDocs(query, manifest.docs);
  }, [query]);
  const rows = useMemo<PaletteRow[]>(
    () => [
      ...docResults.map((doc) => ({ kind: 'doc' as const, doc })),
      ...results.map((result) => ({ kind: 'project' as const, result })),
    ],
    [docResults, results],
  );
  const activeRow = rows[activeIndex] ?? null;

  // mount 직후 focus (input ref가 연결된 다음 프레임)
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const trapHandler = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', trapHandler);
    return () => {
      window.removeEventListener('keydown', trapHandler);
      previousFocusRef.current?.focus();
    };
  }, []);

  // 키보드 핸들링
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeRow?.kind === 'doc') {
          router.push(buildDocsVaultHref({ slug: activeRow.doc.slug }));
          onClose();
          return;
        }
        if (activeRow?.kind === 'project') {
          pushRecentSlug(activeRow.result.project.slug);
          onSelect(activeRow.result.project.slug);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeRow, rows.length, onClose, onSelect, router]);

  // query 변경 시 activeIndex 리셋 — onChange 핸들러에서 처리(effect 불필요)
  const handleQueryChange = (next: string) => {
    setQuery(next);
    setActiveIndex(0);
  };

  // active item이 보이도록 스크롤
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      data-interactive-overlay="true"
      className="fixed inset-0 z-50 flex items-stretch justify-center md:items-start md:px-[max(1rem,env(safe-area-inset-left))] md:pt-[max(4rem,env(safe-area-inset-top))] md:pr-[max(1rem,env(safe-area-inset-right))]"
    >
      <div
        data-testid="search-palette-backdrop"
        className="absolute inset-0 bg-[color:var(--color-backdrop-strong)]"
        onClick={onClose}
      />

      {/* 모바일은 풀스크린 시트 (rounded 없이 inset-0 가득 채움), md+ 는
          기존 floating 카드 (max-w-xl, rounded-[22px], 위에서 슬라이드).
          기존 spring transition 은 데스크톱 결을 유지. */}
      <motion.div
        ref={dialogRef}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-palette-title"
        aria-describedby="search-palette-help"
        className="relative flex h-full w-full flex-col overflow-hidden border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-2xl md:h-auto md:max-w-xl md:rounded-[22px]"
      >
        <div className="flex items-center gap-3 border-b border-[color:var(--color-overlay-2)] px-4 py-3">
          <Search size={16} className="shrink-0 text-[color:var(--color-text-tertiary)]" />
          <label htmlFor="project-search-input" className="sr-only">
            {t('inputLabel')}
          </label>
          <input
            id="project-search-input"
            ref={inputRef}
            type="text"
            name="project-search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder={t('inputPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="search-palette-title"
            aria-controls="search-palette-results"
            aria-activedescendant={
              activeRow?.kind === 'doc'
                ? `search-result-doc-${activeRow.doc.slug}`
                : activeRow?.kind === 'project'
                  ? `search-result-project-${activeRow.result.project.slug}`
                  : undefined
            }
            className="flex-1 bg-transparent text-[15px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:outline-none"
          />
          <kbd className="hidden rounded border border-[color:var(--color-divider)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-text-quaternary)] sm:inline-block">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeAriaLabel')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--color-overlay-2)] px-4 py-2">
          <div className="flex items-center gap-2">
            <p
              id="search-palette-title"
              className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]"
            >
              {query.trim() ? t('headingResults') : t('headingRecent')}
            </p>
            {containerLabel ? (
              <span className="rounded-full border border-[color:rgba(139,151,255,0.32)] bg-[color:rgba(94,106,210,0.12)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(139,151,255,0.95)]">
                {t('containerBadge', { name: containerLabel })}
              </span>
            ) : null}
          </div>
          <span
            aria-live="polite"
            className="font-mono text-[9px] uppercase tracking-[0.12em] tabular-nums text-[color:var(--color-text-quaternary)]"
          >
            {t('rowsCount', { count: rows.length })}
          </span>
        </div>
        {/* Layer filter chip row — 전체/컨테이너/허브/노드 중 선택. 선택 시
            results 가 해당 계층만 포함. 기본 '전체'. */}
        <div
          role="tablist"
          aria-label={t('layerFilterAriaLabel')}
          className="flex items-center gap-1.5 border-b border-[color:var(--color-overlay-2)] px-4 py-2"
        >
          {LAYER_FILTERS.map((option) => {
            const active = layerFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setLayerFilter(option.value);
                  setActiveIndex(0);
                }}
                className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] ${
                  active
                    ? 'border-[color:rgba(94,106,210,0.45)] bg-[color:rgba(94,106,210,0.16)] text-[color:rgba(139,151,255,0.95)]'
                    : 'border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]'
                }`}
              >
                {t(option.labelKey)}
              </button>
            );
          })}
        </div>
        {!query.trim() && recentProjects.length > 0 ? (
          <div className="border-b border-[color:var(--color-overlay-2)] px-4 py-2.5">
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {t('recentSection')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recentProjects.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => {
                    pushRecentSlug(p.slug);
                    onSelect(p.slug);
                    onClose();
                  }}
                  className="rounded-full border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(94,106,210,0.08)] px-2.5 py-1 text-[11px] text-[color:rgba(139,151,255,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.16)]"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {!query.trim() && (
          <div className="border-b border-[color:var(--color-overlay-2)] px-4 py-2.5">
            <p
              id="search-palette-help"
              className="text-xs leading-6 text-[color:var(--color-text-tertiary)]"
            >
              {t('helpRecent')}
            </p>
          </div>
        )}
        {query.trim() && (
          <p id="search-palette-help" className="sr-only">
            {t('helpKeyboard')}
          </p>
        )}

        <div
          id="search-palette-results"
          ref={listRef}
          role="listbox"
          className="flex-1 overflow-y-auto overscroll-y-contain md:max-h-[50vh] md:flex-none"
        >
          {docResults.length > 0 ? (
            <div className="border-b border-[color:var(--color-overlay-2)] px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                <BookOpen size={10} aria-hidden />
                {t('docsSection', { count: docResults.length })}
              </div>
              <ul className="flex flex-col gap-0.5">
                {docResults.map((d, idx) => {
                  const isActive = idx === activeIndex;
                  return (
                    <li key={d.slug}>
                      <Link
                        id={`search-result-doc-${d.slug}`}
                        role="option"
                        aria-selected={isActive}
                        data-index={idx}
                        href={buildDocsVaultHref({ slug: d.slug })}
                        onClick={onClose}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          "flex items-center gap-2 rounded-sm px-2 py-1 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset",
                          isActive
                            ? "bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-text-primary)]"
                            : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]",
                        )}
                      >
                        <BookOpen
                          size={12}
                          aria-hidden
                          className="shrink-0 text-[color:var(--color-indigo-accent)]"
                        />
                        <span className="min-w-0 flex-1 truncate">{d.title}</span>
                        <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                          {d.slug}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {results.length === 0 ? (
            docResults.length > 0 ? null : projects.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <p className="text-sm text-[color:var(--color-text-secondary)]">
                  {t('emptyNoProjectsTitle')}
                </p>
                <p className="mt-2 text-xs leading-6 text-[color:var(--color-text-tertiary)]">
                  {t('emptyNoProjectsBody')}
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 rounded-full border border-[color:var(--color-overlay-3)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                >
                  {t('emptyClose')}
                </button>
              </div>
            ) : filteredProjects.length === 0 && layerFilter !== 'all' ? (
              // 쿼리 없어도 layer filter 가 너무 좁아 결과 0. filter 리셋 CTA.
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <p className="text-sm text-[color:var(--color-text-secondary)]">
                  {t('emptyLayerTitle')}
                </p>
                <p className="mt-2 text-xs leading-6 text-[color:var(--color-text-tertiary)]">
                  {t('emptyLayerBody', {
                    layer: t(
                      LAYER_FILTERS.find((f) => f.value === layerFilter)?.labelKey ?? 'layerAll',
                    ),
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLayerFilter('all');
                    setActiveIndex(0);
                  }}
                  className="mt-4 rounded-full border border-[color:rgba(94,106,210,0.3)] bg-[color:rgba(94,106,210,0.08)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(139,151,255,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                >
                  {t('emptyLayerReset')}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <p className="text-sm text-[color:var(--color-text-secondary)]">{t('emptyNoMatchTitle')}</p>
                <p className="mt-2 text-xs leading-6 text-[color:var(--color-text-tertiary)]">
                  {t('emptyNoMatchBody', { query: query.trim() })}
                </p>
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="mt-4 rounded-full border border-[color:rgba(94,106,210,0.3)] bg-[color:rgba(94,106,210,0.08)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(139,151,255,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                >
                  {t('emptyNoMatchClear')}
                </button>
              </div>
            )
          ) : (
            <ul>
              {results.map((r, idx) => {
                const rowIndex = docResults.length + idx;
                const isActive = rowIndex === activeIndex;
                return (
                  <li key={r.project.slug}>
                    <button
                      type="button"
                      id={`search-result-project-${r.project.slug}`}
                      role="option"
                      aria-selected={isActive}
                      data-index={rowIndex}
                      onClick={() => {
                        pushRecentSlug(r.project.slug);
                        onSelect(r.project.slug);
                        onClose();
                      }}
                      onMouseEnter={() => setActiveIndex(rowIndex)}
                      className={cn(
                        'relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset sm:py-3',
                        isActive
                          ? 'bg-[color:rgba(94,106,210,0.14)]'
                          : 'hover:bg-[color:var(--color-overlay-1)]',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute inset-y-0 left-0 w-px bg-transparent',
                          isActive ? 'bg-[color:var(--color-indigo-brand)]' : '',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'truncate text-sm font-[var(--font-weight-signature)]',
                              r.project.isHub
                                ? 'text-[color:var(--color-indigo-accent)]'
                                : 'text-[color:var(--color-text-primary)]',
                            )}
                          >
                            {highlightMatch(r.project.name, query)}
                          </span>
                          {r.project.isHub ? (
                            <span className="rounded-full bg-[color:var(--color-indigo-brand)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[color:var(--color-text-primary)]">
                              {t('hub')}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-[color:var(--color-text-tertiary)]">
                          {r.project.description}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-[color:var(--color-divider)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                            {categoryLabel(r.project.category)}
                          </span>
                          <span className="rounded-full border border-[color:var(--color-divider)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                            {statusLabel(r.project.status)}
                          </span>
                          {query.trim() && (
                            <span className="rounded-full border border-[color:rgba(94,106,210,0.3)] bg-[color:rgba(94,106,210,0.08)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-indigo-accent)]">
                              {t(MATCH_FIELD_KEYS[r.matchedField])}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="hidden shrink-0 self-center text-right sm:block">
                        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                          {String(rowIndex + 1).padStart(2, '0')}
                        </div>
                        <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                          {r.project.slug}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--color-overlay-2)] bg-[color:var(--color-elevated)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              <kbd>↑↓</kbd> {t('shortcutMove')}
            </span>
            <span>
              <kbd>↵</kbd> {t('shortcutSelect')}
            </span>
            <span>
              <kbd>ESC</kbd> {t('shortcutClose')}
            </span>
          </div>
          <span>{query.trim() ? t('footerResults', { count: rows.length }) : t('footerRecent')}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
