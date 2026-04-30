/**
 * 사이트 canonical URL 단일 source.
 * layout metadata · project detail canonical · sitemap · robots 가 전부
 * 같은 값을 써야 검색엔진이 일관된 canonical 로 인덱싱. 실 작동하는 Firebase
 * Hosting 도메인을 기본값으로 두고, 사용자 custom domain 전환 시 이 상수
 * 하나만 바꾸면 전체 SEO 가 따라간다.
 */
export const SITE_URL = "https://aslan-project-map.web.app";

/**
 * canonical path helper. `/project/foo/` 같은 상대 경로를 받아 절대 URL 로.
 * trailing slash 는 Next.js `trailingSlash: true` 정책에 맞춘다.
 */
export function absoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}
