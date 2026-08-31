import { describe, expect, it } from "vitest";
import {
  summarizeVaultValidation,
  validateVaultDocFrontmatter,
  validateVaultDocument,
} from "./validate-vault-document";

const VALID_UID = "00000000-0000-4000-8000-000000000001";

describe("validateVaultDocument", () => {
  it("frontmatter 자체가 없는 docs 파일은 ok", () => {
    const r = validateVaultDocument("# Heading\n\n그냥 메모.");
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("정상 frontmatter (canonical kind) 는 ok", () => {
    const raw = `---\nuid: ${VALID_UID}\nkind: project\nslug: foo\ntitle: Foo\n---\n# Foo`;
    const r = validateVaultDocument(raw);
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("닫는 --- 가 없으면 unclosed-frontmatter error", () => {
    const raw = `---\nkind: project\nslug: foo\n# 어, 닫힘 빠짐`;
    const r = validateVaultDocument(raw);
    expect(r.ok).toBe(false);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].code).toBe("unclosed-frontmatter");
    expect(r.issues[0].severity).toBe("error");
  });

  it("kind 값이 빈 문자열이면 empty-kind error", () => {
    const raw = `---\nkind:\nslug: foo\n---\n`;
    const r = validateVaultDocument(raw);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("empty-kind");
  });

  it("frontmatter 는 있는데 kind 자체가 없으면 missing-kind warning (ok)", () => {
    const raw = `---\nslug: foo\ntitle: Foo\n---\n`;
    const r = validateVaultDocument(raw);
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("missing-kind");
    expect(r.issues[0].severity).toBe("warning");
  });

  it("canonical 외 kind 값은 unknown-kind warning (ok)", () => {
    const raw = `---\nuid: ${VALID_UID}\nkind: bogus\nslug: foo\n---\n`;
    const r = validateVaultDocument(raw);
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("unknown-kind");
    expect(r.issues[0].message).toMatch(/bogus/);
  });

  it("frontmatter 블록은 있는데 key 가 0 추출되면 parse-zero-keys warning", () => {
    // Every key line is invalid (leading colon, comment).
    const raw = `---\n: bad\n# comment\n---\n`;
    const r = validateVaultDocument(raw);
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("parse-zero-keys");
  });

  it("trim 된 kind 가 canonical 이면 ok (capability + domain)", () => {
    // capability/element warn with `missing-expected-field` when `domain` is
    // absent; this case is about recognising the kind, so `domain` is supplied
    // to keep the result clean.
    const raw = `---\nuid: ${VALID_UID}\nkind:    capability   \ndomain: domains/auth\n---\n`;
    const r = validateVaultDocument(raw);
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("6 종 모두 인식 (project / domain / capability / element / document / vault-readme)", () => {
    // capability/element need `domain` to come back clean — the schema warns
    // advisorily on a missing parent.
    const cases: Array<{ kind: string; extra?: string }> = [
      { kind: "project" },
      { kind: "domain" },
      { kind: "capability", extra: "domain: domains/auth" },
      { kind: "element", extra: "domain: domains/auth" },
      { kind: "document" },
      { kind: "vault-readme" },
    ];
    for (const c of cases) {
      const extraLine = c.extra ? `\n${c.extra}` : "";
      const r = validateVaultDocument(
        `---\nuid: ${VALID_UID}\nkind: ${c.kind}${extraLine}\n---\n`,
      );
      expect(r.ok, `kind=${c.kind}`).toBe(true);
      expect(r.issues, `kind=${c.kind}`).toHaveLength(0);
    }
  });

  it("R14 — capability/element 가 domain 없으면 missing-expected-field warning", () => {
    const r = validateVaultDocument(
      `---\nuid: ${VALID_UID}\nkind: capability\ntitle: X\n---\n`,
    );
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("missing-expected-field");
  });

  it("graph 배열 중복/비정렬이면 non-canonical-graph-array warning", () => {
    const r = validateVaultDocument(
      `---\nuid: ${VALID_UID}\nkind: project\ntitle: X\ndependencies: [z, a, z]\n---\n`,
    );
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain(
      "non-canonical-graph-array",
    );
  });

  it("error 와 warning 이 동시에 있으면 ok=false (error 우선)", () => {
    // `unclosed` returns immediately, so the concurrent case is built
    // differently: check only that an `empty-kind` error alone gives ok=false.
    const raw = `---\nkind:\n---\n`;
    const r = validateVaultDocument(raw);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.severity === "error")).toBe(true);
  });
});

describe("validateVaultDocFrontmatter (parsed-only fast path)", () => {
  it("빈 frontmatter — ontology 시그널 0 — 정상 (docs-only)", () => {
    const r = validateVaultDocFrontmatter({});
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("title 만 있는 frontmatter — ontology 시그널 0 — 정상 (docs-only)", () => {
    const r = validateVaultDocFrontmatter({
      title: "Just a doc",
      tags: ["foo"],
    });
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("ontology 시그널 (capabilities) 있는데 kind 없으면 missing-kind warning", () => {
    const r = validateVaultDocFrontmatter({
      title: "X",
      capabilities: ["foo"],
    });
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("missing-kind");
  });

  it("kind 가 빈 문자열이면 empty-kind error", () => {
    const r = validateVaultDocFrontmatter({ kind: "", title: "X" });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("empty-kind");
  });

  it("canonical kind 는 ok (capability with domain)", () => {
    const r = validateVaultDocFrontmatter({
      uid: VALID_UID,
      kind: "capability",
      title: "X",
      domain: "domains/auth",
    });
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("R14 — capability without domain → missing-expected-field warning", () => {
    const r = validateVaultDocFrontmatter({
      uid: VALID_UID,
      kind: "capability",
      title: "X",
    });
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("missing-expected-field");
  });

  it("graph 배열 중복/비정렬이면 non-canonical-graph-array warning", () => {
    const r = validateVaultDocFrontmatter({
      uid: VALID_UID,
      kind: "project",
      title: "X",
      dependencies: ["z", "a", "z"],
    });
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain(
      "non-canonical-graph-array",
    );
  });

  it("non-canonical kind 는 unknown-kind warning", () => {
    const r = validateVaultDocFrontmatter({
      uid: VALID_UID,
      kind: "weird",
      title: "X",
    });
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("unknown-kind");
  });
});

describe("summarizeVaultValidation", () => {
  it("clean docs — ok / counts 0", () => {
    const summary = summarizeVaultValidation([
      {
        slug: "a",
        frontmatter: { uid: VALID_UID, kind: "project", title: "A" },
      },
      { slug: "b", frontmatter: {} }, // docs-only
    ]);
    expect(summary.ok).toBe(true);
    expect(summary.total).toBe(0);
    expect(summary.errorCount).toBe(0);
    expect(summary.warningCount).toBe(0);
    expect(summary.issuesBySlug).toHaveLength(0);
  });

  it("warning 만 있으면 ok=true, errorCount=0, warningCount > 0", () => {
    const summary = summarizeVaultValidation([
      { slug: "a", frontmatter: { uid: VALID_UID, kind: "weird" } },
      { slug: "b", frontmatter: { capabilities: ["x"] } },
    ]);
    expect(summary.ok).toBe(true);
    expect(summary.errorCount).toBe(0);
    expect(summary.warningCount).toBe(2);
    expect(summary.issuesBySlug).toHaveLength(2);
  });

  it("error 가 하나라도 있으면 ok=false", () => {
    const summary = summarizeVaultValidation([
      { slug: "a", frontmatter: { kind: "" } },
      {
        slug: "b",
        frontmatter: { uid: VALID_UID, kind: "project", title: "OK" },
      },
    ]);
    expect(summary.ok).toBe(false);
    expect(summary.errorCount).toBe(1);
  });

  it("issuesBySlug 가 slug 별로 묶여서 반환", () => {
    const summary = summarizeVaultValidation([
      { slug: "a", frontmatter: { uid: VALID_UID, kind: "weird" } },
    ]);
    expect(summary.issuesBySlug).toEqual([
      {
        slug: "a",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "unknown-kind" }),
        ]),
      },
    ]);
  });
});

/*
 * ⚠️ Census state 3e, 2026-08-31. `parseFrontmatter` records these two, `build-local-manifest`
 * keeps them on the doc, and the raw-text validator reports them — but the fast path every screen
 * in the app uses never saw them, so a line the parser could not read silently cost the document a
 * field and nothing anywhere said so.
 */
describe("파서가 못 읽은 줄은 문서의 문제로 함께 보고된다", () => {
  const malformed = [
    { code: "malformed-frontmatter-line", message: "3행을 읽지 못했습니다" },
    { code: "malformed-quoted-scalar", message: "따옴표가 닫히지 않았습니다" },
  ];

  it("파싱 진단을 error 로 올려 보낸다", () => {
    const r = validateVaultDocFrontmatter(
      { uid: VALID_UID, kind: "project", title: "X" },
      malformed,
    );
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual([
      "malformed-frontmatter-line",
      "malformed-quoted-scalar",
    ]);
    expect(r.issues.every((i) => i.severity === "error")).toBe(true);
  });

  it("ontology 노드가 아닌 문서에서도 못 읽은 줄은 말한다", () => {
    // Being a docs-only file is a reason to stay quiet about kinds. It is not a reason to stay
    // quiet about a line nobody can read.
    const r = validateVaultDocFrontmatter({ title: "Just a doc" }, malformed);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("malformed-frontmatter-line");
  });

  it("진단이 없으면 아무 것도 늘어나지 않는다", () => {
    const r = validateVaultDocFrontmatter({ uid: VALID_UID, kind: "project", title: "X" });
    expect(r.issues).toHaveLength(0);
  });

  it("진단과 무관한 파서 코드는 올려 보내지 않는다", () => {
    const r = validateVaultDocFrontmatter({ uid: VALID_UID, kind: "project", title: "X" }, [
      { code: "some-other-note", message: "무시되어야 한다" },
    ]);
    expect(r.issues).toHaveLength(0);
  });

  it("요약도 같은 사실을 센다 — 지도가 그리는 문서 전체의 단일 지점", () => {
    const summary = summarizeVaultValidation([
      { slug: "a", frontmatter: { uid: VALID_UID, kind: "project" }, diagnostics: malformed },
      { slug: "b", frontmatter: { uid: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607", kind: "project" } },
    ]);
    expect(summary.ok).toBe(false);
    expect(summary.errorCount).toBe(2);
    expect(summary.issuesBySlug.map((entry) => entry.slug)).toEqual(["a"]);
  });
});
