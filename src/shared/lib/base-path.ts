/**
 * 정적 export 를 서브패스(예: GitHub Pages 프로젝트 사이트 `/ontology-atlas`)에
 * 배포할 때의 base path. 빌드 타임에 `NEXT_PUBLIC_BASE_PATH` 로 주입되며,
 * 루트 배포(Firebase Hosting, 로컬 dev)에서는 빈 문자열이다.
 *
 * next/link · next/router 는 next.config 의 `basePath` 가 자동 처리하지만,
 * raw `<a href>` · next/image `src` · metadata 링크 · 수동 fetch URL 은
 * 자동 프리픽스가 없어 이 헬퍼를 거쳐야 한다.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (!path.startsWith('/')) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}
