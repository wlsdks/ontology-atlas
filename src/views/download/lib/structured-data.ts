import { SITE_URL } from '@/shared/config';
import { RELEASE_MIN_MACOS } from './release-facts';
import { MACOS_RELEASE } from './release-state';

/**
 * `SoftwareApplication` 구조화 데이터 — 앱 다운로드 페이지가 검색 결과에서
 * **리치 결과**(가격 · 운영체제 · 카테고리 · 버전)를 받을 수 있는 유일한
 * 스키마다. 루트 레이아웃의 `WebSite` 스키마는 사이트를 설명하지 앱을
 * 설명하지 않으므로, 이 페이지에는 자기 것이 따로 필요하다.
 *
 * ⚠️ **릴리스가 게시됐을 때만 버전·다운로드 URL·크기를 싣는다.**
 *
 * 구조화 데이터는 화면보다 **더 엄격한** 정직성을 요구한다 — 화면의 거짓은
 * 사람이 보고 웃고 끝나지만, 여기 거짓은 검색엔진이 색인해 두고 우리가 모르는
 * 채로 남는다(그리고 구글은 사실과 다른 구조화 데이터에 수동 조치를 내린다).
 * 게시 전에 자리표시자를 넣지 않는 것이 이 페이지 전체가 지켜 온 계약
 * (`release-state.ts` 의 게시 여부 단일 상태)이고, 여기서도 같은 규율을 쓴다.
 *
 * `offers.price: "0"` 은 마케팅 문구가 아니라 사실이다 — MIT 오픈소스이고
 * 결제 표면이 존재하지 않는다. `isAccessibleForFree` 도 같은 근거.
 */
export function downloadStructuredData(locale: string, description: string) {
  const published = MACOS_RELEASE.published && MACOS_RELEASE.assets.length > 0;
  const primary =
    MACOS_RELEASE.assets.find((asset) => asset.arch === 'aarch64') ?? MACOS_RELEASE.assets[0];

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Ontology Atlas',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: RELEASE_MIN_MACOS,
    description,
    url: `${SITE_URL}/${locale}/download`,
    inLanguage: locale,
    license: 'https://opensource.org/licenses/MIT',
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    ...(published && primary
      ? {
          softwareVersion: MACOS_RELEASE.tag.replace(/^v/, ''),
          downloadUrl: primary.downloadUrl,
          ...(MACOS_RELEASE.publishedAt ? { datePublished: MACOS_RELEASE.publishedAt } : {}),
        }
      : {}),
  };
}
