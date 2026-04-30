import { describe, expect, it } from "vitest";
import {
  buildKnowledgeVersionMarkdownDiff,
  buildKnowledgeVersionMetadataDiff,
  createKnowledgeVersionRecord,
} from "./record";

describe("createKnowledgeVersionRecord", () => {
  it("builds a persisted version record with hash and size", () => {
    const record = createKnowledgeVersionRecord({
      id: "auth-v1",
      documentId: "auth",
      createdBy: "admin@aslan.dev",
      storagePath: "knowledge-documents/auth/auth-v1.md",
      markdown: "# Auth",
      frontmatter: { title: "Auth Spec" },
      metadata: {
        title: "Auth Spec",
        kind: "spec",
        projectIds: ["reactor"],
        source: "frontmatter",
      },
    });

    expect(record.hash).toMatch(/^kv-/);
    expect(record.sizeBytes).toBeGreaterThan(0);
    expect(record.title).toBe("Auth Spec");
  });
});

describe("knowledge version diff builders", () => {
  const currentVersion = {
    id: "v1",
    documentId: "auth",
    title: "Auth Spec",
    kind: "spec",
    projectIds: ["reactor"],
    frontmatter: {},
    storagePath: "knowledge-documents/auth/v1.md",
    mimeType: "text/markdown",
    sizeBytes: 10,
    hash: "kv-a",
    createdAt: new Date("2026-04-17T10:00:00Z"),
    createdBy: "admin@aslan.dev",
  };

  const selectedVersion = {
    ...currentVersion,
    id: "v2",
    kind: "proposal",
    projectIds: ["reactor", "iam"],
    hash: "kv-b",
  };

  it("reports metadata changes field-by-field", () => {
    const diff = buildKnowledgeVersionMetadataDiff({
      currentVersion,
      selectedVersion,
    });

    expect(diff.find((item) => item.field === "title")?.changed).toBe(false);
    expect(diff.find((item) => item.field === "kind")?.changed).toBe(true);
    expect(diff.find((item) => item.field === "projectIds")?.changed).toBe(true);
  });

  it("reports markdown change summary", () => {
    expect(
      buildKnowledgeVersionMarkdownDiff({
        currentVersion,
        selectedVersion,
        currentMarkdown: "# Auth\nbody",
        selectedMarkdown: "# Auth\nbody\nnew",
      }),
    ).toEqual({
      hasChanges: true,
      currentLineCount: 2,
      selectedLineCount: 3,
      currentCharCount: "# Auth\nbody".length,
      selectedCharCount: "# Auth\nbody\nnew".length,
    });
  });
});
