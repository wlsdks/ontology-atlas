import { describe, expect, it } from "vitest";
import {
  migrate,
  id,
  description,
} from "../../../scripts/migrations/2026-05-04-trim-frontmatter-values.mjs";

const fakeFile = (raw: string) => ({
  path: "/tmp/x.md",
  relativePath: "x.md",
  raw,
});

describe("migration: trim-frontmatter-values", () => {
  it("id / description 노출", () => {
    expect(id).toBe("2026-05-04-trim-frontmatter-values");
    expect(description).toMatch(/trailing/);
  });

  it("frontmatter 없는 파일은 no-op (null)", () => {
    expect(migrate(fakeFile("# 그냥 마크다운"))).toBeNull();
  });

  it("닫는 --- 빠진 frontmatter 는 no-op", () => {
    expect(migrate(fakeFile("---\nkind: project\n# unclosed"))).toBeNull();
  });

  it("이미 깨끗한 frontmatter 는 no-op", () => {
    expect(
      migrate(fakeFile("---\nkind: project\nslug: foo\n---\nbody")),
    ).toBeNull();
  });

  it("trailing whitespace 가 있는 scalar 는 trim", () => {
    const result = migrate(
      fakeFile("---\nkind: project   \nslug: foo\t\n---\nbody"),
    );
    expect(result).not.toBeNull();
    expect(result?.raw).toBe("---\nkind: project\nslug: foo\n---\nbody");
  });

  it("idempotent — 두 번 적용해도 결과 동일", () => {
    const input = "---\nkind: project   \nslug: foo\t\n---\nbody";
    const first = migrate(fakeFile(input));
    expect(first).not.toBeNull();
    const second = migrate(fakeFile(first!.raw));
    expect(second).toBeNull();
  });

  it("block list dash item 들여쓰기 보존", () => {
    const input = "---\ncaps:\n  - login\n  - reset\n---\n";
    expect(migrate(fakeFile(input))).toBeNull();
  });

  it("body 영역의 trailing whitespace 는 손대지 않음", () => {
    const input =
      "---\nkind: project\n---\n\n# heading   \nparagraph with trailing   \n";
    expect(migrate(fakeFile(input))).toBeNull();
  });
});
