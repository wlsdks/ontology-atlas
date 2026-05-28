'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Search, Sparkles, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import {
  findMissingDependencySlugs,
  type Project,
  type SuggestedDependency,
} from '@/entities/project';
import { useTaxonomy } from '@/features/taxonomy';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  /** 선택 대상 목록 — 보통 본인 제외한 전체 프로젝트. */
  options: Project[];
  /** 현재 편집 중인 프로젝트 slug. 자기 자신은 선택 불가능. */
  selfSlug?: string;
  invalidSlugs?: string[];
  /**
   * 자동 링크 추천 후보. 설명/상세에서 다른 프로젝트 이름이 발견되면 상단에
   * 점선 칩으로 노출, 수락하면 value 에 추가된다. (거절은 세션 내 로컬 숨김.)
   */
  suggestions?: SuggestedDependency[];
}

/**
 * slug 칩 기반 멀티셀렉트. 검색으로 필터링하고 선택된 항목은 상단에 칩으로,
 * 미선택 항목은 하단에 outlined 칩으로 렌더. CSV 타이핑보다 훨씬 안전.
 */
export function DependencyPicker({
  value,
  onChange,
  options,
  selfSlug,
  invalidSlugs = [],
  suggestions = [],
}: Props) {
  const t = useTranslations('settings.dependencyPicker');
  const [query, setQuery] = useState('');
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(
    () => new Set(),
  );
  const { categoryLabel } = useTaxonomy();
  const invalidSlugSet = useMemo(() => new Set(invalidSlugs), [invalidSlugs]);

  // 이미 선택됐거나 세션에서 거절한 제안은 감춘다. value/suggestions 가
  // 바뀔 때마다 새로 계산.
  const visibleSuggestions = useMemo(() => {
    const selectedSet = new Set(value);
    return suggestions.filter(
      (suggestion) =>
        !selectedSet.has(suggestion.slug) &&
        !dismissedSuggestions.has(suggestion.slug) &&
        suggestion.slug !== selfSlug,
    );
  }, [suggestions, value, dismissedSuggestions, selfSlug]);

  const available = useMemo(
    () => options.filter((p) => p.slug !== selfSlug),
    [options, selfSlug],
  );
  const availableSlugSet = useMemo(
    () => new Set(available.map((project) => project.slug)),
    [available],
  );

  const selected = useMemo(() => {
    const bySlug = new Map(available.map((p) => [p.slug, p]));
    return value
      .map((slug) => bySlug.get(slug))
      .filter((p): p is Project => p !== undefined);
  }, [available, value]);
  const missingSelected = useMemo(
    () => findMissingDependencySlugs(value, availableSlugSet),
    [availableSlugSet, value],
  );

  // 미선택 + 검색어 매칭
  const filtered = useMemo(() => {
    const selectedSet = new Set(value);
    const q = query.trim().toLowerCase();
    return available
      .filter((p) => !selectedSet.has(p.slug))
      .filter((p) => {
        if (!q) return true;
        return (
          p.slug.includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.nameEn?.toLowerCase().includes(q) ?? false)
        );
      });
  }, [available, value, query]);

  const removeOne = (slug: string) => {
    const index = value.indexOf(slug);
    if (index < 0) return;
    onChange([...value.slice(0, index), ...value.slice(index + 1)]);
  };

  const toggle = (slug: string) => {
    if (value.includes(slug)) {
      removeOne(slug);
      return;
    }
    onChange([...value, slug]);
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-3">
      {/* 선택된 칩 */}
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p, index) => (
            <button
              key={`${p.slug}-${index}`}
              data-testid={`dependency-selected-${p.slug}`}
              type="button"
              onClick={() => removeOne(p.slug)}
              className={cn(
                'group flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                p.isHub
                  ? 'border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.2)] text-[color:var(--color-indigo-accent)]'
                  : 'border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.12)] text-[color:var(--color-text-primary)]',
              )}
            >
              <span>{p.name}</span>
              <X
                size={11}
                className="text-[color:var(--color-text-tertiary)] group-hover:text-[color:var(--color-text-primary)]"
              />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[color:var(--color-text-quaternary)]">
          {t('emptyHint')}
        </p>
      )}

      {visibleSuggestions.length > 0 && (
        <div
          data-testid="dependency-suggestions-group"
          className="flex flex-col gap-2 rounded-lg border border-dashed border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.06)] p-3"
        >
          <div className="flex items-center gap-1.5">
            <Sparkles
              size={12}
              className="text-[color:var(--color-indigo-accent)]"
              aria-hidden="true"
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
              {t('suggestionsHeading')}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            {visibleSuggestions.map((suggestion) => (
              <div
                key={suggestion.slug}
                data-testid={`dependency-suggestion-${suggestion.slug}`}
                className="flex items-center justify-between gap-2 rounded-md border border-dashed border-[color:rgba(94,106,210,0.3)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-xs text-[color:var(--color-text-primary)]">
                    {suggestion.name}
                  </span>
                  <span className="truncate text-[10px] text-[color:var(--color-text-tertiary)]">
                    {suggestion.excerpt}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    data-testid={`dependency-suggestion-accept-${suggestion.slug}`}
                    onClick={() => {
                      if (!value.includes(suggestion.slug)) {
                        onChange([...value, suggestion.slug]);
                      }
                    }}
                    className="flex items-center gap-1 rounded-full border border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.14)] px-2 py-0.5 text-[10px] text-[color:var(--color-indigo-accent)] hover:bg-[color:rgba(94,106,210,0.24)]"
                    aria-label={t('suggestionAcceptLabel', { name: suggestion.name })}
                  >
                    <Check size={10} />
                    {t('suggestionAccept')}
                  </button>
                  <button
                    type="button"
                    data-testid={`dependency-suggestion-reject-${suggestion.slug}`}
                    onClick={() => {
                      setDismissedSuggestions((current) => {
                        const next = new Set(current);
                        next.add(suggestion.slug);
                        return next;
                      });
                    }}
                    className="flex items-center rounded-full border border-[color:var(--color-divider)] px-1.5 py-0.5 text-[color:var(--color-text-quaternary)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                    aria-label={t('suggestionRejectLabel', { name: suggestion.name })}
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {missingSelected.length > 0 && (
        <div
          data-testid="dependency-missing-group"
          className="flex flex-col gap-2 rounded-lg border border-[color:rgba(244,183,49,0.25)] bg-[color:rgba(244,183,49,0.08)] p-3"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-status-warning)]">
            {t('missingHeading')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missingSelected.map((slug, index) => (
              <button
                key={`${slug}-${index}`}
                data-testid={`dependency-missing-${slug}`}
                type="button"
                onClick={() => removeOne(slug)}
                className="group flex items-center gap-1.5 rounded-full border border-[color:rgba(244,183,49,0.35)] bg-[color:rgba(244,183,49,0.12)] px-2.5 py-1 text-xs text-[color:var(--color-status-warning)]"
              >
                <span>{slug}</span>
                <X
                  size={11}
                  className="text-[color:var(--color-status-warning)] group-hover:text-[color:var(--color-text-primary)]"
                />
              </button>
            ))}
          </div>
          <p className="text-xs text-[color:var(--color-text-secondary)]">
            {t('missingHint')}
          </p>
        </div>
      )}

      {/* 검색 입력 */}
      <div className="flex items-center gap-2 border-t border-[color:var(--color-overlay-2)] pt-3">
        <Search size={13} className="shrink-0 text-[color:var(--color-text-quaternary)]" />
        <input
          type="text"
          name="dependency-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="flex-1 bg-transparent text-xs text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:outline-none"
        />
      </div>

      {/* 미선택 목록 */}
      <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-[color:var(--color-text-quaternary)]">{t('noMatch')}</p>
        ) : (
          filtered.map((p) => (
            <button
              key={p.slug}
              type="button"
              data-testid={`dependency-option-${p.slug}`}
              onClick={() => toggle(p.slug)}
              disabled={invalidSlugSet.has(p.slug)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border border-[color:var(--color-divider)] bg-transparent px-2.5 py-1 text-xs text-[color:var(--color-text-tertiary)] transition-colors',
                'hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]',
                'disabled:cursor-not-allowed disabled:border-[color:var(--color-overlay-2)] disabled:text-[color:var(--color-text-quaternary)]',
              )}
              title={p.slug}
            >
              <span>{p.name}</span>
              {invalidSlugSet.has(p.slug) && (
                <span className="rounded-sm border border-[color:var(--color-divider)] px-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                  cycle
                </span>
              )}
              {p.isHub && (
                <span className="rounded-sm bg-[color:var(--color-indigo-brand)] px-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[color:var(--color-text-primary)]">
                  HUB
                </span>
              )}
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                {categoryLabel(p.category)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
