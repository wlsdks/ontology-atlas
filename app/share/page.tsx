import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ShareDocPage } from '@/views/share-doc';

export const metadata: Metadata = {
  title: '공유 문서',
  robots: {
    index: false,
    follow: false,
  },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ShareDocPage />
    </Suspense>
  );
}
