import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadVaultDocs } from "../../../mcp/src/vault/documents/document-cache.mjs";
import {
  flatSlugIssue,
  CREATED_BY_HUMAN,
  CREATED_BY_AGENT_PREFIX,
} from "../../../mcp/src/schema.mjs";

/**
 * Dogfood vault only: slugs are flat identifiers (`flatSlugIssue` blocks new arrivals; hand edits
 * that bypass it are caught here) and every node carries `created_by`. No count is pinned; in an
 * ordinary vault a missing `created_by` is unknown, not a defect.
 */

const VAULT_ROOT = join(process.cwd(), "docs/ontology");
const docs = loadVaultDocs(VAULT_ROOT) as Array<{
  slug: string;
  frontmatter: Record<string, unknown>;
}>;

describe("dogfood vault: slug shape and authorship provenance", () => {
  it("the vault is not empty (a premise of the contract)", () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  it("every node slug is flat under a schema folder", () => {
    const violations = docs
      .map((doc) => ({
        slug: doc.slug,
        issue: flatSlugIssue(String(doc.frontmatter.kind ?? ""), doc.slug),
      }))
      .filter((row) => row.issue !== null);
    expect(violations).toEqual([]);
  });

  it("every node has created_by and the value is human | agent:*", () => {
    const violations = docs
      .map((doc) => ({ slug: doc.slug, value: doc.frontmatter.created_by }))
      .filter(
        (row) =>
          row.value !== CREATED_BY_HUMAN &&
          !(
            typeof row.value === "string" &&
            row.value.startsWith(CREATED_BY_AGENT_PREFIX) &&
            row.value.length > CREATED_BY_AGENT_PREFIX.length
          ),
      );
    expect(violations).toEqual([]);
  });

  it("there is at least 1 human authorship; if nodes that need human judgment vanish, the vault identity has changed", () => {
    expect(docs.some((doc) => doc.frontmatter.created_by === CREATED_BY_HUMAN)).toBe(
      true,
    );
  });
});
