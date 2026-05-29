import { describe, expect, it } from "vitest";
import {
  buildNewNodeDoc,
  buildVaultMarkdown,
  vaultFolderForKind,
} from "./build-vault-markdown";

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

  it("domain 주어지면 kind 와 title 사이에 emit", () => {
    const md = buildVaultMarkdown({ kind: "capability", title: "Auth", slug: "capabilities/auth", domain: "iam" });
    expect(md).toBe(
      ["---", "slug: capabilities/auth", "kind: capability", "domain: iam", "title: Auth", "---", "", "# Auth", ""].join("\n"),
    );
  });

  it("domain 미지정/공백이면 emit 안 함 (추출 전 byte-identical)", () => {
    const a = buildVaultMarkdown({ kind: "element", title: "JWT", slug: "elements/jwt" });
    const b = buildVaultMarkdown({ kind: "element", title: "JWT", slug: "elements/jwt", domain: "   " });
    expect(a).toBe(b);
    expect(a).not.toContain("domain:");
  });
});

describe("vaultFolderForKind", () => {
  it("정규 kind 는 dogfood 폴더명으로", () => {
    expect(vaultFolderForKind("capability")).toBe("capabilities");
    expect(vaultFolderForKind("element")).toBe("elements");
    expect(vaultFolderForKind("domain")).toBe("domains");
    expect(vaultFolderForKind("project")).toBe("projects");
  });
  it("그 외는 +s", () => {
    expect(vaultFolderForKind("document")).toBe("documents");
  });
});

describe("buildNewNodeDoc", () => {
  it("title→slug, 폴더 복수형, markdown 생성", () => {
    const r = buildNewNodeDoc({ title: "Token Issue", kind: "capability", domain: "auth" });
    expect(r.slug).toBe("capabilities/token-issue");
    expect(r.markdown).toContain("slug: capabilities/token-issue");
    expect(r.markdown).toContain("kind: capability");
    expect(r.markdown).toContain("domain: auth");
    expect(r.markdown).toContain("# Token Issue");
  });

  it("title trim", () => {
    expect(buildNewNodeDoc({ title: "  Auth  ", kind: "domain" }).slug).toBe("domains/auth");
  });

  it("빈 title → throw", () => {
    expect(() => buildNewNodeDoc({ title: "   ", kind: "capability" })).toThrow();
  });
});
