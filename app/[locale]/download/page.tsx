import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DownloadPage } from '@/views/download';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return { title: t('pages.download') };
}

export default function Page() {
  // [W-3] 내부 릴리스 체크리스트 + CI 점검 명령은 owner/기여자용 — 최종
  // 사용자(DMG 를 받으러 온 사람)의 모먼트와 무관하다. 이전에는 env var 를
  // 명시적으로 "0" 으로 꺼야만 숨겨지는 opt-out 이라 `pnpm dev` 기본값(및
  // 이 값을 설정하지 않은 어떤 배포든)이 내부 정보를 노출했다. opt-in 으로
  // 뒤집어 명시적으로 "1" 을 켠 릴리스 준비 기간에만 보이게 한다.
  const showFirstReleaseChecklist = process.env.NEXT_PUBLIC_OATLAS_FIRST_RELEASE_PENDING === '1';

  return <DownloadPage showFirstReleaseChecklist={showFirstReleaseChecklist} />;
}
