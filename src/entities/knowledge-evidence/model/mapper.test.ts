import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { fromFirestoreKnowledgeEvidence } from "./mapper";

describe("knowledge evidence mapper", () => {
  it("maps firestore evidence documents into a typed model", () => {
    const now = new Date("2026-04-17T10:15:00Z");
    const result = fromFirestoreKnowledgeEvidence("evidence-1", {
      documentId: "doc-1",
      documentVersionId: "doc-1-v1",
      versionHash: "hash-1",
      chunkId: "chunk-1",
      chunkHash: "chunk-hash-1",
      charStart: 0,
      charEnd: 42,
      excerpt: "# Heading",
      locatorVersion: "v1",
      extractorVersion: "gemini-v1",
      sourceOutputId: "output-1",
      createdAt: Timestamp.fromDate(now),
    });

    expect(result).toEqual({
      id: "evidence-1",
      documentId: "doc-1",
      documentVersionId: "doc-1-v1",
      versionHash: "hash-1",
      chunkId: "chunk-1",
      chunkHash: "chunk-hash-1",
      charStart: 0,
      charEnd: 42,
      excerpt: "# Heading",
      locatorVersion: "v1",
      extractorVersion: "gemini-v1",
      sourceOutputId: "output-1",
      createdAt: now,
    });
  });
});
