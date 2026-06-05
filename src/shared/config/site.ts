/**
 * 사이트 canonical URL 단일 source.
 *
 * layout metadata · project detail canonical · sitemap · robots 가 전부
 * 이 값을 써야 검색엔진이 일관된 canonical 로 인덱싱. 자기 도메인에
 * 배포하는 OSS 사용자는 이 상수 하나만 바꾸면 전체 SEO 가 따라간다.
 *
 * default 는 공식 Firebase Hosting 배포 주소. 로컬 개발 서버에서도 canonical
 * metadata 는 공개 사이트를 가리키게 유지한다.
 */
export const SITE_URL = "https://ontology-atlas.web.app";

/**
 * canonical path helper. `/project/foo/` 같은 상대 경로를 받아 절대 URL 로.
 * trailing slash 는 Next.js `trailingSlash: true` 정책에 맞춘다.
 */
export function absoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}
