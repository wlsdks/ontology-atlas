import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  fromFirestoreKnowledgeDocument,
  toFirestoreKnowledgeDocument,
  toKnowledgeDocumentMetadataInput,
} from "./mapper";

describe("knowledge document mapper", () => {
  it("maps firestore data into a KnowledgeDocument", () => {
    const now = new Date("2026-04-17T09:00:00Z");
    const ts = Timestamp.fromDate(now);

    const result = fromFirestoreKnowledgeDocument("auth-spec", {
      title: "Auth Spec",
      kind: "spec",
      projectIds: ["reactor"],
      sourceType: "upload",
      currentVersionId: "version-1",
      formatScore: 100,
      status: "ready",
      latestJobStatus: "failed",
      createdAt: ts,
      updatedAt: ts,
      createdBy: "admin@aslan.dev",
    });

    expect(result.id).toBe("auth-spec");
    expect(result.projectIds).toEqual(["reactor"]);
    expect(result.createdAt).toEqual(now);
  });

  it("omits undefined optional fields when serializing", () => {
    expect(
      toFirestoreKnowledgeDocument({
        title: "Auth Spec",
        kind: "spec",
        projectIds: ["reactor"],
        sourceType: "manual",
        currentVersionId: "version-1",
        status: "draft",
        createdBy: "admin@aslan.dev",
      }),
    ).toEqual({
      title: "Auth Spec",
      kind: "spec",
      projectIds: ["reactor"],
      sourceType: "manual",
      currentVersionId: "version-1",
      status: "draft",
      createdBy: "admin@aslan.dev",
    });
  });

  it("converts document metadata into a registration input shape", () => {
    expect(
      toKnowledgeDocumentMetadataInput({
        title: "Auth Spec",
        kind: "spec",
        projectIds: ["reactor"],
      }),
    ).toEqual({
      title: "Auth Spec",
      kind: "spec",
      projectIds: ["reactor"],
    });
  });
});

