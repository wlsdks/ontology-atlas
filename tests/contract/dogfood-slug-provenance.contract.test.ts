import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadVaultDocs } from "../../mcp/src/vault.mjs";
import {
  flatSlugIssue,
  CREATED_BY_HUMAN,
  CREATED_BY_AGENT_PREFIX,
} from "../../mcp/src/schema.mjs";

/**
 * Two rules for the dogfood vault (2026-08-01):
 *
 * 1. **A slug is a flat identifier** (`docs/DECISIONS.md` verdict). A regenerated
 *    vault carried 43 path-shaped slugs such as `elements/src/views/home`, and
 *    tail-alias collisions were measured as 3 nodes folding into 1 on screen plus 4
 *    relations lost. The write checkpoint (`flatSlugIssue`) blocks new arrivals;
 *    hand edits that bypass it are caught here.
 *
 * 2. **Every node carries authorship provenance** (owner instruction — `human` means
 *    a node whose existence depends on human judgement: the project definition,
 *    domain boundaries, and direction-promise capabilities; everything else is
 *    `agent:*`). The count is not pinned — a fixed number is noise that breaks every
 *    time the vault grows. Only the value's shape and its presence on every node are
 *    the contract.
 *
 * This contract applies to the dogfood vault only — in an ordinary user's vault a
 * missing `created_by` is unknown, not a defect (decision ledger, 2026-07-31).
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
