'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BookOpen, Search, X } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui';
import { OVERLAY_SPRING, OVERLAY_SPRING_REDUCED, SCRIM_FADE, SCRIM_FADE_REDUCED } from "@/shared/motion";
import { useBodyScrollLock } from '@/shared/lib/use-body-scroll-lock';
import type { Project } from '@/entities/project';
import { useTaxonomy } from '@/features/taxonomy';
import { buildDocsVaultHref, type VaultDoc } from '@/entities/docs-vault';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import { searchProjects } from '../model/fuzzy-search';
import { fieldClass } from '@/shared/ui/control-class';
import { transientSurface } from "@/shared/ui/transient-surface";

// Source Vault 매칭 — 가볍게 title/excerpt/slug includes. ⌘K 팔레트는
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
      <mark className="rounded-micro bg-[color:var(--color-indigo-line-a22)] px-0.5 text-[color:var(--color-text-primary)]">
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
  // rank2 — 임계감쇠 오버레이 스프링(오버슈트 0) 단일 통일. reduced-motion
  // 사용자는 translate 없이 120ms opacity 크로스페이드만.
  const reducedMotion = useReducedMotion();
  const panelTransition = reducedMotion ? OVERLAY_SPRING_REDUCED : OVERLAY_SPRING;
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
  // 매니페스트를 직접 import 하면 "예시 비즈니스 보기" 선택을 무시하고 늘
  // dogfood 를 뒤진다 — 팔레트가 화면에 안 보이는 볼트를 검색하는 셈이다.
  // 훅은 훅 규칙상 useMemo 밖에서 부르고 값만 의존성으로 넘긴다.
  const { manifest: staticManifest } = useStaticVaultSource();
  const docResults = useMemo(() => {
    if (!query.trim()) return [];
    return matchVaultDocs(query, staticManifest.docs);
  }, [query, staticManifest]);
  const rows = useMemo<PaletteRow[]>(
    () => [
      ...docResults.map((doc) => ({ kind: 'doc' as const, doc })),
      ...results.map((result) => ({ kind: 'project' as const, result })),
    ],
    [docResults, results],
  );
  const activeRow = rows[activeIndex] ?? null;

  // mount 직후 focus (input ref가 연결된 다음 프레임). rank18 — preventScroll
  // 로 배경 스크롤 점프 방지.
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      inputRef.current?.focus({ preventScroll: true }),
    );
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
      // rank2 — 스크림은 --topology-motion-panel-duration(180ms)과 값을
      // 맞춘 opacity 크로스페이드. reduced-motion 은 120ms(OVERLAY_SPRING_REDUCED).
      transition={reducedMotion ? SCRIM_FADE_REDUCED : SCRIM_FADE}
      data-interactive-overlay="true"
      data-overlay-spring="true"
      className="fixed inset-0 z-50 flex items-stretch justify-center md:items-start md:px-[max(1rem,env(safe-area-inset-left))] md:pt-[max(4rem,env(safe-area-inset-top))] md:pr-[max(1rem,env(safe-area-inset-right))]"
    >
      <div
        data-testid="search-palette-backdrop"
        className="absolute inset-0 bg-[color:var(--overlay-scrim)]"
        onClick={onClose}
      />

      {/* 모바일은 풀스크린 시트 (반경 없이 inset-0 가득 채움), md+ 는
          기존 floating 카드 (max-w-xl, rounded-sheet, 위에서 슬라이드).
          rank2 — 3종 오버레이 공용 임계감쇠 스프링(OVERLAY_SPRING, 오버슈트
          0). 진입은 opacity 0→1 + translateY 8px→0 만 — scale 없음
          (hover:scale-* 혼동 방지). 캔버스 2-param 물리 모델과는 별도
          튜닝(app/globals.css `--overlay-spring-*` 토큰 주석의 변환식 참조,
          "동일 스프링 상속" 아님). */}
      <motion.div
        ref={dialogRef}
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 8, opacity: 0 }}
        transition={panelTransition}
        data-overlay-spring="true"
        data-search-palette-panel="true"
        onClick={(event) => event.stopPropagation()}
        {...transientSurface("sheet")}
      role="dialog"
        aria-modal="true"
        aria-labelledby="search-palette-title"
        aria-describedby="search-palette-help"
        className="relative flex h-full w-full flex-col overflow-hidden border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-3)] md:h-auto md:max-w-xl md:rounded-sheet"
      >
        <div className="flex items-center gap-3 border-b border-[color:var(--color-overlay-2)] px-4 py-3">
          <Search size={ICON_SIZE.lg} className="shrink-0 text-[color:var(--color-text-tertiary)]" />
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
            // 타입은 값 층(bare=text-body)이 정한다 — 종전 `text-title`(16px)
            // 덮어쓰기는 조회 규격 위반이었다(조회는 입력이 결과를 이기면 안
            // 된다, 2026-08-06 필드 규격). 문서함 팔레트와 같은 칸이 된다.
            className={fieldClass({ frame: "bare", className: "flex-1" })}
          />
          <kbd className="hidden rounded-micro border border-[color:var(--color-divider)] px-1.5 py-0.5 font-mono text-caption uppercase tracking-wider text-[color:var(--color-text-quaternary)] sm:inline-block">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeAriaLabel')}
            className="flex h-[var(--overlay-close-size)] w-[var(--overlay-close-size)] items-center justify-center rounded-chip text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
          >
            <X size={ICON_SIZE.lg} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--color-overlay-2)] px-4 py-2">
          <div className="flex items-center gap-2">
            <p
              id="search-palette-title"
              className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]"
            >
              {query.trim() ? t('headingResults') : t('headingRecent')}
            </p>
            {containerLabel ? (
              <span className="rounded-full border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-a12)] px-2 py-0.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-indigo-line-a90)]">
                {t('containerBadge', { name: containerLabel })}
              </span>
            ) : null}
          </div>
          <span
            aria-live="polite"
            className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] tabular-nums text-[color:var(--color-text-quaternary)]"
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
                className={controlClass({
                  shape: 'pill',
                  size: 'sm',
                  active,
                  className: cn(
                    'font-mono uppercase tracking-[var(--tracking-caps-14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)]',
                    !active &&
                      'bg-[color:var(--color-overlay-1)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]',
                  ),
                })}
              >
                {t(option.labelKey)}
              </button>
            );
          })}
        </div>
        {!query.trim() && recentProjects.length > 0 ? (
          <div className="border-b border-[color:var(--color-overlay-2)] px-4 py-2.5">
            <p className="mb-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
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
                  className={controlClass({
                    shape: 'pill',
                    size: 'md',
                    tone: 'accentOnTint',
                    className:
                      'border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-indigo-a08)] hover:bg-[color:var(--color-indigo-a16)]',
                  })}
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
              className="text-body leading-title text-[color:var(--color-text-tertiary)]"
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
              <div className="mb-1 flex items-center gap-1.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                <BookOpen size={ICON_SIZE.sm} aria-hidden />
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
                        className={controlClass({
                          shape: "row",
                          size: "sm",
                          tone: isActive ? "default" : "muted",
                          className: cn(
                            "gap-2 rounded-micro",
                            isActive
                              ? "bg-[color:var(--color-indigo-a14)]"
                              : "hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]",
                          ),
                        })}
                      >
                        <BookOpen
                          size={ICON_SIZE.sm}
                          aria-hidden
                          className="shrink-0 text-[color:var(--color-indigo-accent)]"
                        />
                        <span className="min-w-0 flex-1 truncate">{d.title}</span>
                        <span className="min-w-0 truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
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
                <p className="text-body-lg text-[color:var(--color-text-secondary)]">
                  {t('emptyNoProjectsTitle')}
                </p>
                <p className="mt-2 text-body leading-title text-[color:var(--color-text-tertiary)]">
                  {t('emptyNoProjectsBody')}
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className={controlClass({ shape: "pill", tone: "muted", className: "mt-4 border-[color:var(--color-overlay-3)] px-3 py-1.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]" })}
                >
                  {t('emptyClose')}
                </button>
              </div>
            ) : filteredProjects.length === 0 && layerFilter !== 'all' ? (
              // 쿼리 없어도 layer filter 가 너무 좁아 결과 0. filter 리셋 CTA.
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <p className="text-body-lg text-[color:var(--color-text-secondary)]">
                  {t('emptyLayerTitle')}
                </p>
                <p className="mt-2 text-body leading-title text-[color:var(--color-text-tertiary)]">
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
                  className={controlClass({ shape: "pill", className: "mt-4 border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a08)] px-3 py-1.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-line-a90)] hover:bg-[color:var(--color-indigo-a18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]" })}
                >
                  {t('emptyLayerReset')}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <p className="text-body-lg text-[color:var(--color-text-secondary)]">{t('emptyNoMatchTitle')}</p>
                <p className="mt-2 text-body leading-title text-[color:var(--color-text-tertiary)]">
                  {t('emptyNoMatchBody', { query: query.trim() })}
                </p>
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className={controlClass({ shape: "pill", className: "mt-4 border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a08)] px-3 py-1.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-line-a90)] hover:bg-[color:var(--color-indigo-a18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]" })}
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
                      className={controlClass({
                        shape: 'row',
                        stacked: true,
                        className: cn(
                          'relative items-start gap-3 px-4 py-3 sm:py-3',
                          isActive
                            ? 'bg-[color:var(--color-indigo-a14)]'
                            : 'hover:bg-[color:var(--color-overlay-1)]',
                        ),
                      })}
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
                              'truncate text-body-lg font-[var(--font-weight-signature)]',
                              r.project.isHub
                                ? 'text-[color:var(--color-indigo-accent)]'
                                : 'text-[color:var(--color-text-primary)]',
                            )}
                          >
                            {highlightMatch(r.project.name, query)}
                          </span>
                          {r.project.isHub ? (
                            <span className="rounded-full bg-[color:var(--color-indigo-brand)] px-1.5 py-0.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-primary)]">
                              {t('hub')}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-body text-[color:var(--color-text-tertiary)]">
                          {r.project.description}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-[color:var(--color-divider)] px-2 py-0.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
                            {categoryLabel(r.project.category)}
                          </span>
                          <span className="rounded-full border border-[color:var(--color-divider)] px-2 py-0.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
                            {statusLabel(r.project.status)}
                          </span>
                          {query.trim() && (
                            <span className="rounded-full border border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a08)] px-2 py-0.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-indigo-text-soft)]">
                              {t(MATCH_FIELD_KEYS[r.matchedField])}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="hidden shrink-0 self-center text-right sm:block">
                        <div className="font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
                          {String(rowIndex + 1).padStart(2, '0')}
                        </div>
                        <div className="mt-1 font-mono text-caption text-[color:var(--color-text-quaternary)]">
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--color-overlay-2)] bg-[color:var(--color-elevated)] px-4 py-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
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
