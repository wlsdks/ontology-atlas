import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard for public-route coherence.
//
// Both `app/sitemap.ts` and `generateStaticParams` in `app/project/[slug]/page.tsx`
// call `fetchAllProjectsAtBuild`, but Next.js fetch-cache pollution can make them
// produce different project sets — actually observed 2026-04-20. If the
// /project/{slug}/ URLs in the built out/sitemap.xml do not match the out/project/*/
// directories, SEO either advertises 404 URLs or hides real pages from search
// engines.
//
// Skips silently when out/ is absent; fails on a mismatch when it exists.
describe("공개 라우트 정합성", () => {
  it("out/sitemap.xml 의 프로젝트 URL이 out/<locale>/project/*/ 디렉터리와 정확히 일치한다", async () => {
    const root = path.resolve(__dirname, "../../..");
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
        expect(sitemapSlugs.size, `${locale}: sitemap 에 entries 있지만 out/${locale}/project 디렉토리 없음`).toBe(0);
        continue;
      }
      const builtEntries = await readdir(projectDir, { withFileTypes: true });
      const builtSlugs = new Set<string>();
      for (const entry of builtEntries) {
        if (!entry.isDirectory()) continue;
        const name = entry.name;
        // Next.js internals, legacy redirects, the new-project route, and the
        // client fallback shell are not real project slugs.
        if (name.startsWith("__next")) continue;
        if (name === "view" || name === "topology" || name === "new" || name === "fallback") continue;
        builtSlugs.add(name);
      }

      const onlyInSitemap = [...sitemapSlugs].filter((s) => !builtSlugs.has(s));
      const onlyBuilt = [...builtSlugs].filter((s) => !sitemapSlugs.has(s));

      expect(
        onlyInSitemap,
        `${locale}: sitemap 광고하지만 HTML 없는 슬러그(404 위험): ${onlyInSitemap.join(", ")}`,
      ).toEqual([]);
      expect(
        onlyBuilt,
        `${locale}: HTML 은 있지만 sitemap 누락된 슬러그: ${onlyBuilt.join(", ")}`,
      ).toEqual([]);
    }
  });
});
