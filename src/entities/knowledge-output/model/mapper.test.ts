import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { fromFirestoreKnowledgeOutput } from "./mapper";

describe("knowledge output mapper", () => {
  it("maps firestore output documents into a summarized output model", () => {
    const now = new Date("2026-04-17T10:00:00Z");
    const result = fromFirestoreKnowledgeOutput("output-1", {
      jobId: "job-1",
      documentId: "doc-1",
      documentVersionId: "doc-1-v1",
      extractorVersion: "gemini-v1",
      provider: "stub",
      summary: "summary text",
      nodes: [
        {
          tempId: "n1",
          title: "문서",
          kind: "document",
          projectIds: ["reactor"],
          summary: "요약",
          confidence: 1,
          warnings: [],
        },
        {
          tempId: "n2",
          title: "IAM",
          kind: "project",
          projectIds: ["iam"],
          summary: "프로젝트 후보",
          confidence: 0.82,
          warnings: ["임시 추출기 사용"],
        },
      ],
      edges: [
        {
          tempId: "e1",
          fromTempId: "n1",
          toTempId: "n2",
          type: "references_project",
          label: "연결 프로젝트",
          confidence: 0.82,
        },
      ],
      warnings: ["warn-1"],
      createdAt: Timestamp.fromDate(now),
    });

    expect(result).toEqual({
      id: "output-1",
      jobId: "job-1",
      documentId: "doc-1",
      documentVersionId: "doc-1-v1",
      extractorVersion: "gemini-v1",
      provider: "stub",
      summary: "summary text",
      nodeCount: 2,
      edgeCount: 1,
      warningCount: 1,
      nodes: [
        {
          tempId: "n1",
          title: "문서",
          kind: "document",
          projectIds: ["reactor"],
          summary: "요약",
          confidence: 1,
          warnings: [],
        },
        {
          tempId: "n2",
          title: "IAM",
          kind: "project",
          projectIds: ["iam"],
          summary: "프로젝트 후보",
          confidence: 0.82,
          warnings: ["임시 추출기 사용"],
        },
      ],
      edges: [
        {
          tempId: "e1",
          fromTempId: "n1",
          toTempId: "n2",
          type: "references_project",
          label: "연결 프로젝트",
          confidence: 0.82,
        },
      ],
      warnings: ["warn-1"],
      createdAt: now,
    });
  });

  it("maps ontology extraction outputs with grade / usage / latencyMs / validationErrorCount", () => {
    const now = new Date("2026-04-27T01:00:00Z");
    const result = fromFirestoreKnowledgeOutput("output-ont-1", {
      jobId: "job-1",
      documentId: "doc-1",
      documentVersionId: "v-1",
      extractorVersion: "ontology-v1",
      provider: "anthropic",
      summary: "ontology summary",
      nodes: [],
      edges: [],
      warnings: [],
      grade: "A",
      usage: {
        inputTokens: 1500,
        outputTokens: 300,
        estimatedCostUsd: 0.009,
      },
      latencyMs: 1800,
      validationErrorCount: 0,
      createdAt: Timestamp.fromDate(now),
    });

    expect(result.provider).toBe("anthropic");
    expect(result.grade).toBe("A");
    expect(result.usage).toEqual({
      inputTokens: 1500,
      outputTokens: 300,
      estimatedCostUsd: 0.009,
    });
    expect(result.latencyMs).toBe(1800);
    expect(result.validationErrorCount).toBe(0);
  });

  it("ignores invalid grade and missing usage gracefully", () => {
    const result = fromFirestoreKnowledgeOutput("output-ont-2", {
      jobId: "job-1",
      documentId: "doc-1",
      documentVersionId: "v-1",
      extractorVersion: "ontology-v1",
      provider: "anthropic",
      summary: "",
      nodes: [],
      edges: [],
      warnings: [],
      grade: "Z", // invalid — ignored
      // usage missing — ignored
      latencyMs: "not-a-number", // ignored
      validationErrorCount: NaN, // ignored
      createdAt: Timestamp.fromDate(new Date()),
    });
    expect(result.grade).toBeUndefined();
    expect(result.usage).toBeUndefined();
    expect(result.latencyMs).toBeUndefined();
    expect(result.validationErrorCount).toBeUndefined();
  });

  it("legacy gemini output (no grade / usage) leaves them undefined", () => {
    const result = fromFirestoreKnowledgeOutput("output-leg", {
      jobId: "job-x",
      documentId: "doc-x",
      documentVersionId: "v-x",
      extractorVersion: "gemini-v1",
      provider: "gemini",
      summary: "legacy",
      nodes: [],
      edges: [],
      warnings: [],
      createdAt: Timestamp.fromDate(new Date()),
    });
    expect(result.grade).toBeUndefined();
    expect(result.usage).toBeUndefined();
    expect(result.latencyMs).toBeUndefined();
    expect(result.validationErrorCount).toBeUndefined();
  });
});
