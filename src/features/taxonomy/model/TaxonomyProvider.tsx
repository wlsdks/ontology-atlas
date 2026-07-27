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
  // R15 (Concern 1) — vault frontmatter 가 category/status 명시 안 하면
  // undefined. taxonomy provider 가 *—* (em-dash) placeholder 로 표시 —
  // fabricated 'uncategorized' 보다 honest.
  categoryLabel: (id: string | undefined) => string;
  statusLabel: (id: string | undefined) => string;
}

const TaxonomyContext = createContext<TaxonomyContextValue | null>(null);

interface Props {
  children: ReactNode;
}

/**
 * defaults 만 노출하는 정적 provider — taxonomy (categories / statuses) 는
 * 빌드타임 defaults 만으로 충분. vault 기반 사용자 정의 분류 (예:
 * `categories.md` frontmatter) 는 추후 단계.
 */
export function TaxonomyProvider({ children }: Props) {
  // 라벨은 화면 언어를 따른다 — category/status 는 vault 가 아니라 코드
  // 상수라 어권별 라벨을 우리가 쥐고 있다 (`shared/lib/taxonomy-label`).
  // 이 provider 가 라벨을 고르는 **유일한 자리**다: 호출부가 `.label` 을
  // 직접 읽으면 영문 화면에 한국어가 샌다 (2026-07-28 `/project/new` 결함).
  const locale = useLocale();
  const value = useMemo<TaxonomyContextValue>(() => {
    const categoryMap = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
    const statusMap = new Map(DEFAULT_STATUSES.map((s) => [s.id, s]));
    return {
      categories: DEFAULT_CATEGORIES,
      statuses: DEFAULT_STATUSES,
      getCategory: (id) => (id ? categoryMap.get(id) : undefined),
      getStatus: (id) => (id ? statusMap.get(id) : undefined),
      // id 가 defaults 에 없으면 사용자 vault 의 값이다 — 번역하지 않고
      // 원문(id) 을 그대로 보여준다.
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
