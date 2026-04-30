import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_PROJECTS } from "./seed-data";

// T-14. 공개 상세 SEO metadata 정합성 회귀 가드.
//
// out/project/{slug}/index.html 마다 아래가 모두 채워져 있어야 한다.
//   - <title> 이 프로젝트 name 으로 시작 (project.name + " · Narnia" 관습)
//   - og:title == project.name
//   - og:description == project.description (seed 기준)
//   - canonical, og:url 모두 https://host/project/{slug}/ 로 끝남
//
// 하나라도 어긋나면 SEO · LinkedIn · Twitter 카드가 엉뚱한 값을 뿌린다.
// out/ 없으면 조용히 skip, 있으면 엄격 검증.

function pickContent(html: string, pattern: RegExp): string | null {
  const m = html.match(pattern);
  return m ? m[1] : null;
}

async function loadHtml(slug: string, outDir: string): Promise<string | null> {
  const p = path.join(outDir, "project", slug, "index.html");
  const exists = await stat(p).then(() => true).catch(() => false);
  if (!exists) return null;
  return readFile(p, "utf8");
}

describe("공개 상세 SEO metadata", () => {
  it("모든 seed 프로젝트의 빌드 HTML 이 title · canonical · og 를 올바르게 채운다", async () => {
    const root = path.resolve(__dirname, "../../../..");
    const outDir = path.join(root, "out");

    const outExists = await stat(outDir).then((s) => s.isDirectory()).catch(() => false);
    if (!outExists) return;

    const findings: string[] = [];

    for (const project of SEED_PROJECTS) {
      const html = await loadHtml(project.slug, outDir);
      if (html === null) {
        // seed 는 있는데 built HTML 이 없으면 T-13 회귀. 해당 test 가 잡으므로 여기선 skip.
        continue;
      }

      const title = pickContent(html, /<title>([^<]+)<\/title>/);
      const ogTitle = pickContent(html, /<meta property="og:title" content="([^"]+)"/);
      const ogDesc = pickContent(html, /<meta property="og:description" content="([^"]+)"/);
      const canonical = pickContent(html, /<link rel="canonical" href="([^"]+)"/);
      const ogUrl = pickContent(html, /<meta property="og:url" content="([^"]+)"/);

      const canonicalSuffix = `/project/${project.slug}/`;

      if (!title || !title.includes(project.name)) {
        findings.push(`${project.slug}: <title> 에 프로젝트 name "${project.name}" 없음 → "${title}"`);
      }
      if (ogTitle !== project.name) {
        findings.push(`${project.slug}: og:title 기대 "${project.name}" vs 실제 "${ogTitle}"`);
      }
      if (!ogDesc) {
        findings.push(`${project.slug}: og:description 누락`);
      } else if (project.description && ogDesc !== project.description) {
        findings.push(
          `${project.slug}: og:description 기대 "${project.description.slice(0, 40)}…" vs 실제 "${ogDesc.slice(0, 40)}…"`,
        );
      }
      if (!canonical || !canonical.endsWith(canonicalSuffix)) {
        findings.push(`${project.slug}: canonical 기대 .../${canonicalSuffix} vs 실제 "${canonical}"`);
      }
      if (!ogUrl || !ogUrl.endsWith(canonicalSuffix)) {
        findings.push(`${project.slug}: og:url 기대 .../${canonicalSuffix} vs 실제 "${ogUrl}"`);
      }
    }

    expect(
      findings,
      `SEO metadata 정합성 findings ${findings.length}건:\n${findings.slice(0, 20).join("\n")}`,
    ).toEqual([]);
  });
});
