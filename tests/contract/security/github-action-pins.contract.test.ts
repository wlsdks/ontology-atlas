import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const ACTION_ROOTS = [".github/workflows", ".github/actions"];

function yamlFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return yamlFiles(path);
    return [".yml", ".yaml"].includes(extname(entry.name)) ? [path] : [];
  });
}

function actionReferences() {
  return ACTION_ROOTS.flatMap(yamlFiles).flatMap((path) => {
    const source = readFileSync(join(ROOT, path), "utf8");
    return [...source.matchAll(/^\s*(?:-\s+)?uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)].map((match) => ({
      path: relative(ROOT, join(ROOT, path)),
      reference: match[1],
    }));
  });
}

describe("GitHub Actions supply chain pinning", () => {
  it("pins every external Action of workflows and local composite actions to a full commit SHA", () => {
    const references = actionReferences();
    expect(references.length, "if the scan target is empty this gate guards nothing").toBeGreaterThan(10);
    expect(
      references.some(
        ({ path, reference }) =>
          path === ".github/workflows/deploy-pages.yml" &&
          reference.startsWith("actions/upload-pages-artifact@"),
      ),
      "missing a `- uses:` list-style line drops the whole Pages deploy Action out of the scan",
    ).toBe(true);
    expect(
      references.some(
        ({ path, reference }) =>
          path === ".github/actions/setup-playwright/action.yml" &&
          reference.startsWith("actions/cache@"),
      ),
      "reading workflows only misses the supply chain inputs inside shared composite Actions",
    ).toBe(true);

    const mutable = references.filter(({ reference }) => {
      if (reference.startsWith("./")) return false;
      if (reference.startsWith("docker://")) return !/@sha256:[a-f0-9]{64}$/.test(reference);
      return !/^[^\s/@]+\/[^\s@]+@[a-f0-9]{40}$/.test(reference);
    });

    expect(
      mutable,
      "the same tag or branch name can point at different code; use a full commit SHA and leave a human-readable version in the adjacent comment",
    ).toEqual([]);
  });

  it("installs toolchains by exact release, never by a moving channel", () => {
    const files = ACTION_ROOTS.flatMap(yamlFiles).map((path) => ({ path, source: readFileSync(join(ROOT, path), "utf8") }));
    const floating = files.flatMap(({ path, source }) =>
      [...source.matchAll(/^\s+((?:[a-z]+-)*version|toolchain):\s*["']?(latest|canary|nightly)["']?\s*$/gm)].map(
        (match) => `${path}: ${match[1]}: ${match[2]}`,
      ),
    );
    const latestDownloads = files.filter(({ source }) => /\/releases\/latest\//.test(source)).map(({ path }) => path);
    expect([...floating, ...latestDownloads], "a moving channel ships whatever was newest that day").toEqual([]);

    // The server is a Rust program: no workflow installs Bun. `.bun-version` stays only for the
    // comparison build `pnpm perf:mcp:baseline` makes until the JavaScript server is deleted.
    const bunSteps = files.filter(({ source }) => source.includes("oven-sh/setup-bun@")).map(({ path }) => path);
    expect(bunSteps, "a workflow installs Bun for a server that no longer needs it").toEqual([]);
    expect(readFileSync(join(ROOT, ".bun-version"), "utf8")).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it("verifies the registry publisher's bytes before it receives the OIDC assertion", () => {
    const publish = readFileSync(join(ROOT, ".github/workflows/publish-mcp-registry.yml"), "utf8");
    expect(publish).toMatch(/MCP_PUBLISHER_VERSION: v\d+\.\d+\.\d+\n/);
    expect(publish).toMatch(/MCP_PUBLISHER_SHA256: [a-f0-9]{64}\n/);
    const install = publish.indexOf("sha256sum --check --strict");
    expect(install, "mcp-publisher runs without its SHA-256 being checked").toBeGreaterThan(0);
    expect(install).toBeLessThan(publish.indexOf("tar xzf mcp-publisher.tar.gz"));
    expect(install).toBeLessThan(publish.indexOf("./mcp-publisher login"));
  });
});
