/**
 * The canonical path of a public detail page (`/project/{slug}/`). A slug with
 * URL-unsafe characters would 404, so the path segment is encodeURIComponent'd.
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
 * The in-app detail path, which can open a local vault slug that static export
 * cannot know at build time. The public canonical still uses `getProjectDetailHref`.
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
 * Normalizes the query-based runtime path and the older CDN rewrite pathname into the
 * same screen state. When it cannot be resolved, the caller returns to the project list.
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
