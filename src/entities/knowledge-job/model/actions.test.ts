import { describe, expect, it } from "vitest";
import { resolveKnowledgeJobActionState } from "./actions";

describe("resolveKnowledgeJobActionState", () => {
  it("enables retry only for failed jobs", () => {
    expect(resolveKnowledgeJobActionState("failed").canRetry).toBe(true);
    expect(resolveKnowledgeJobActionState("queued").canRetry).toBe(false);
  });

  it("enables result viewing only for succeeded jobs", () => {
    expect(resolveKnowledgeJobActionState("succeeded").canViewResult).toBe(true);
    expect(resolveKnowledgeJobActionState("processing").canViewResult).toBe(
      false,
    );
  });

  it("opens replacement only for superseded jobs", () => {
    expect(
      resolveKnowledgeJobActionState("superseded").canOpenReplacement,
    ).toBe(true);
  });
});

