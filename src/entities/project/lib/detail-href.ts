import {
  appendAccountQuery,
  appendWorkspaceProjectQuery,
} from "../../../shared/lib/account-scope";

/**
 * 공개 상세 페이지의 canonical 경로(`/project/{slug}/`)를 반환한다.
 *
 * 과거에는 `/project/view/?slug=...` 형태의 legacy 경로를 돌려주고, 런타임에
 * `app/project/view/page.tsx` 가 canonical 로 replace 하는 식이었다. 이제
 * 내부 링크는 처음부터 canonical 을 가리키도록 고정해 redirect hop 을 제거
 * (T-15). legacy 경로는 외부 북마크용으로만 계속 replace 된다.
 *
 * 단, slug 에 URL-safe 하지 않은 문자가 섞이면 404 로 갈 수 있으므로
 * encodeURIComponent 로 path segment 를 감싼다.
 */
export function getProjectDetailHref(
  slug: string,
  accountId?: string | null,
  projectId?: string | null,
): string {
  return appendWorkspaceProjectQuery(
    appendAccountQuery(`/project/${encodeURIComponent(slug)}/`, accountId),
    projectId,
  );
}

export function getProjectDetailUrl(
  origin: string,
  slug: string,
  accountId?: string | null,
  projectId?: string | null,
): string {
  return new URL(
    getProjectDetailHref(slug, accountId, projectId),
    origin,
  ).toString();
}
