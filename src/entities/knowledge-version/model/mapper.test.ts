import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  fromFirestoreKnowledgeVersion,
  toFirestoreKnowledgeVersion,
} from "./mapper";

describe("knowledge version mapper", () => {
  it("maps firestore data into a KnowledgeVersion", () => {
    const now = new Date("2026-04-17T10:00:00Z");
    const ts = Timestamp.fromDate(now);

    const result = fromFirestoreKnowledgeVersion("auth-v1", {
      documentId: "auth",
      title: "Auth Spec",
      kind: "spec",
      projectIds: ["reactor"],
      frontmatter: { title: "Auth Spec" },
      storagePath: "knowledge-documents/auth/auth-v1.md",
      mimeType: "text/markdown",
      sizeBytes: 120,
      hash: "kv-123",
      createdAt: ts,
      createdBy: "admin@aslan.dev",
    });

    expect(result.documentId).toBe("auth");
    expect(result.createdAt).toEqual(now);
  });

  it("serializes a version without createdAt", () => {
    expect(
      toFirestoreKnowledgeVersion({
        documentId: "auth",
        title: "Auth Spec",
        kind: "spec",
        projectIds: ["reactor"],
        frontmatter: {},
        storagePath: "knowledge-documents/auth/auth-v1.md",
        mimeType: "text/markdown",
        sizeBytes: 120,
        hash: "kv-123",
        createdBy: "admin@aslan.dev",
      }),
    ).toEqual({
      documentId: "auth",
      title: "Auth Spec",
      kind: "spec",
      projectIds: ["reactor"],
      frontmatter: {},
      storagePath: "knowledge-documents/auth/auth-v1.md",
      mimeType: "text/markdown",
      sizeBytes: 120,
      hash: "kv-123",
      createdBy: "admin@aslan.dev",
    });
  });
});
