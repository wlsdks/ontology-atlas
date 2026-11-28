import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WEB_ONLY_LOCALE_ROUTES,
  WEB_ONLY_ROOT_ENTRIES,
  isDesktopFrontendPath,
} from "../../../scripts/desktop/stage-desktop-frontend.mjs";
import { listLocales } from "../../../scripts/i18n/build-messages.mjs";
import { architectureRoutes } from "../architecture-routes";
import { buildProjectEditHref, buildProjectRuntimeDetailHref } from "@/entities/project";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { SETTINGS_CATALOG } from "@/widgets/app-settings-menu/model/catalog";

/**
 * The installed app embeds `src-tauri/target/desktop-frontend`, a copy of `out/` without what only
 * the website serves (`scripts/desktop/stage-desktop-frontend.mjs`). A file the app asks for and
 * the copy lacks is not a 404 there: Tauri answers with the root `index.html`, which sends the
 * window to the map. So the cost of a wrong entry is a screen the person asked for and never got.
 *
 * The reachable set is the route list in `docs/ARCHITECTURE.md`, which must name every page the
 * export builds; everything on it ships unless this file proves the app has no way to it.
 */

const ROOT = process.cwd();
const locales: string[] = listLocales(ROOT);

/** `app/[locale]/project/[slug]/page.tsx` → `/project/[slug]`; route groups add no segment. */
function exportedRoutes(): string[] {
  const routes: string[] = [];
  for (const base of ["app/[locale]", "app/(gateway)/[locale]"]) {
    const dir = join(ROOT, base);
    for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || entry.name !== "page.tsx") continue;
      const folder = relative(dir, entry.parentPath).split(sep).filter(Boolean);
      routes.push(`/${folder.join("/")}`);
    }
  }
  return [...new Set(routes)].sort();
}

/** The file Tauri reads for an in-app address, as `/en/topology/?p=x` → `en/topology/index.html`. */
function exportFileFor(locale: string, href: string): string {
  const pathname = new URL(href, "https://atlas.invalid").pathname.replace(/^\/+|\/+$/g, "");
  return [locale, pathname, "index.html"].filter(Boolean).join("/");
}

const WEB_ONLY_ROUTES = new Set(WEB_ONLY_LOCALE_ROUTES.map((route: string) => `/${route}`));

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

const appSource = [...sourceFiles("src"), ...sourceFiles("app")].filter(
  (file) => !file.startsWith("src/entities/docs-vault/data/"),
);

describe("the desktop bundle carries every screen the app can open", () => {
  const listed = architectureRoutes(ROOT);

  it("the architecture route list names every page the export builds", () => {
    expect(listed.length).toBeGreaterThan(10);
    expect(exportedRoutes().filter((route) => !listed.includes(route))).toEqual([]);
  });

  it("every listed route outside the web-only set ships in each locale", () => {
    for (const route of listed.filter((r) => !WEB_ONLY_ROUTES.has(r))) {
      const concrete = route.replace(/\[[^\]]+\]/g, "any");
      for (const locale of locales) {
        expect(isDesktopFrontendPath(exportFileFor(locale, concrete), { locales }), `${locale}${route}`).toBe(true);
      }
    }
  });

  it("every web-only route is one the route list names", () => {
    for (const route of WEB_ONLY_ROUTES) expect(listed).toContain(route);
  });

  it("every rail destination and settings link ships, the gateway pages they reach included", () => {
    const hrefs = [
      ...Object.values(DESTINATION_HREF),
      ...SETTINGS_CATALOG.filter((entry) => entry.href).map((entry) => entry.href as string),
    ];
    // About › What's new opens `/changelog`, whose header links `/guide`; both stay.
    expect(hrefs).toContain("/changelog");
    for (const href of [...hrefs, "/guide/"]) {
      for (const locale of locales) {
        expect(isDesktopFrontendPath(exportFileFor(locale, href), { locales }), `${locale}${href}`).toBe(true);
      }
    }
  });

  it("the root entry ships, so a missed path lands on the map instead of a blank window", () => {
    expect(isDesktopFrontendPath("index.html", { locales })).toBe(true);
    expect(readFileSync(join(ROOT, "app/page.tsx"), "utf8")).toContain("<LocaleRedirect />");
  });
});

