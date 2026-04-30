import { Suspense } from 'react';
import type { Metadata } from 'next';
import { DevLoginPage } from '@/views/dev-login';

export const metadata: Metadata = {
  title: 'Dev login',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DevLoginPage />
    </Suspense>
  );
}
