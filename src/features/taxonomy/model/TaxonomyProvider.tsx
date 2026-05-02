'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
// firebase 의존이 0 인 파일에서만 정적 import — barrel (`@/entities/category`)
// 을 거치면 mapper.ts (Timestamp 사용) → firebase/firestore 가 따라온다.
// API 함수 (subscribe*, seed*) 는 cloud 모드 진입 시점 dynamic import 로 분리.
import { DEFAULT_CATEGORIES } from '@/entities/category/model/defaults';
import { hasRegisteredCategoryRegions } from '@/entities/category/model/presence';
import type { Category } from '@/entities/category/model/types';
import { DEFAULT_STATUSES } from '@/entities/status/model/defaults';
import type { Status } from '@/entities/status/model/types';
import { useDataSourceMode } from '@/features/data-source-mode';

export interface TaxonomyContextValue {
  categories: Category[];
  statuses: Status[];
  categoriesHydrated: boolean;
  statusesHydrated: boolean;
  showCategoryRegions: boolean;
  getCategory: (id: string) => Category | undefined;
  getStatus: (id: string) => Status | undefined;
  categoryLabel: (id: string) => string;
  statusLabel: (id: string) => string;
}

const defaultCategories: Category[] = DEFAULT_CATEGORIES.map((c) => ({
  ...c,
  createdAt: new Date(0),
  updatedAt: new Date(0),
}));

const defaultStatuses: Status[] = DEFAULT_STATUSES.map((s) => ({
  ...s,
  createdAt: new Date(0),
  updatedAt: new Date(0),
}));

const TaxonomyContext = createContext<TaxonomyContextValue | null>(null);

interface Props {
  children: ReactNode;
}

export function TaxonomyProvider({ children }: Props) {
  // mode-aware — local/static 모드는 Firebase 미초기화일 수 있으므로
  // Firestore 구독 skip 하고 defaults 만 사용. cloud 모드만 실시간 sync.
  // (vault 의 categories.md / statuses.md 기반 사용자 정의는 추후 단계.)
  const mode = useDataSourceMode();
  const subscribeCloud = mode === 'cloud';
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [statuses, setStatuses] = useState<Status[]>(defaultStatuses);
  const [categoriesHydrated, setCategoriesHydrated] = useState(!subscribeCloud);
  const [statusesHydrated, setStatusesHydrated] = useState(!subscribeCloud);
  const seededCategoriesRef = useRef(false);
  const seededStatusesRef = useRef(false);

  useEffect(() => {
    if (!subscribeCloud) return;
    let unsubCat: (() => void) | null = null;
    let unsubStat: (() => void) | null = null;
    let cancelled = false;

    void Promise.all([
      import('@/entities/category/api'),
      import('@/entities/status/api'),
    ]).then(
      ([
        { subscribeCategories, seedDefaultCategoriesIfEmpty },
        { subscribeStatuses, seedDefaultStatusesIfEmpty },
      ]) => {
        if (cancelled) return;
        unsubCat = subscribeCategories(
          (list) => {
            setCategories(list.length > 0 ? list : defaultCategories);
            setCategoriesHydrated(true);
            if (!seededCategoriesRef.current && list.length === 0) {
              seededCategoriesRef.current = true;
              void seedDefaultCategoriesIfEmpty().catch((err) => {
                console.warn('[TaxonomyProvider] categories seed error', err);
              });
            }
          },
          (err) => console.warn('[TaxonomyProvider] categories subscribe error', err),
        );
        unsubStat = subscribeStatuses(
          (list) => {
            setStatuses(list.length > 0 ? list : defaultStatuses);
            setStatusesHydrated(true);
            if (!seededStatusesRef.current && list.length === 0) {
              seededStatusesRef.current = true;
              void seedDefaultStatusesIfEmpty().catch((err) => {
                console.warn('[TaxonomyProvider] statuses seed error', err);
              });
            }
          },
          (err) => console.warn('[TaxonomyProvider] statuses subscribe error', err),
        );
      },
    );
    return () => {
      cancelled = true;
      unsubCat?.();
      unsubStat?.();
    };
  }, [subscribeCloud]);

  const value = useMemo<TaxonomyContextValue>(() => {
    const categoryMap = new Map(categories.map((c) => [c.id, c]));
    const statusMap = new Map(statuses.map((s) => [s.id, s]));
    return {
      categories,
      statuses,
      categoriesHydrated,
      statusesHydrated,
      showCategoryRegions: hasRegisteredCategoryRegions(categories),
      getCategory: (id) => categoryMap.get(id),
      getStatus: (id) => statusMap.get(id),
      categoryLabel: (id) => categoryMap.get(id)?.label ?? id,
      statusLabel: (id) => statusMap.get(id)?.label ?? id,
    };
  }, [categories, statuses, categoriesHydrated, statusesHydrated]);

  return <TaxonomyContext.Provider value={value}>{children}</TaxonomyContext.Provider>;
}

export function useTaxonomy(): TaxonomyContextValue {
  const ctx = useContext(TaxonomyContext);
  if (!ctx) {
    throw new Error('useTaxonomy must be used inside <TaxonomyProvider>');
  }
  return ctx;
}
