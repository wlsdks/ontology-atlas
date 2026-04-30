import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PasswordResetPage } from '@/views/password-reset';

export const metadata: Metadata = {
  title: '비밀번호 재설정',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PasswordResetPage />
    </Suspense>
  );
}
