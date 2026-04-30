import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AccountSettingsPage } from '@/views/account-settings';

export const metadata: Metadata = {
  title: '계정 설정',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AccountSettingsPage />
    </Suspense>
  );
}
