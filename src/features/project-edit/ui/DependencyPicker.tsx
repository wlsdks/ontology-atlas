'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Search, Sparkles, X } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { cn } from '@/shared/lib/cn';
import { controlClass, fieldClass } from '@/shared/ui/control-class';
import {
  findMissingDependencySlugs,
  type Project,
  type SuggestedDependency,
} from '@/entities/project';
import { useTaxonomy } from '@/features/taxonomy';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  /** The options to pick from — normally every project except this one. */
  options: Project[];
  /** The slug of the project being edited. It cannot select itself. */
  selfSlug?: string;
  invalidSlugs?: string[];
  /**
   * Auto-link suggestions. When another project's name is found in the description or
   * detail it appears at the top as a dashed chip, and accepting adds it to `value`.
   * (Rejecting hides it locally for the session.)
   */
  suggestions?: SuggestedDependency[];
}

/**
 * A slug-chip multi-select. Search filters the list; selected items render as chips at the
 * top and unselected ones as outlined chips below. Far safer than typing CSV.
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

  // Hide suggestions that are already selected or were rejected this session. Recomputed
  // whenever `value` or `suggestions` changes.
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

  // Unselected, matching the search text.
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
    <div className="flex flex-col gap-3 rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-3">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p, index) => (
            <button
              key={`${p.slug}-${index}`}
              data-testid={`dependency-selected-${p.slug}`}
              type="button"
              onClick={() => removeOne(p.slug)}
              className={controlClass({
                shape: 'pill',
                size: 'lg',
                /*
                 * Both of these sit on an indigo tint surface (a20/a12 below), where accent
                 * ink falls below AA (composite 3.5–4.4:1 — the accent-ink-contrast contract).
                 * Hub emphasis is carried by `accentOnTint`, in the same indigo family. This
                 * line is a ternary inside an object, which slipped past the old pairing rule
                 * (gate hole fixed 2026-08-13).
                 */
                tone: p.isHub ? 'accentOnTint' : 'strong',
                className: cn(
                  'group gap-1.5 border-[color:var(--color-indigo-brand)]',
                  p.isHub
                    ? 'bg-[color:var(--color-indigo-a20)]'
                    : 'bg-[color:var(--color-indigo-a12)]',
                ),
              })}
            >
              <span>{p.name}</span>
              <X
                size={ICON_SIZE.sm}
                className="text-[color:var(--color-text-tertiary)] group-hover:text-[color:var(--color-text-primary)]"
              />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-body text-[color:var(--color-text-quaternary)]">
          {t('emptyHint')}
        </p>
      )}

      {visibleSuggestions.length > 0 && (
        <div
          data-testid="dependency-suggestions-group"
          className="flex flex-col gap-2 rounded-card border border-dashed border-[color:var(--color-indigo-a34)] bg-[color:var(--color-indigo-a06)] p-3"
        >
          <div className="flex items-center gap-1.5">
            <Sparkles
              size={ICON_SIZE.sm}
              className="text-[color:var(--color-indigo-accent)]"
              aria-hidden="true"
            />
            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-indigo-accent)]">
              {t('suggestionsHeading')}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            {visibleSuggestions.map((suggestion) => (
              <div
                key={suggestion.slug}
                data-testid={`dependency-suggestion-${suggestion.slug}`}
                className="flex items-center justify-between gap-2 rounded-chip border border-dashed border-[color:var(--color-indigo-a30)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-body text-[color:var(--color-text-primary)]">
                    {suggestion.name}
                  </span>
                  <span className="truncate text-caption text-[color:var(--color-text-tertiary)]">
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
                    className={controlClass({
                      shape: 'pill',
                      size: 'sm',
                      tone: 'accentOnTint',
                      className:
                        'gap-1 border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-a14)] hover:bg-[color:var(--color-indigo-a24)]',
                    })}
                    aria-label={t('suggestionAcceptLabel', { name: suggestion.name })}
                  >
                    <Check size={ICON_SIZE.sm} />
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
                    className={controlClass({
                      shape: 'pill',
                      size: 'sm',
                      tone: 'muted',
                      className:
                        'hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]',
                    })}
                    aria-label={t('suggestionRejectLabel', { name: suggestion.name })}
                  >
                    <X size={ICON_SIZE.sm} />
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
          className="flex flex-col gap-2 rounded-card border border-[color:var(--color-amber-source-a25)] bg-[color:var(--color-amber-source-a08)] p-3"
        >
          <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-status-warning)]">
            {t('missingHeading')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missingSelected.map((slug, index) => (
              <button
                key={`${slug}-${index}`}
                data-testid={`dependency-missing-${slug}`}
                type="button"
                onClick={() => removeOne(slug)}
                className={controlClass({
                  shape: 'pill',
                  size: 'lg',
                  tone: 'warning',
                  className:
                    'group gap-1.5 border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)]',
                })}
              >
                <span>{slug}</span>
                <X
                  size={ICON_SIZE.sm}
                  className="text-[color:var(--color-status-warning)] group-hover:text-[color:var(--color-text-primary)]"
                />
              </button>
            ))}
          </div>
          <p className="text-body text-[color:var(--color-text-secondary)]">
            {t('missingHint')}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-[color:var(--color-overlay-2)] pt-3">
        <Search size={ICON_SIZE.sm} className="shrink-0 text-[color:var(--color-text-quaternary)]" />
        <input
          type="text"
          name="dependency-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className={fieldClass({ frame: "bare", className: "flex-1" })}
        />
      </div>

      <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-body text-[color:var(--color-text-quaternary)]">{t('noMatch')}</p>
        ) : (
          filtered.map((p) => (
            <button
              key={p.slug}
              type="button"
              data-testid={`dependency-option-${p.slug}`}
              onClick={() => toggle(p.slug)}
              disabled={invalidSlugSet.has(p.slug)}
              className={controlClass({
                shape: 'pill',
                size: 'lg',
                className: cn(
                  'gap-1.5 bg-transparent',
                  'hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]',
                ),
              })}
              title={p.slug}
            >
              <span>{p.name}</span>
              {invalidSlugSet.has(p.slug) && (
                <span className="rounded-micro border border-[color:var(--color-divider)] px-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
                  cycle
                </span>
              )}
              {p.isHub && (
                <span className="rounded-micro bg-[color:var(--color-indigo-brand)] px-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-on-accent)]">
                  HUB
                </span>
              )}
              <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
                {categoryLabel(p.category)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
