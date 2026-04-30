import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { fromFirestoreKnowledgeJob } from "./mapper";

describe("knowledge job mapper", () => {
  it("maps firestore data into a KnowledgeJob", () => {
    const now = new Date("2026-04-17T11:00:00Z");
    const ts = Timestamp.fromDate(now);

    const result = fromFirestoreKnowledgeJob("job-1", {
      documentId: "auth",
      documentVersionId: "auth-v1",
      extractorVersion: "gemini-v1",
      idempotencyKey: "auth-v1:gemini-v1",
      status: "failed",
      attemptCount: 1,
      maxAttempts: 3,
      retryable: true,
      nextAttemptAt: ts,
      generation: 2,
      errorCode: "provider_error",
      errorMessage: "boom",
      createdAt: ts,
      updatedAt: ts,
      requestedBy: "admin@aslan.dev",
    });

    expect(result.status).toBe("failed");
    expect(result.nextAttemptAt).toEqual(now);
    expect(result.errorCode).toBe("provider_error");
  });
});

