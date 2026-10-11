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

/**
 * **Frontmatter must survive** in BOM and CRLF files (2026-07-28).
 *
 * Once the parser learned to read BOM/CRLF, such a document became a graph node
 * for the first time, which made this write path reachable for the first time.
 * The old code saw `raw.startsWith("---")` return false with a BOM present and
 * therefore **discarded the entire frontmatter block**, saving only the body — a
 * destructive path that wiped the kind and every relation.
 *
 * The original file's line endings and BOM are also restored: reading convenience
 * is not a reason to turn someone else's whole file into a diff.
 */
describe("BOM·CRLF 원본", () => {
  it("BOM 이 있어도 frontmatter 를 보존한다", () => {
    const raw = "﻿---\nkind: capability\ntitle: T\n---\n옛 본문\n";
    const next = replaceVaultBody(raw, "새 본문");
    expect(next).toContain("kind: capability");
    expect(next).toContain("새 본문");
    expect(next.startsWith("﻿")).toBe(true);
  });

  it("CRLF 파일은 CRLF 로 되돌려 저장한다", () => {
    const raw = "---\r\nkind: capability\r\ntitle: T\r\n---\r\n옛 본문\r\n";
    const next = replaceVaultBody(raw, "새 본문");
    expect(next).toContain("kind: capability");
    expect(next).toContain("새 본문");
    expect(next.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(next)).toBe(false);
  });

  it("LF 파일은 LF 그대로 — 되돌림이 원본을 바꾸지 않는다", () => {
    const raw = "---\nkind: capability\n---\n옛 본문\n";
    const next = replaceVaultBody(raw, "새 본문");
    expect(next.includes("\r")).toBe(false);
    expect(next.startsWith("﻿")).toBe(false);
  });
});
