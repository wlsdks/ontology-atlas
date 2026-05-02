import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CategoriesPage } from '@/views/settings-categories';

export const metadata: Metadata = {
  title: '카테고리',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CategoriesPage />
    </Suspense>
  );
}
