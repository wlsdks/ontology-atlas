import { appendFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCoverageMatrix, scanHarness, type HarnessScanPort } from "@/entities/agent-files";
import { deriveCoverageAreas, type CoverageVaultDoc } from "@/views/architecture/model/coverage-areas";
import { buildExcerpt, parseFrontmatter } from "@/shared/lib/parse-frontmatter";

/**
 * **The coverage matrix, run against the repository it is describing.**
 *
 * The Harness tab's spine claims that every agent guide, gate and check can be attached to an area
 * of this repository by the path scope it declares. That claim has one cheap way to fail and one
 * expensive way. The cheap failure is a mapping that produces mostly blank cells, which a reader
 * reads as a broken screen rather than as a finding — the risk direction C named for itself before
 * it was chosen. The expensive failure is the opposite: an attribution rule loose enough that
 * everything reaches everything, which is a screen that cannot say anything is missing.
 *
 * So this runs the real scan over the real checkout and asserts the shape both failures would
 * break, without pinning numbers a healthy refactor moves. `HARNESS_COVERAGE_PRINT=<file> pnpm exec vitest run tests/contract/harness-coverage.contract.test.ts` writes it to that file
 * prints the matrix as it stands today.
 *
 * ⚠️ **Not asserted, because files cannot say it**: that any of these checks ever ran, ever caught
 * anything, or would catch the next thing. The matrix says a script exists and names a path.
 */

const ROOT = process.cwd();

function fsPort(): HarnessScanPort {
  return {
    async listDir(relativePath) {
      try {
        const entries = await readdir(join(ROOT, relativePath), { withFileTypes: true });
        return entries.map((entry) => ({
          name: entry.name,
          kind: entry.isDirectory() ? ("directory" as const) : ("file" as const),
        }));
      } catch {
        return null;
      }
    },
    async readText(relativePath) {
      try {
        const text = await readFile(join(ROOT, relativePath), "utf8");
        return { text, lastModified: null };
      } catch {
        return null;
      }
    },
    async pathExists(relativePath) {
      try {
        await stat(join(ROOT, relativePath));
        return true;
      } catch {
        return false;
      }
    },
  };
}

async function vaultDocs(): Promise<CoverageVaultDoc[]> {
  const out: CoverageVaultDoc[] = [];
  for (const kind of ["domains", "capabilities"]) {
    const dir = join(ROOT, "docs/ontology", kind);
    for (const name of await readdir(dir)) {
      if (!name.endsWith(".md")) continue;
      const raw = await readFile(join(dir, name), "utf8");
      const { frontmatter, body } = parseFrontmatter(raw);
      out.push({
        slug: `${kind}/${name.replace(/\.md$/, "")}`,
        title: typeof frontmatter.title === "string" ? frontmatter.title : name,
        description: typeof frontmatter.description === "string" ? frontmatter.description : undefined,
        excerpt: buildExcerpt(body),
        frontmatter,
      });
    }
  }
  return out;
}

