import { describe, expect, it } from "vitest";
import {
  buildNewNodeDoc,
  buildVaultMarkdown,
  vaultFolderForKind,
} from "./build-vault-markdown";

describe("buildVaultMarkdown", () => {
  const uid = "00000000-0000-4000-8000-000000000001";

  it("slug·kind·title frontmatter + H1 본문을 생성", () => {
    const md = buildVaultMarkdown({ uid, kind: "capability", title: "Auth", slug: "capabilities/auth" });
    expect(md).toBe(
      ["---", `uid: ${uid}`, "slug: capabilities/auth", "kind: capability", "title: Auth", "---", "", "# Auth", ""].join("\n"),
    );
  });

  it("YAML 특수문자가 든 title 은 quote + escape", () => {
    const md = buildVaultMarkdown({ kind: "domain", title: 'A: "B"', slug: "domains/a" });
    expect(md).toContain('title: "A: \\"B\\""');
    // The body H1 stays verbatim.
    expect(md).toContain('# A: "B"');
  });

  it("평범한 title 은 quote 하지 않음", () => {
    const md = buildVaultMarkdown({ kind: "element", title: "JWT", slug: "elements/jwt" });
    expect(md).toContain("title: JWT");
    expect(md).not.toContain('title: "JWT"');
  });

  it("domain 주어지면 kind 와 title 사이에 emit", () => {
    const md = buildVaultMarkdown({ uid, kind: "capability", title: "Auth", slug: "capabilities/auth", domain: "iam" });
    expect(md).toBe(
      ["---", `uid: ${uid}`, "slug: capabilities/auth", "kind: capability", "domain: iam", "title: Auth", "---", "", "# Auth", ""].join("\n"),
    );
  });

  it("domain 미지정/공백이면 emit 안 함 (추출 전 byte-identical)", () => {
    const a = buildVaultMarkdown({ uid, kind: "element", title: "JWT", slug: "elements/jwt" });
    const b = buildVaultMarkdown({ uid, kind: "element", title: "JWT", slug: "elements/jwt", domain: "   " });
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
  it("직접 생성 문서에 주입 UID를 기록하고 기본 생성은 매번 새 UUIDv4를 발급", () => {
    const fixedUid = "00000000-0000-4000-8000-000000000001";
    const fixed = buildNewNodeDoc({
      title: "Token Issue",
      kind: "capability",
      uid: fixedUid,
    });
    expect(fixed.markdown).toContain(`uid: ${fixedUid}`);

    const first = buildNewNodeDoc({ title: "First", kind: "domain" }).markdown.match(/^uid:\s*(.+)$/m)?.[1];
    const second = buildNewNodeDoc({ title: "Second", kind: "domain" }).markdown.match(/^uid:\s*(.+)$/m)?.[1];
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toBe(second);
  });

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

describe("quoteYamlScalar — 타입 재해석 방어 (2026-09-01 리뷰)", () => {
  it("boolean/number 모양의 title 은 quote 되어 문자열로 남는다", () => {
    // The other three frontmatter writers gained this guard when top-level
    // scalars became typed; without it here a web-created '2026' read back as
    // a number and dropped out of every typeof === 'string' consumer.
    const md2026 = buildVaultMarkdown({ kind: "domain", title: "2026", slug: "domains/y2026" });
    expect(md2026).toContain('title: "2026"');
    const mdTrue = buildVaultMarkdown({ kind: "domain", title: "true", slug: "domains/t" });
    expect(mdTrue).toContain('title: "true"');
  });
});
