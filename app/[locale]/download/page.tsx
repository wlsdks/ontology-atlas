import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DownloadPage, downloadStructuredData } from '@/views/download';
import { buildPageMetadata } from '@/shared/lib/page-metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return buildPageMetadata({
    locale,
    path: 'download',
    title: t('pages.download'),
    description: t('descriptions.download'),
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });

  // The owner-only first-release checklist (blocked-on-PR/secrets/tag status
  // plus a copyable CI audit command) was removed for the public launch: it
  // spoke about the build pipeline, not about whether a visitor can install
  // the app. What the page may claim now derives from whether a release is
  // actually published — see `views/download/lib/release-state.ts`. The
  // release runbook in `docs/DESKTOP-MACOS.md` owns the operator checklist.
  return (
    <>
      <DownloadPage />
      {/*
       * ⚠️ **페이지 루트 뒤에 온다 — 앞이 아니다.**
       *
       * 셸 본문 슬롯의 `firstElementChild` 가 페이지 루트라는 것이
       * `tests/e2e/scroll-end-gap.spec.ts` 의 측정 전제다. 이 `<script>` 를
       * 앞에 두면 그게 첫 자식이 되고, 높이 0 이라 "페이지 루트가 압축됐다
       * (박스 0 < 내용 1589)" 로 게이트가 정확히 잡아낸다(실측: CI 2폭 실패).
       *
       * 스펙의 가정이 옳다 — 슬롯의 첫 자식이 페이지다. 그러니 비시각
       * 형제는 뒤에 선다. JSON-LD 는 문서 어디에 있든 검색엔진이 읽으므로
       * 순서 비용이 0이다.
       */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            downloadStructuredData(locale, t('descriptions.download')),
          ),
        }}
      />
    </>
  );
}
