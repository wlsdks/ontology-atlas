/** `/project/{slug}/`, with the slug encoded so unsafe characters do not 404. */
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

/** In-app detail path that can open a local slug static export never saw. */
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

/** Resolves the query path and the older rewritten pathname to one state; unresolved returns to the list. */
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
