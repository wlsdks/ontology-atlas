import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OntologyOutputBadges } from "./OntologyOutputBadges";
import type { KnowledgeOutput } from "@/entities/knowledge-output";

function makeOutput(overrides: Partial<KnowledgeOutput> = {}): KnowledgeOutput {
  return {
    id: "out-1",
    jobId: "job-1",
    documentId: "doc-1",
    documentVersionId: "v-1",
    extractorVersion: "ontology-v1",
    provider: "anthropic",
    summary: "",
    nodeCount: 0,
    edgeCount: 0,
    warningCount: 0,
    nodes: [],
    edges: [],
    warnings: [],
    createdAt: new Date(),
    ...overrides,
  };
}

describe("OntologyOutputBadges — ontology output", () => {
  it("renders provider, grade, cap, usage, cost, latency for grade A", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({
          grade: "A",
          usage: { inputTokens: 1500, outputTokens: 300, estimatedCostUsd: 0.009 },
          latencyMs: 1800,
        })}
      />,
    );
    expect(screen.getByText("anthropic")).toBeInTheDocument();
    expect(screen.getByText("등급 A · 자동 승인 가능")).toBeInTheDocument();
    expect(screen.getByText("신뢰도 ≤ 1.00")).toBeInTheDocument();
    expect(screen.getByText("토큰 1,500/300")).toBeInTheDocument();
    expect(screen.getByText("비용 $0.009")).toBeInTheDocument();
    expect(screen.getByText("소요 1.8초")).toBeInTheDocument();
  });

  it("shows grade C cap below medium threshold", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({
          grade: "C",
          usage: { inputTokens: 100, outputTokens: 50 },
        })}
      />,
    );
    expect(screen.getByText("등급 C · 자동 반영 금지")).toBeInTheDocument();
    // C cap = 0.59 (CONFIDENCE_MEDIUM_THRESHOLD 0.6 - 0.01)
    expect(screen.getByText("신뢰도 ≤ 0.59")).toBeInTheDocument();
  });

  it("renders <$0.001 chip for very small cost", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({
          grade: "B",
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            estimatedCostUsd: 0.0001,
          },
        })}
      />,
    );
    expect(screen.getByText("비용 <$0.001")).toBeInTheDocument();
  });

  it("renders red drop chip when validationErrorCount > 0", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({
          grade: "B",
          validationErrorCount: 3,
        })}
      />,
    );
    expect(screen.getByText("검증 실패 3")).toBeInTheDocument();
  });

  it("hides drop chip when validationErrorCount is 0", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({
          grade: "A",
          validationErrorCount: 0,
        })}
      />,
    );
    expect(screen.queryByText(/^검증 실패 /)).not.toBeInTheDocument();
  });

  it("sets data-grade and data-provider attributes for testing / styling hooks", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({ grade: "B" })}
      />,
    );
    const wrapper = screen.getByTestId("ontology-output-badges");
    expect(wrapper.getAttribute("data-provider")).toBe("anthropic");
    expect(wrapper.getAttribute("data-grade")).toBe("B");
  });
});

describe("OntologyOutputBadges — density compact (UX-9)", () => {
  it("default density renders 11px chips", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({ grade: "A" })}
      />,
    );
    const wrapper = screen.getByTestId("ontology-output-badges");
    expect(wrapper.getAttribute("data-density")).toBe("default");
    const providerChip = screen.getByText("anthropic");
    expect(providerChip.className).toContain("text-[11px]");
    expect(providerChip.className).toContain("px-2");
  });

  it("compact density shrinks chip padding and font", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({ grade: "A" })}
        density="compact"
      />,
    );
    const wrapper = screen.getByTestId("ontology-output-badges");
    expect(wrapper.getAttribute("data-density")).toBe("compact");
    const providerChip = screen.getByText("anthropic");
    expect(providerChip.className).toContain("text-[10px]");
    expect(providerChip.className).toContain("px-1.5");
    expect(providerChip.className).not.toContain("text-[11px]");
  });

  it("compact density shrinks container gap", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({ grade: "B" })}
        density="compact"
      />,
    );
    const wrapper = screen.getByTestId("ontology-output-badges");
    expect(wrapper.className).toContain("gap-0.5");
  });

  it("compact density propagates to grade tone chip", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({ grade: "C" })}
        density="compact"
      />,
    );
    const gradeChip = screen.getByText("등급 C · 자동 반영 금지");
    expect(gradeChip.className).toContain("text-[10px]");
  });

  it("compact density propagates to validation error chip", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({ grade: "B", validationErrorCount: 2 })}
        density="compact"
      />,
    );
    const errChip = screen.getByText("검증 실패 2");
    expect(errChip.className).toContain("text-[10px]");
    expect(errChip.className).toContain("px-1.5");
  });

  it("layout=row + density=compact reduces row gap to gap-1", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({ grade: "A" })}
        layout="row"
        density="compact"
      />,
    );
    const wrapper = screen.getByTestId("ontology-output-badges");
    expect(wrapper.className).toContain("flex");
    expect(wrapper.className).toContain("gap-1");
    expect(wrapper.className).not.toContain("gap-1.5");
  });
});

describe("OntologyOutputBadges — legacy gemini / stub output", () => {
  it("only renders provider chip when grade and usage are missing", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({
          provider: "gemini",
          extractorVersion: "gemini-v1",
          grade: undefined,
          usage: undefined,
          latencyMs: undefined,
          validationErrorCount: undefined,
        })}
      />,
    );
    expect(screen.getByText("gemini")).toBeInTheDocument();
    expect(screen.queryByText(/^등급 /)).not.toBeInTheDocument();
    expect(screen.queryByText(/^신뢰도 /)).not.toBeInTheDocument();
    expect(screen.queryByText(/^토큰 /)).not.toBeInTheDocument();
  });

  it("renders unknown when provider is empty", () => {
    render(
      <OntologyOutputBadges
        output={makeOutput({ provider: "" })}
      />,
    );
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });
});
