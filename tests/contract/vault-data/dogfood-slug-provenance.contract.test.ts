import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadVaultDocs } from "../../../mcp/src/vault/documents.mjs";
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

describe("도그푸드 볼트 — 슬러그 형태와 저작 출처", () => {
  it("볼트가 비어 있지 않다 (계약의 전제)", () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  it("모든 노드의 슬러그가 스키마 폴더 아래에서 평평하다", () => {
    const violations = docs
      .map((doc) => ({
        slug: doc.slug,
        issue: flatSlugIssue(String(doc.frontmatter.kind ?? ""), doc.slug),
      }))
      .filter((row) => row.issue !== null);
    expect(violations).toEqual([]);
  });

  it("모든 노드에 created_by 가 있고 값은 human | agent:* 다", () => {
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

  it("human 저작이 최소 1개는 있다 — 사람 판단이 성립 조건인 노드가 사라지면 볼트 정체성이 바뀐 것", () => {
    expect(docs.some((doc) => doc.frontmatter.created_by === CREATED_BY_HUMAN)).toBe(
      true,
    );
  });
});
