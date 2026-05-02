import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ProjectNewClientPage } from './ProjectNewClientPage';

export const metadata: Metadata = {
  title: '새 프로젝트',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProjectNewClientPage />
    </Suspense>
  );
}
