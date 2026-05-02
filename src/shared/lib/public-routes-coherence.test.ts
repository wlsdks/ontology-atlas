import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

// T-13. 공개 라우트 정합성 회귀 가드.
//
// app/sitemap.ts 와 app/project/[slug]/page.tsx 의 generateStaticParams 가
// 모두 fetchAllProjectsAtBuild 를 호출하지만, Next.js fetch 캐시 오염으로
// 각자 다른 프로젝트 집합을 만들 수 있다 - 2026-04-20 에 실제 발견. 빌드
// 결과물인 out/sitemap.xml 의 /project/{slug}/ URL과 out/project/*/ 디렉터리
// 목록이 같지 않으면 SEO 가 404 URL 을 광고하거나, 실제 페이지가 검색엔진에
// 노출되지 않는다.
//
// out/ 가 없으면 조용히 skip. 있는데 mismatch 면 실패.
describe("공개 라우트 정합성", () => {
  it("out/sitemap.xml 의 프로젝트 URL이 out/<locale>/project/*/ 디렉터리와 정확히 일치한다", async () => {
    const root = path.resolve(__dirname, "../../..");
    const outDir = path.join(root, "out");

    const outExists = await stat(outDir).then((s) => s.isDirectory()).catch(() => false);
    if (!outExists) {
      // build 가 아직 안 돌았을 때는 skip. postbuild 순서 강제는 이 테스트 범위가 아님.
      return;
    }

    const sitemap = await readFile(path.join(outDir, "sitemap.xml"), "utf8");

    // i18n: sitemap URL 은 /<locale>/project/<slug>/ 형태. locale 별로 따로
    // 검사해 한 locale 만 프로젝트 빠지는 회귀도 잡는다.
    for (const locale of ["en", "ko"]) {
      const sitemapSlugs = new Set<string>();
      const re = new RegExp(`/${locale}/project/([a-zA-Z0-9][a-zA-Z0-9-]*)/`, "g");
      for (const m of sitemap.matchAll(re)) sitemapSlugs.add(m[1]);

      const projectDir = path.join(outDir, locale, "project");
      const projectDirExists = await stat(projectDir).then((s) => s.isDirectory()).catch(() => false);
      if (!projectDirExists) {
        // 이 locale 의 프로젝트 디렉터리가 통째로 빠지면 잠재적 회귀 — sitemap
        // 에 entries 가 있는데 디렉토리가 없는 경우만 fail, 둘 다 없으면 skip.
        expect(sitemapSlugs.size, `${locale}: sitemap 에 entries 있지만 out/${locale}/project 디렉토리 없음`).toBe(0);
        continue;
      }
      const builtEntries = await readdir(projectDir, { withFileTypes: true });
      const builtSlugs = new Set<string>();
      for (const entry of builtEntries) {
        if (!entry.isDirectory()) continue;
        const name = entry.name;
        // Next.js 내부 산출물 · 레거시 리다이렉트 · 신규 프로젝트 라우트 ·
        // account-scoped slug 의 client fallback shell 은 실제 프로젝트 슬러그가 아님.
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
