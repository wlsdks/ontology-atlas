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

function buildProjectFallbackHref(
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
export function buildProjectRuntimeDetailHref(slug: string): string {
  return buildProjectFallbackHref(slug);
}

export function buildProjectRuntimeDetailUrl(
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
    `${basePath}${locale}${buildProjectRuntimeDetailHref(slug)}`,
    origin,
  ).toString();
}

export function buildProjectEditHref(
  slug: string,
  options: ProjectEditHrefOptions = {},
): string {
  return buildProjectFallbackHref(slug, {
    mode: "edit",
    returnTo: options.returnTo,
    savedNotice: options.savedNotice,
  });
}

/** Reads the fallback address's query into one state; a query that names no project returns to the list. */
export function resolveProjectFallbackRoute(
  search: string,
): ProjectFallbackRoute | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const slug = params.get("slug");
  if (!slug || slug === "fallback") return null;

  return {
    mode: params.get("mode") === "edit" ? "edit" : "detail",
    slug,
    returnTo: params.get("returnTo") ?? undefined,
    savedNotice: params.get("saved") === "1",
  };
}
