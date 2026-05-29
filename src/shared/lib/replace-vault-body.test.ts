import { describe, expect, it } from "vitest";
import { replaceVaultBody } from "./replace-vault-body";
import { parseFrontmatter } from "./parse-frontmatter";

const RAW = ["---", "slug: capabilities/auth", "kind: capability", "domain: iam", "---", "", "# Auth", "", "old explanation"].join("\n");

describe("replaceVaultBody", () => {
  it("frontmatter 보존 + 본문 교체", () => {
    const next = replaceVaultBody(RAW, "# Auth\n\nnew explanation");
    expect(next).toBe(
      ["---", "slug: capabilities/auth", "kind: capability", "domain: iam", "---", "", "# Auth", "", "new explanation", ""].join("\n"),
    );
  });

  it("round-trip: parseFrontmatter 로 frontmatter 불변 + 새 본문", () => {
    const next = replaceVaultBody(RAW, "completely new body");
    const parsed = parseFrontmatter(next);
    expect(parsed.frontmatter).toEqual({
      slug: "capabilities/auth",
      kind: "capability",
      domain: "iam",
    });
    expect(parsed.body.trim()).toBe("completely new body");
  });

  it("본문 앞뒤 공백 정리", () => {
    const next = replaceVaultBody(RAW, "\n\n  spaced  \n\n");
    expect(next).toBe(
      ["---", "slug: capabilities/auth", "kind: capability", "domain: iam", "---", "", "spaced", ""].join("\n"),
    );
  });

  it("빈 본문 → frontmatter 만", () => {
    const next = replaceVaultBody(RAW, "   ");
    expect(next).toBe(["---", "slug: capabilities/auth", "kind: capability", "domain: iam", "---", ""].join("\n"));
    expect(parseFrontmatter(next).frontmatter.slug).toBe("capabilities/auth");
  });

  it("frontmatter 없으면 전체 본문 교체", () => {
    expect(replaceVaultBody("just text", "new text")).toBe("new text\n");
  });
});
