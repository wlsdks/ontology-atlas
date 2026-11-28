import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { WEBSITE_ONLY_ENTRIES } from "../../../scripts/lib/web/website-only-files.mjs";
import { routeTreeAddresses } from "../route-tree-addresses";
import { buildProjectEditHref, buildProjectRuntimeDetailHref } from "@/entities/project";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { SETTINGS_CATALOG } from "@/widgets/app-settings-menu/model/catalog";

/**
 * The installed app embeds one document and one bundle (`src-tauri/target/desktop-frontend`). A path the
 * bundle has no route for is not a 404 there: the router answers its not-found screen, so the cost of a
 * missing route is a screen the person asked for and never got. What the app folder may hold is
 * `scripts/desktop/check-app-folder.mjs`'s; what its screens may link to is this file's.
 */

const ROOT = process.cwd();

/** What the app's own bundle routes: `vite.config.ts` generates this tree without the website-only pages. */
const routeAddresses = () => routeTreeAddresses(ROOT, "app-route-tree.gen.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

const appSource = [...sourceFiles("src"), ...sourceFiles("app")].filter(
  (file) => !file.startsWith("src/entities/docs-vault/data/"),
);

describe("the app bundle carries every screen the app can open", () => {
  const addresses = routeAddresses();

  it("the app's tree leaves out exactly the website-only pages and nothing else", () => {
    const everything = routeTreeAddresses(ROOT);
    const left = [...everything].filter((address) => !addresses.has(address)).sort();
    expect(left).toEqual(["/$locale/download", "/$locale/sample"]);
    expect([...addresses].filter((address) => !everything.has(address))).toEqual([]);
  });

  it("the route tree was read: it holds the screens and the not-found catch-all", () => {
    expect(addresses.size).toBeGreaterThan(15);
    expect(addresses).toContain("/$locale/topology");
    expect(addresses).toContain("/$locale/$");
  });

  it("every rail destination and settings link has a route, the gateway pages they reach included", () => {
    const hrefs = [
      ...Object.values(DESTINATION_HREF),
      ...SETTINGS_CATALOG.filter((entry) => entry.href).map((entry) => entry.href as string),
    ];
    // About › What's new opens `/changelog`, whose header links `/guide`; both stay.
    expect(hrefs).toContain("/changelog");
    const missing = [...hrefs, "/guide/"]
      .map((href) => new URL(href, "https://atlas.invalid").pathname.replace(/(.)\/$/, "$1"))
      .filter((pathname) => !addresses.has(`/$locale${pathname}`));
    expect(missing).toEqual([]);
  });
});

describe("what the app folder leaves out has no way in from the app", () => {
  it("/download: only reviewed files link it, and each shows the link on the web alone", () => {
    // The installed app must never offer its own download (route list, `/`). Every file below
    // gates its link behind the web runtime or renders only on a gateway page; a new file that
    // links `/download` has to be read for that gate and added here.
    const reviewed = new Set([
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

  it("/project/<slug>: the router holds no route per slug; the app opens every project through the query-addressed pages", () => {
    expect(readdirSync(join(ROOT, "src/app/routes/$locale/_app/project")).filter((name) => name.includes("$"))).toEqual([]);
    expect([...routeAddresses()].filter((address) => address.startsWith("/$locale/project/$"))).toEqual([]);
    for (const href of [buildProjectRuntimeDetailHref("a b/c"), buildProjectEditHref("a b/c", { returnTo: "/topology" })]) {
      expect(new URL(href, "https://atlas.invalid").pathname).not.toMatch(/\/project\/a/);
    }
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

  it("website-only files: only the website's own views and metadata name them", () => {
    // A quote or backtick before the slash: an address, not a folder named in a comment.
    const names = WEBSITE_ONLY_ENTRIES.map((entry: string) => entry.replace(/[.-]/g, "\\$&"));
    const pattern = new RegExp(`["'\`]/(${names.join("|")})\\b`);
    // Metadata tags are never fetched by the window; the download view renders only on the web gateway.
    const allowed = [
      /^src\/views\/download\//,
      /^src\/shared\/lib\/public-pages\/page-metadata\.ts$/,
      /^src\/shared\/lib\/public-pages\/site-metadata\.ts$/,
      /^src\/shared\/config\/site\/site-entity\.ts$/,
      /^src\/app\/document\/SiteDocument\.tsx$/,
    ];
    const naming = appSource.filter((file) => pattern.test(readFileSync(join(ROOT, file), "utf8")));
    expect(naming).toContain("src/views/download/model/demo-clips.ts");
    expect(naming.filter((file) => !allowed.some((rule) => rule.test(file)))).toEqual([]);
  });
});
