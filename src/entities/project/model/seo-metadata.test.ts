import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveProjectsFromVault,
  vaultManifest as staticVaultManifestRaw,
  type VaultManifest,
} from "@/entities/docs-vault";

// This used to iterate `SEO_PROJECTS`, 15 demo entries describing removed features
// as fact. The routes actually built are the ones `generateStaticParams` derives
// from the vault, so this reads the same source — otherwise the guard is not
// checking the real output.
const SEO_PROJECTS = deriveProjectsFromVault(staticVaultManifestRaw as VaultManifest);

// SEO metadata consistency for public detail pages.
//
// Every out/project/{slug}/index.html must have all of:
//   - <title> starting with the project name (the "name · Demo" convention)
//   - og:title == project.name
//   - og:description == project.description (from the seed)
//   - canonical and og:url both ending in https://host/project/{slug}/
//
// Any mismatch makes SEO, LinkedIn, and Twitter cards publish the wrong values.
// Skips silently when out/ is absent; strict when it exists.

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

    for (const project of SEO_PROJECTS) {
      const html = await loadHtml(project.slug, outDir);
      if (html === null) {
        // A seed with no built HTML is a separate regression that its own test catches.
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