describe("the coverage matrix over this repository", () => {
  it("attaches guides to areas by declared path scope, with no area left blank", async () => {
    const docs = await vaultDocs();
    const { areas, capabilityPaths } = deriveCoverageAreas(docs);
    const report = await scanHarness(fsPort(), { capabilityPaths });
    const matrix = buildCoverageMatrix(report.coverage, areas);

    const printTo = process.env.HARNESS_COVERAGE_PRINT;
    if (printTo) {
      const print = (line: string) => appendFileSync(printTo, `${line}\n`);
      for (const area of matrix.areas) {
        const column = (list: readonly { label: string }[]) =>
          list.length ? list.map((entry) => entry.label).join(" · ") : "—";
        print(
          [
            `\n■ ${area.title} (${area.capabilities.length} capabilities)`,
            `   TOLD     ${area.told.length}  ${column(area.told)}`,
            `   GATED    ${area.gated.length}  ${column(area.gated)}`,
            `   WATCHED  ${area.watched.length}  ${column(area.watched)}`,
          ].join("\n"),
        );
      }
      print(
        [
          `\nreaches every area — told: ${matrix.everywhere.told.map((e) => e.label).join(" · ")}`,
          `reaches every area — gated: ${matrix.everywhere.gated.length}`,
          `reaches every area — watched: ${matrix.everywhere.watched.map((e) => e.label).join(" · ")}`,
          `areas no check names: ${matrix.unwatchedAreas.length} of ${matrix.areas.length}`,
          `areas no gate names: ${matrix.ungatedAreas.length} of ${matrix.areas.length}`,
          `capabilities no scoped guide reaches: ${matrix.unreachedCapabilities.map((c) => c.slug).join(" · ") || "none"}`,
          `declares a path reaching no recorded area: ${matrix.outsideAreas.map((e) => e.label).join(" · ") || "none"}`,
        ].join("\n"),
      );
    }

    expect(matrix.areas.length).toBeGreaterThan(0);
    /* The mapping risk, stated as a floor: an area reached by no guide at all would mean the path
       scopes and the vault's paths are not describing the same repository. */
    for (const area of matrix.areas) {
      expect(
        area.told.length,
        `${area.slug} is reached by no scoped guide`,
      ).toBeGreaterThan(0);
    }
    /* Every area carries a purpose, because the purpose is what makes an empty cell readable. */
    for (const area of matrix.areas) expect(area.purpose.length).toBeGreaterThan(0);
  });

  it("splits authored Markdown by whether a guide sends an agent to it", async () => {
    /*
     * The census, not a verdict. What is asserted is that the three states partition the set and
     * that the unnamed bucket is neither empty (which would mean the citation search is matching
     * everything) nor everything (which would mean it is matching nothing). The exact numbers move
     * with every document written, so they are printed rather than pinned.
     */
    const report = await scanHarness(fsPort(), {
      capabilityPaths: [],
      excludedFolders: ["docs/ontology"],
    });
    const reach = report.documentReach;

    const printTo = process.env.HARNESS_COVERAGE_PRINT;
    if (printTo) {
      appendFileSync(
        printTo,
        [
          `\n— authored Markdown: ${reach.total} (excluding ${reach.excluded.join(", ") || "nothing"}${reach.truncated ? ", walk truncated" : ""})`,
          `  guides: ${reach.guides} (${reach.mirroredGuides} of them the Codex mirror of a declared pair)`,
          `  named by a guide: ${reach.named}`,
          `  named by nothing: ${reach.unnamed}`,
          `  where: ${reach.unnamedByFolder.slice(0, 12).map((row) => `${row.folder} ${row.count}`).join(" · ")}`,
        ].join("\n") + "\n",
      );
    }

    expect(reach.guides + reach.named + reach.unnamed).toBe(reach.total);
    expect(reach.guides).toBeGreaterThan(0);
    expect(reach.named).toBeGreaterThan(0);
    expect(reach.unnamed).toBeGreaterThan(0);
    expect(reach.truncated).toBe(false);
  });

  it("does not let a longer path's citation mark a shorter one as reached", async () => {
    /* `cli/README.md` cited in a guide must not also reach the root `README.md`. Without the
       boundary the count drifts upward, which is the flattering direction. */
    const { citesPath } = await import("@/entities/agent-files");
    expect(citesPath("see cli/README.md for the CLI", "README.md")).toBe(false);
    expect(citesPath("see README.md at the root", "README.md")).toBe(true);
  });

  it("keeps the always-loaded rules out of the rows and names them once", async () => {
    const docs = await vaultDocs();
    const { areas, capabilityPaths } = deriveCoverageAreas(docs);
    const report = await scanHarness(fsPort(), { capabilityPaths });
    const matrix = buildCoverageMatrix(report.coverage, areas);

    const universal = matrix.everywhere.told.map((entry) => entry.id);
    expect(universal).toContain(".claude/rules/forbidden.md");
    expect(universal).toContain(".claude/rules/git.md");
    expect(universal).toContain(".claude/rules/local-first.md");
    for (const area of matrix.areas) {
      for (const entry of area.told) expect(universal).not.toContain(entry.id);
    }
  });

  it("keeps a repository-wide lane out of the Watched cells", async () => {
    /*
     * `lint` and `test:run` run over every area. They are the reason "nothing watches this" would be
     * a false sentence and "no check names this" is a true one, and the screen owes the reader both
     * halves — so they must appear in the everywhere strip and in no row.
     */
    const docs = await vaultDocs();
    const { areas, capabilityPaths } = deriveCoverageAreas(docs);
    const report = await scanHarness(fsPort(), { capabilityPaths });
    const matrix = buildCoverageMatrix(report.coverage, areas);

    const universal = matrix.everywhere.watched.map((entry) => entry.id);
    expect(universal).toContain("package.json#lint");
    for (const area of matrix.areas) {
      for (const entry of area.watched) expect(universal).not.toContain(entry.id);
    }
  });

  it("resolves every scope it prints, so no cell cites a path that is not there", async () => {
    const docs = await vaultDocs();
    const { areas, capabilityPaths } = deriveCoverageAreas(docs);
    const report = await scanHarness(fsPort(), { capabilityPaths });
    const matrix = buildCoverageMatrix(report.coverage, areas);
    const port = fsPort();

    const printed = new Set<string>();
    for (const area of matrix.areas) {
      for (const column of ["told", "gated", "watched"] as const) {
        for (const entry of area[column]) {
          for (const scope of entry.scopes) {
            if (capabilityPaths.some((path) => path === scope || path.startsWith(`${scope}/`) || scope.startsWith(`${path}/`))) {
              printed.add(scope);
            }
          }
        }
      }
    }
    expect(printed.size).toBeGreaterThan(0);
    for (const scope of printed) {
      expect(await port.pathExists!(scope), `${scope} is cited and not on disk`).toBe(true);
    }
  });
});
