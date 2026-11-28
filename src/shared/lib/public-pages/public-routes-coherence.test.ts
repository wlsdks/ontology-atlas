import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The sitemap and the prerendered pages are written from different lists, which can drift apart.
// Skips when out/ is absent; fails on mismatch otherwise.
describe("public route coherence", () => {
  it("project URLs in out/sitemap.xml match the out/<locale>/project/*/ directories exactly", async () => {
    const root = path.resolve(__dirname, "../../../..");
    const outDir = path.join(root, "out");

    const outExists = await stat(outDir).then((s) => s.isDirectory()).catch(() => false);
    if (!outExists) {
      // Skip when the build has not run. Enforcing postbuild ordering is out of scope here.
      return;
    }

    const sitemap = await readFile(path.join(outDir, "sitemap.xml"), "utf8");

    // Sitemap URLs are /<locale>/project/<slug>/. Checking each locale separately
    // also catches a regression where projects go missing from one locale only.
    for (const locale of ["en", "ko"]) {
      const sitemapSlugs = new Set<string>();
      const re = new RegExp(`/${locale}/project/([a-zA-Z0-9][a-zA-Z0-9-]*)/`, "g");
      for (const m of sitemap.matchAll(re)) sitemapSlugs.add(m[1]);

      const projectDir = path.join(outDir, locale, "project");
      const projectDirExists = await stat(projectDir).then((s) => s.isDirectory()).catch(() => false);
      if (!projectDirExists) {
        // A missing project directory for this locale is a potential regression:
        // fail only when the sitemap has entries but the directory does not exist;
        // skip when neither exists.
        expect(sitemapSlugs.size, `${locale}: sitemap has entries but out/${locale}/project has no directory`).toBe(0);
        continue;
      }
      const builtEntries = await readdir(projectDir, { withFileTypes: true });
      const builtSlugs = new Set<string>();
      for (const entry of builtEntries) {
        if (!entry.isDirectory()) continue;
        const name = entry.name;
        // Legacy redirects, the new-project route and the client fallback shell are not slugs.
        if (name === "view" || name === "topology" || name === "new" || name === "fallback") continue;
        // A demo sample's project page is built but noindex, so the sitemap leaves it out.
        const html = await readFile(path.join(projectDir, name, "index.html"), "utf8").catch(() => "");
        if (/<meta name="robots" content="[^"]*noindex/.test(html)) continue;
        builtSlugs.add(name);
      }

      const onlyInSitemap = [...sitemapSlugs].filter((s) => !builtSlugs.has(s));
      const onlyBuilt = [...builtSlugs].filter((s) => !sitemapSlugs.has(s));

      expect(
        onlyInSitemap,
        `${locale}: slugs the sitemap advertises but that have no HTML (404 risk): ${onlyInSitemap.join(", ")}`,
      ).toEqual([]);
      expect(
        onlyBuilt,
        `${locale}: slugs that have HTML but are missing from the sitemap: ${onlyBuilt.join(", ")}`,
      ).toEqual([]);
    }
  });
});
