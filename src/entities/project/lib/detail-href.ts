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

const PROJECT_FALLBACK_HREF = "/project/fallback/";

export interface ProjectFallbackRoute {
  mode: "detail" | "edit";
  slug: string;
  returnTo: string | undefined;
  savedNotice: boolean;
}

interface ProjectEditHrefOptions {
  returnTo?: string;
  savedNotice?: boolean;
}

function getProjectFallbackHref(
  slug: string,
  options: {
    mode?: ProjectFallbackRoute["mode"];
    returnTo?: string;
    savedNotice?: boolean;
  } = {},
): string {
  const search = new URLSearchParams({ slug });
  if (options.mode === "edit") search.set("mode", "edit");
  if (options.returnTo) search.set("returnTo", options.returnTo);
  if (options.savedNotice) search.set("saved", "1");
  return `${PROJECT_FALLBACK_HREF}?${search.toString()}`;
}

/**
 * 정적 export에서도 빌드 시점에 알 수 없는 로컬 vault slug를 열 수 있는
 * 앱 내부 상세 경로. 공개 canonical은 getProjectDetailHref를 계속 사용한다.
 */
export function getProjectRuntimeDetailHref(slug: string): string {
  return getProjectFallbackHref(slug);
}

export function getProjectRuntimeDetailUrl(
  origin: string,
  slug: string,
  options: { locale?: string; basePath?: string } = {},
): string {
  const basePath = options.basePath
    ? `/${options.basePath.replace(/^\/+|\/+$/g, "")}`
    : "";
  const locale = options.locale
    ? `/${encodeURIComponent(options.locale.replace(/^\/+|\/+$/g, ""))}`
    : "";
  return new URL(
    `${basePath}${locale}${getProjectRuntimeDetailHref(slug)}`,
    origin,
  ).toString();
}

export function getProjectEditHref(
  slug: string,
  options: ProjectEditHrefOptions = {},
): string {
  return getProjectFallbackHref(slug, {
    mode: "edit",
    returnTo: options.returnTo,
    savedNotice: options.savedNotice,
  });
}

/**
 * query 기반 runtime 경로와 과거 CDN rewrite pathname을 같은 화면 상태로
 * 정규화한다. 해석할 수 없으면 caller가 프로젝트 목록으로 복귀한다.
 */
export function resolveProjectFallbackRoute(
  pathname: string,
  search: string,
): ProjectFallbackRoute | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const querySlug = params.get("slug");
  let slug = querySlug || null;
  let pathnameMode: ProjectFallbackRoute["mode"] = "detail";

  if (!slug) {
    const match = pathname.match(
      /^(?:\/[^/]+)?\/project\/([^/]+)(?:\/(edit))?\/?$/,
    );
    if (!match) return null;
    try {
      slug = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
    pathnameMode = match[2] === "edit" ? "edit" : "detail";
  }

  if (!slug || slug === "fallback") return null;

  return {
    mode: params.get("mode") === "edit" ? "edit" : pathnameMode,
    slug,
    returnTo: params.get("returnTo") ?? undefined,
    savedNotice: params.get("saved") === "1",
  };
}