describe("what the desktop bundle leaves out has no way in from the app", () => {
  it("/download: only reviewed files link it, and each shows the link on the web alone", () => {
    // The installed app must never offer its own download (route list, `/`). Every file below
    // gates its link behind the web runtime or renders only on a gateway page; a new file that
    // links `/download` has to be read for that gate and added here.
    const reviewed = new Set([
      "src/app/providers/GatewayHandOverScript.tsx",
      // The boot script hands a plain browser to /download; its `else` branch runs only when `window.isTauri` is absent.
      "src/i18n/boot-script.ts",
      // Generated route table: it names the route's address, and links nothing.
      "src/app/route-tree.gen.ts",
      "src/shared/lib/navigation/nav-destination.ts",
      "src/views/terminal-state/ui/NotFoundScreen.tsx",
      "src/widgets/gateway-chrome/ui/GatewayNav.tsx",
    ]);
    const linksDownload = /["']\/download\/?["'?#]/;
    const naming = appSource.filter(
      (file) => !file.startsWith("src/views/download/") && linksDownload.test(readFileSync(join(ROOT, file), "utf8")),
    );
    expect(naming.filter((file) => !reviewed.has(file))).toEqual([]);
    // A file that stops linking leaves the list, so the list stays the set that was read.
    expect([...reviewed].filter((file) => !naming.includes(file))).toEqual([]);
  });

  it("/project/<slug>: the export builds no page per slug; the app opens every project through the query-addressed pages", () => {
    for (const href of [buildProjectRuntimeDetailHref("a b/c"), buildProjectEditHref("a b/c", { returnTo: "/topology" })]) {
      for (const locale of locales) {
        expect(isDesktopFrontendPath(exportFileFor(locale, href), { locales }), `${locale}${href}`).toBe(true);
      }
    }
    expect(exportedRoutes().filter((route) => route.startsWith("/project/[slug]"))).toEqual([]);
    // Only the address helpers and a text search spell the path form.
    const pathForm = /\/project\/\$\{/;
    const allowed = new Set([
      "src/entities/project/lib/detail-href.ts",
      // Scores documents whose text mentions the address; it renders no link.
      "src/entities/docs-vault/lib/doc-navigation/related-docs.ts",
    ]);
    const offenders = appSource.filter(
      (file) => !allowed.has(file) && pathForm.test(readFileSync(join(ROOT, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("web-only files: only the website's own views and metadata name them", () => {
    // A quote or backtick before the slash: an address, not a folder named in a comment.
    const names = WEB_ONLY_ROOT_ENTRIES.map((entry: string) => entry.replace(/[.-]/g, "\\$&"));
    const pattern = new RegExp(`["'\`]/(${names.join("|")})\\b`);
    // Metadata tags are never fetched by the window; the download view renders only on the web gateway.
    const allowed = [
      /^src\/views\/download\//,
      /^src\/shared\/lib\/public-pages\/page-metadata\.ts$/,
      /^src\/shared\/lib\/public-pages\/site-metadata\.ts$/,
      /^app\/layout\.tsx$/,
      /^app\/robots\.ts$/,
      /^app\/sitemap\.ts$/,
      /^app\/llms(-full)?\.txt\/route\.ts$/,
    ];
    const naming = appSource.filter((file) => pattern.test(readFileSync(join(ROOT, file), "utf8")));
    expect(naming).toContain("src/views/download/model/demo-clips.ts");
    expect(naming.filter((file) => !allowed.some((rule) => rule.test(file)))).toEqual([]);
  });
});
