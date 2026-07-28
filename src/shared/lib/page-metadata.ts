import type { Metadata } from 'next';
import { SITE_URL } from '@/shared/config';
import { routing } from '@/i18n/routing';

/**
 * 페이지 단 메타데이터 — 검색엔진이 이 사이트를 **찾고 고르는** 층.
 *
 * ## 왜 이게 필요했나
 *
 * 루트 레이아웃은 이미 갖출 것을 갖췄다(`metadataBase` · OG · Twitter ·
 * `WebSite` JSON-LD · hreflang 사이트맵 · robots). 그런데 **개별 페이지는
 * 대부분 `title` 하나만** 달고 있었다. 그러면 셋이 무너진다:
 *
 * - **description 부재** → 검색 결과의 스니펫을 구글이 본문에서 임의로
 *   긁어 만든다. 이 사이트는 본문 대부분이 캔버스(회화 픽셀)라 긁을 산문이
 *   거의 없다 — 스니펫이 비거나 UI 라벨 조각이 된다.
 * - **canonical 부재** → `/ko/download` 와 `/ko/download/` 처럼 같은 문서로
 *   가는 여러 경로가 서로 경쟁한다.
 * - **hreflang 부재** → 사이트맵에는 있는데 문서 자체엔 없어서, 검색엔진이
 *   ko/en 중 어느 쪽을 누구에게 줄지 판단할 근거가 페이지에 없다.
 *
 * ## 절대 경로여야 한다
 *
 * `metadataBase` 가 있어도 `alternates` 는 basePath(`/ontology-atlas`)를 자동
 * 프리픽스하지 않는다 — 이 저장소가 `app/layout.tsx` 주석에 이미 못박아 둔
 * 함정이다. 그래서 여기서 `SITE_URL` 로 직접 조립한다.
 */
export interface PageMetadataInput {
  locale: string;
  /** 로케일 접두 뒤의 경로. 루트는 빈 문자열. 예: `download` · `ontology/insights` */
  path: string;
  title: string;
  description: string;
  /** OG 이미지 경로를 페이지가 따로 가질 때만. 생략 시 루트 레이아웃 것을 상속. */
  ogImage?: string;
}

function absolute(locale: string, path: string): string {
  const tail = path ? `/${path}` : '';
  return `${SITE_URL}/${locale}${tail}`;
}

export function buildPageMetadata({
  locale,
  path,
  title,
  description,
  ogImage,
}: PageMetadataInput): Metadata {
  const canonical = absolute(locale, path);

  /**
   * 모든 로케일을 서로에게 알린다 + `x-default`. 후자가 없으면 검색엔진이
   * "어느 언어도 아닌 사용자"(예: 프랑스어 브라우저)에게 무엇을 줄지 스스로
   * 고르는데, 그 선택은 우리 것이 아니다.
   */
  const languages: Record<string, string> = { 'x-default': absolute(routing.defaultLocale, path) };
  for (const l of routing.locales) languages[l] = absolute(l, path);

  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      type: 'website',
      url: canonical,
      title,
      description,
      locale,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
