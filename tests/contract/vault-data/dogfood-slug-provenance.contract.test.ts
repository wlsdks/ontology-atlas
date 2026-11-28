import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { VAULT_CREATED_BY_HUMAN } from "@/entities/docs-vault";
import { folderForKind } from "@/shared/lib/vault-document/meaning-findings";
import { parseFrontmatter } from "@/shared/lib/vault-document/parse-frontmatter";

/**
 * Dogfood vault only: slugs are flat identifiers (the write tools block new arrivals; hand edits
 * that bypass them are caught here) and every node carries `created_by`. No count is pinned; in an
 * ordinary vault a missing `created_by` is unknown, not a defect.
 */

const VAULT_ROOT = join(process.cwd(), "docs/ontology");
const CREATED_BY_AGENT_PREFIX = "agent:";

/** Every Markdown document of the folder, dotfolders left out, as the server's reader sees it. */
function readDocs(directory: string): Array<{ slug: string; frontmatter: Record<string, unknown> }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readDocs(path);
    if (!entry.isFile() || !entry.name.endsWith(".md")) return [];
    const slug = relative(VAULT_ROOT, path).split(sep).join("/").replace(/\.md$/, "").normalize("NFC");
    return [{ slug, frontmatter: parseFrontmatter(readFileSync(path, "utf8")).frontmatter as Record<string, unknown> }];
  });
}

const docs = readDocs(VAULT_ROOT);

/** A slug under a kind folder is a name, not a location: nothing nests below the folder. */
function nestsUnderKindFolder(kind: string, slug: string): boolean {
  const folder = folderForKind(kind);
  if (!folder || !slug.startsWith(folder)) return false;
  return /[\\/]/.test(slug.slice(folder.length));
}

describe("dogfood vault: slug shape and authorship provenance", () => {
  it("the vault is not empty (a premise of the contract)", () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  it("every node slug is flat under a schema folder", () => {
    const violations = docs
      .filter((doc) => nestsUnderKindFolder(String(doc.frontmatter.kind ?? ""), doc.slug))
      .map((doc) => doc.slug);
    expect(violations).toEqual([]);
  });

  it("the flat-slug rule catches a nested path and spares a flat one", () => {
    expect(nestsUnderKindFolder("element", "elements/src/views/home")).toBe(true);
    expect(nestsUnderKindFolder("element", "elements/jwt-token")).toBe(false);
  });

  it("every node has created_by and the value is human | agent:*", () => {
    const violations = docs
      .map((doc) => ({ slug: doc.slug, value: doc.frontmatter.created_by }))
      .filter(
        (row) =>
          row.value !== VAULT_CREATED_BY_HUMAN &&
          !(
            typeof row.value === "string" &&
            row.value.startsWith(CREATED_BY_AGENT_PREFIX) &&
            row.value.length > CREATED_BY_AGENT_PREFIX.length
          ),
      );
    expect(violations).toEqual([]);
  });

  it("there is at least 1 human authorship; if nodes that need human judgment vanish, the vault identity has changed", () => {
    expect(docs.some((doc) => doc.frontmatter.created_by === VAULT_CREATED_BY_HUMAN)).toBe(true);
  });
});
