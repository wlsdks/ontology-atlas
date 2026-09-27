import { describe, expect, it } from "vitest";
import {
  buildNewNodeDoc,
  buildVaultMarkdown,
  vaultFolderForKind,
} from "./build-vault-markdown";

describe("buildVaultMarkdown", () => {
  const uid = "00000000-0000-4000-8000-000000000001";

  it("writes slug, kind and title frontmatter and an H1 body", () => {
    const md = buildVaultMarkdown({ uid, kind: "capability", title: "Auth", slug: "capabilities/auth" });
    expect(md).toBe(
      ["---", `uid: ${uid}`, "slug: capabilities/auth", "kind: capability", "title: Auth", "---", "", "# Auth", ""].join("\n"),
    );
  });

  it("quotes and escapes a title with YAML special characters", () => {
    const md = buildVaultMarkdown({ kind: "domain", title: 'A: "B"', slug: "domains/a" });
    expect(md).toContain('title: "A: \\"B\\""');
    // The body H1 stays verbatim.
    expect(md).toContain('# A: "B"');
  });

  it("leaves a plain title unquoted", () => {
    const md = buildVaultMarkdown({ kind: "element", title: "JWT", slug: "elements/jwt" });
    expect(md).toContain("title: JWT");
    expect(md).not.toContain('title: "JWT"');
  });

  it("emits domain between kind and title when given", () => {
    const md = buildVaultMarkdown({ uid, kind: "capability", title: "Auth", slug: "capabilities/auth", domain: "iam" });
    expect(md).toBe(
      ["---", `uid: ${uid}`, "slug: capabilities/auth", "kind: capability", "domain: iam", "title: Auth", "---", "", "# Auth", ""].join("\n"),
    );
  });

  it("omits a missing or blank domain", () => {
    const a = buildVaultMarkdown({ uid, kind: "element", title: "JWT", slug: "elements/jwt" });
    const b = buildVaultMarkdown({ uid, kind: "element", title: "JWT", slug: "elements/jwt", domain: "   " });
    expect(a).toBe(b);
    expect(a).not.toContain("domain:");
  });
});

describe("vaultFolderForKind", () => {
  it("maps a canonical kind to its folder name", () => {
    expect(vaultFolderForKind("capability")).toBe("capabilities");
    expect(vaultFolderForKind("element")).toBe("elements");
    expect(vaultFolderForKind("domain")).toBe("domains");
    expect(vaultFolderForKind("project")).toBe("projects");
  });
  it("appends s to any other kind", () => {
    expect(vaultFolderForKind("document")).toBe("documents");
  });
});

describe("buildNewNodeDoc", () => {
  it("records an injected UID and mints a fresh UUIDv4 by default", () => {
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

  it("derives slug, plural folder and markdown from a title", () => {
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

  it("throws on an empty title", () => {
    expect(() => buildNewNodeDoc({ title: "   ", kind: "capability" })).toThrow();
  });
});

describe("quoteYamlScalar prevents type reinterpretation", () => {
  it("quotes a boolean- or number-shaped title so it stays a string", () => {
    // The other three frontmatter writers gained this guard when top-level
    // scalars became typed; without it here a web-created '2026' read back as
    // a number and dropped out of every typeof === 'string' consumer.
    const md2026 = buildVaultMarkdown({ kind: "domain", title: "2026", slug: "domains/y2026" });
    expect(md2026).toContain('title: "2026"');
    const mdTrue = buildVaultMarkdown({ kind: "domain", title: "true", slug: "domains/t" });
    expect(mdTrue).toContain('title: "true"');
  });
});
