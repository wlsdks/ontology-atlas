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
import {
  subscribeCategories,
  DEFAULT_CATEGORIES,
  hasRegisteredCategoryRegions,
  seedDefaultCategoriesIfEmpty,
  type Category,
} from '@/entities/category';
import {
  subscribeStatuses,
  DEFAULT_STATUSES,
  seedDefaultStatusesIfEmpty,
  type Status,
} from '@/entities/status';

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
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [statuses, setStatuses] = useState<Status[]>(defaultStatuses);
  const [categoriesHydrated, setCategoriesHydrated] = useState(false);
  const [statusesHydrated, setStatusesHydrated] = useState(false);
  const seededCategoriesRef = useRef(false);
  const seededStatusesRef = useRef(false);

  useEffect(() => {
    const unsubCat = subscribeCategories(
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
    const unsubStat = subscribeStatuses(
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
    return () => {
      unsubCat();
      unsubStat();
    };
  }, []);

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
