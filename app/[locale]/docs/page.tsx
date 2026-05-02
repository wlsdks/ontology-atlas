import { Suspense } from 'react';
import type { Metadata } from 'next';
import { DocsVaultPage } from '@/views/docs-vault';

export const metadata: Metadata = {
  title: 'Docs Vault',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DocsVaultPage />
    </Suspense>
  );
}
