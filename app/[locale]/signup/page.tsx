import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SignupPage } from '@/views/signup';

export const metadata: Metadata = {
  title: '계정 만들기',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SignupPage />
    </Suspense>
  );
}
