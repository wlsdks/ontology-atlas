import { Suspense } from 'react';
import type { Metadata } from 'next';
import { StatusesPage } from '@/views/settings-statuses';

export const metadata: Metadata = {
  title: '상태',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <StatusesPage />
    </Suspense>
  );
}
