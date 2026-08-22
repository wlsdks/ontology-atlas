'use client';

import { useLocale } from 'next-intl';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_CATEGORIES, type Category } from '@/entities/category';
import { DEFAULT_STATUSES, type Status } from '@/entities/status';
import { pickTaxonomyLabel } from '@/shared/lib/taxonomy-label';

export interface TaxonomyContextValue {
  categories: Category[];
  statuses: Status[];
  getCategory: (id: string | undefined) => Category | undefined;
  getStatus: (id: string | undefined) => Status | undefined;
  // Vault frontmatter that does not state category/status yields undefined, and the taxonomy
  // provider displays an em-dash placeholder — more honest than a fabricated 'uncategorized'.
  categoryLabel: (id: string | undefined) => string;
  statusLabel: (id: string | undefined) => string;
}

const TaxonomyContext = createContext<TaxonomyContextValue | null>(null);

interface Props {
  children: ReactNode;
}

/**
 * A static provider exposing the defaults only — build-time defaults are enough for the
 * taxonomy (categories and statuses). Vault-defined custom classifications (a
 * `categories.md` frontmatter, say) are a later stage.
 */
export function TaxonomyProvider({ children }: Props) {
  // Labels follow the screen's language — category and status are code constants rather than
  // vault data, so we hold the per-locale labels ourselves (`shared/lib/taxonomy-label`).
  // This provider is the **only place** that picks a label: a caller reading `.label`
  // directly leaks Korean onto the English screen (the 2026-07-28 `/project/new` defect).
  const locale = useLocale();
  const value = useMemo<TaxonomyContextValue>(() => {
    const categoryMap = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
    const statusMap = new Map(DEFAULT_STATUSES.map((s) => [s.id, s]));
    return {
      categories: DEFAULT_CATEGORIES,
      statuses: DEFAULT_STATUSES,
      getCategory: (id) => (id ? categoryMap.get(id) : undefined),
      getStatus: (id) => (id ? statusMap.get(id) : undefined),
      // An id absent from the defaults comes from the user's vault — it is shown verbatim
      // (the id) rather than translated.
      categoryLabel: (id) =>
        id ? (pickTaxonomyLabel(categoryMap.get(id), locale) ?? id) : '—',
      statusLabel: (id) =>
        id ? (pickTaxonomyLabel(statusMap.get(id), locale) ?? id) : '—',
    };
  }, [locale]);

  return <TaxonomyContext.Provider value={value}>{children}</TaxonomyContext.Provider>;
}

export function useTaxonomy(): TaxonomyContextValue {
  const ctx = useContext(TaxonomyContext);
  if (!ctx) {
    throw new Error('useTaxonomy must be used inside <TaxonomyProvider>');
  }
  return ctx;
}
