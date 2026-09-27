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
  // Undefined shows as an em-dash, never a fabricated 'uncategorized'.
  categoryLabel: (id: string | undefined) => string;
  statusLabel: (id: string | undefined) => string;
}

const TaxonomyContext = createContext<TaxonomyContextValue | null>(null);

interface Props {
  children: ReactNode;
}

/** Defaults-only taxonomy provider. */
export function TaxonomyProvider({ children }: Props) {
  // The only place a label is picked; `.label` itself is Korean.
  const locale = useLocale();
  const value = useMemo<TaxonomyContextValue>(() => {
    const categoryMap = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
    const statusMap = new Map(DEFAULT_STATUSES.map((s) => [s.id, s]));
    return {
      categories: DEFAULT_CATEGORIES,
      statuses: DEFAULT_STATUSES,
      getCategory: (id) => (id ? categoryMap.get(id) : undefined),
      getStatus: (id) => (id ? statusMap.get(id) : undefined),
      // An id outside the defaults comes from the vault and shows verbatim.
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
