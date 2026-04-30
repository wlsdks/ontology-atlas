import { describe, expect, it } from "vitest";
import {
  createStubPlaceholder,
  detectCanonicalConflicts,
  mergeStubPlaceholders,
  normalizeSlug,
  resolveCanonicalNodeId,
} from "./canonicalize";

describe("normalizeSlug", () => {
  it("lowercases english", () => {
    expect(normalizeSlug("AuthLogin")).toBe("authlogin");
  });

  it("preserves Korean characters", () => {
    expect(normalizeSlug("로그인")).toBe("로그인");
  });

  it("converts non-alphanumeric to hyphens", () => {
    expect(normalizeSlug("Auth! Login? v2")).toBe("auth-login-v2");
  });

  it("trims leading and trailing hyphens", () => {
    expect(normalizeSlug("  -foo-bar-  ")).toBe("foo-bar");
  });

  it('returns "unknown" for empty / fully-stripped input', () => {
    expect(normalizeSlug("")).toBe("unknown");
    expect(normalizeSlug("!!!")).toBe("unknown");
  });

  it("preserves Korean + English mix", () => {
    expect(normalizeSlug("Auth 인증")).toBe("auth-인증");
  });
});

describe("resolveCanonicalNodeId — frontmatter id 우선", () => {
  it("uses frontmatter id + frontmatter kind when both present", () => {
    const result = resolveCanonicalNodeId({
      tempId: "n1",
      title: "로그인",
      kind: "capability",
      frontmatterId: "auth-login",
      frontmatterKind: "capability",
    });
    expect(result.canonicalId).toBe("capability:auth-login");
    expect(result.source).toBe("frontmatter-id");
    expect(result.resolvedKind).toBe("capability");
    expect(result.conflictWarning).toBeUndefined();
  });

  it("attaches conflictWarning when frontmatter kind differs from extracted kind", () => {
    const result = resolveCanonicalNodeId({
      tempId: "n1",
      title: "Login",
      kind: "element",
      frontmatterId: "auth-login",
      frontmatterKind: "capability",
    });
    expect(result.canonicalId).toBe("capability:auth-login");
    expect(result.resolvedKind).toBe("capability");
    expect(result.conflictWarning).toMatch(/충돌/);
  });

  it("falls back to extracted kind when frontmatterId given without kind", () => {
    const result = resolveCanonicalNodeId({
      tempId: "n1",
      title: "Login",
      kind: "element",
      frontmatterId: "login-action",
    });
    expect(result.canonicalId).toBe("element:login-action");
    expect(result.source).toBe("frontmatter-id");
  });
});

describe("resolveCanonicalNodeId — legacy slug fallback", () => {
  it("uses kind:projectScope:titleSlug when no frontmatter id", () => {
    const result = resolveCanonicalNodeId({
      tempId: "n1",
      title: "로그인 액션",
      kind: "element",
      primaryProjectId: "aslan-maps",
    });
    expect(result.canonicalId).toBe("element:aslan-maps:로그인-액션");
    expect(result.source).toBe("legacy-slug");
  });

  it('uses "global" scope when projectId missing', () => {
    const result = resolveCanonicalNodeId({
      tempId: "n1",
      title: "Login",
      kind: "element",
    });
    expect(result.canonicalId).toBe("element:global:login");
  });
});

describe("detectCanonicalConflicts", () => {
  it("returns empty when ids are unique or share kind", () => {
    const conflicts = detectCanonicalConflicts([
      {
        canonicalId: "capability:auth-login",
        resolvedKind: "capability",
        source: "frontmatter-id",
        sourceTempId: "n1",
      },
      {
        canonicalId: "element:login-action",
        resolvedKind: "element",
        source: "frontmatter-id",
        sourceTempId: "n2",
      },
    ]);
    expect(conflicts).toEqual([]);
  });

  it("flags id used by two different kinds", () => {
    const conflicts = detectCanonicalConflicts([
      {
        canonicalId: "capability:auth",
        resolvedKind: "capability",
        source: "frontmatter-id",
        sourceTempId: "n1",
      },
      {
        canonicalId: "domain:auth",
        resolvedKind: "domain",
        source: "frontmatter-id",
        sourceTempId: "n2",
      },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.canonicalId).toBe("auth");
    expect(conflicts[0]!.kinds).toEqual(["capability", "domain"]);
    expect(conflicts[0]!.sourceTempIds).toEqual(["n1", "n2"]);
  });
});

describe("createStubPlaceholder", () => {
  it("creates an unknown-kind stub with frontmatter type preserved", () => {
    const stub = createStubPlaceholder({
      targetId: "iam",
      declaredType: "depends_on",
      pendingFromId: "capability:auth-login",
      evidenceDocumentId: "doc-1",
    });
    expect(stub.id).toBe("unknown:iam");
    expect(stub.kind).toBe("unknown");
    expect(stub.title).toBe("iam");
    expect(stub.projectIds).toEqual([]);
    expect(stub.evidenceIds).toEqual(["doc-1"]);
    expect(stub.isStub).toBe(true);
    expect(stub.pendingType).toBe("depends_on");
    expect(stub.pendingFromId).toBe("capability:auth-login");
  });

  it("normalizes slug for the stub id", () => {
    const stub = createStubPlaceholder({
      targetId: "Iam Service!",
      declaredType: "uses",
      pendingFromId: "element:login-action",
      evidenceDocumentId: "doc-1",
    });
    expect(stub.id).toBe("unknown:iam-service");
    // title 은 원본 보존 — 검수자가 promote 시 갱신.
    expect(stub.title).toBe("Iam Service!");
  });
});

describe("mergeStubPlaceholders", () => {
  it("merges duplicate stubs into one + accumulates evidenceIds", () => {
    const a = createStubPlaceholder({
      targetId: "iam",
      declaredType: "depends_on",
      pendingFromId: "capability:auth-login",
      evidenceDocumentId: "doc-1",
    });
    const b = createStubPlaceholder({
      targetId: "iam",
      declaredType: "uses",
      pendingFromId: "element:login-action",
      evidenceDocumentId: "doc-2",
    });
    const merged = mergeStubPlaceholders([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.evidenceIds.sort()).toEqual(["doc-1", "doc-2"]);
    // pendingType / pendingFromId 는 첫 stub 의 값 유지 (검수자가 정정)
    expect(merged[0]!.pendingType).toBe("depends_on");
  });

  it("dedupes evidenceIds when same doc creates the stub twice", () => {
    const a = createStubPlaceholder({
      targetId: "iam",
      declaredType: "depends_on",
      pendingFromId: "capability:a",
      evidenceDocumentId: "doc-1",
    });
    const b = createStubPlaceholder({
      targetId: "iam",
      declaredType: "depends_on",
      pendingFromId: "capability:b",
      evidenceDocumentId: "doc-1",
    });
    const merged = mergeStubPlaceholders([a, b]);
    expect(merged[0]!.evidenceIds).toEqual(["doc-1"]);
  });

  it("keeps distinct stubs separate", () => {
    const a = createStubPlaceholder({
      targetId: "iam",
      declaredType: "depends_on",
      pendingFromId: "x",
      evidenceDocumentId: "doc-1",
    });
    const b = createStubPlaceholder({
      targetId: "billing",
      declaredType: "uses",
      pendingFromId: "y",
      evidenceDocumentId: "doc-2",
    });
    const merged = mergeStubPlaceholders([a, b]);
    expect(merged).toHaveLength(2);
  });
});
