import { describe, expect, it } from "vitest";
import { buildVaultMarkdown } from "./build-vault-markdown";

describe("buildVaultMarkdown", () => {
  it("slug·kind·title frontmatter + H1 본문을 생성", () => {
    const md = buildVaultMarkdown({ kind: "capability", title: "Auth", slug: "capabilities/auth" });
    expect(md).toBe(
      ["---", "slug: capabilities/auth", "kind: capability", "title: Auth", "---", "", "# Auth", ""].join("\n"),
    );
  });

  it("YAML 특수문자가 든 title 은 quote + escape", () => {
    const md = buildVaultMarkdown({ kind: "domain", title: 'A: "B"', slug: "domains/a" });
    expect(md).toContain('title: "A: \\"B\\""');
    // 본문 H1 은 원문 그대로
    expect(md).toContain('# A: "B"');
  });

  it("평범한 title 은 quote 하지 않음", () => {
    const md = buildVaultMarkdown({ kind: "element", title: "JWT", slug: "elements/jwt" });
    expect(md).toContain("title: JWT");
    expect(md).not.toContain('title: "JWT"');
  });
});
