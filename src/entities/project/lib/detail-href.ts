/**
 * 공개 상세 페이지의 canonical 경로(`/project/{slug}/`)를 반환한다.
 * slug 에 URL-safe 하지 않은 문자가 섞이면 404 로 갈 수 있으므로
 * encodeURIComponent 로 path segment 를 감싼다.
 */
export function getProjectDetailHref(slug: string): string {
  return `/project/${encodeURIComponent(slug)}/`;
}

export function getProjectDetailUrl(origin: string, slug: string): string {
  return new URL(getProjectDetailHref(slug), origin).toString();
}
