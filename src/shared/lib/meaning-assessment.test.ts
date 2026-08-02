import { describe, expect, it } from "vitest";

import {
  MEANING_COMPETENCY_CONTRACT,
  MEANING_COMPETENCY_EVALUATOR,
  MEANING_WITNESS_INVENTORY_CONTRACT,
  deriveMeaningAssessment,
  normalizeMeaningStructureStatus,
  type MeaningAssessmentInput,
  type MeaningCompetencyReceipt,
} from "./meaning-assessment.mjs";

const CURRENT_GRAPH = "project-graph-v1:a1b2c3d4";
const CHANGED_GRAPH = "project-graph-v1:b2c3d4e5";

const emptyWitnesses = () => ({ concepts: [], relations: [], evidence: [], paths: [] });

const answeredCompetency = (): MeaningCompetencyReceipt => ({
  contract: MEANING_COMPETENCY_CONTRACT,
  receiptVersion: 1,
  evaluator: MEANING_COMPETENCY_EVALUATOR,
  graphHash: CURRENT_GRAPH,
  inventory: {
    contract: MEANING_WITNESS_INVENTORY_CONTRACT,
    graphHash: CURRENT_GRAPH,
    sourceFingerprint: "git:abc123:clean",
    concepts: [
      "sample-product",
      "domains/orders",
      "capabilities/checkout",
      "capabilities/inventory",
    ],
    relations: [
      { from: "sample-product", to: "domains/orders", type: "domains" },
      { from: "domains/orders", to: "capabilities/checkout", type: "capabilities" },
      { from: "capabilities/checkout", to: "capabilities/inventory", type: "depends_on" },
    ],
    evidence: ["README.md", "docs/PRODUCT.md", "src/checkout.ts"],
    paths: ["src/checkout.ts"],
  },
  questions: [
    {
      id: "scope",
      status: "answered",
      witnesses: {
        ...emptyWitnesses(),
        concepts: ["sample-product"],
        evidence: ["README.md"],
      },
      unresolvedWitnesses: [],
    },
    {
      id: "domains",
      status: "answered",
      witnesses: {
        ...emptyWitnesses(),
        concepts: ["domains/orders"],
        relations: [{ from: "sample-product", to: "domains/orders", type: "domains" }],
        evidence: ["docs/PRODUCT.md"],
      },
      unresolvedWitnesses: [],
    },
    {
      id: "abilities",
      status: "answered",
      witnesses: {
        ...emptyWitnesses(),
        concepts: ["capabilities/checkout"],
        relations: [{ from: "domains/orders", to: "capabilities/checkout", type: "capabilities" }],
        evidence: ["src/checkout.ts"],
      },
      unresolvedWitnesses: [],
    },
    {
      id: "evidence",
      status: "answered",
      witnesses: {
        ...emptyWitnesses(),
        concepts: ["capabilities/checkout"],
        evidence: ["src/checkout.ts"],
        paths: ["src/checkout.ts"],
      },
      unresolvedWitnesses: [],
    },
    {
      id: "impact",
      status: "answered",
      witnesses: {
        ...emptyWitnesses(),
        concepts: ["capabilities/checkout", "capabilities/inventory"],
        relations: [{
          from: "capabilities/checkout",
          to: "capabilities/inventory",
          type: "depends_on",
        }],
        evidence: ["src/checkout.ts"],
      },
      unresolvedWitnesses: [],
    },
  ],
});

const sourceReceipt = (): MeaningAssessmentInput["source"] => ({
  status: "verified_current",
  currentness: "current",
  graphHash: CURRENT_GRAPH,
  receiptContractVersion: 1,
  sourceId: "source-sample",
  sourceRevision: "abc123",
  sourceFingerprint: "git:abc123:clean",
  measuredAt: "2026-08-02T06:38:07.944Z",
  topGapId: null,
});

const input = (
  overrides: Partial<MeaningAssessmentInput> = {},
): MeaningAssessmentInput => ({
  projectSlug: "sample-product",
  graphHash: CURRENT_GRAPH,
  structure: { status: "ready" },
  competency: answeredCompetency(),
  source: sourceReceipt(),
  ...overrides,
});

describe("meaningAssessment:v1", () => {
  it("verifies only versioned typed witnesses bound to the current graph and source", () => {
    const result = deriveMeaningAssessment(input());

    expect(result).toMatchObject({
      contract: "meaningAssessment:v1",
      projectSlug: "sample-product",
      status: "verified_current",
      dimensions: {
        structure: { status: "ready", basis: "structure_only" },
        competency: { status: "answered" },
        source: { status: "verified_current", currentness: "current" },
      },
      topGap: null,
      nextAction: { id: "use_current_evidence" },
      provenance: {
        evaluator: "meaningAssessment:v1",
        graphHash: CURRENT_GRAPH,
        competencyContract: MEANING_COMPETENCY_CONTRACT,
        competencyEvaluator: MEANING_COMPETENCY_EVALUATOR,
        competencyGraphHash: CURRENT_GRAPH,
        witnessInventoryContract: MEANING_WITNESS_INVENTORY_CONTRACT,
        witnessInventoryGraphHash: CURRENT_GRAPH,
        witnessInventorySourceFingerprint: "git:abc123:clean",
        sourceGraphHash: CURRENT_GRAPH,
        sourceReceiptContractVersion: 1,
        sourceId: "source-sample",
        sourceRevision: "abc123",
        sourceFingerprint: "git:abc123:clean",
        sourceMeasuredAt: "2026-08-02T06:38:07.944Z",
      },
    });
    expect(result.dimensions.competency.questions).toHaveLength(5);
  });

  it("derives missing witness state instead of trusting an answered flag", () => {
    const competency = answeredCompetency();
    competency.questions[0] = {
      id: "scope",
      status: "answered",
      witnesses: emptyWitnesses(),
      unresolvedWitnesses: [],
    };
    const result = deriveMeaningAssessment(input({ competency }));

    expect(result).toMatchObject({
      status: "needs_evidence",
      dimensions: {
        structure: { status: "ready" },
        competency: { status: "needs_evidence" },
      },
      topGap: {
        dimension: "competency",
        id: "competency_question_incomplete",
        questionId: "scope",
      },
      nextAction: { id: "resolve_competency_question", target: "scope" },
    });
    expect(result.dimensions.competency.questions[0]).toEqual({
      id: "scope",
      status: "answered",
      witnessStatus: "missing",
    });
  });

  it("rejects typed witness strings that do not resolve in the current inventory", () => {
    const competency = answeredCompetency();
    competency.questions[0] = {
      id: "scope",
      status: "answered",
      witnesses: {
        ...emptyWitnesses(),
        concepts: ["ghost-concept"],
        evidence: ["missing/claim.md"],
      },
      unresolvedWitnesses: [],
    };
    const result = deriveMeaningAssessment(input({ competency }));

    expect(result).toMatchObject({
      status: "needs_evidence",
      topGap: {
        dimension: "competency",
        id: "competency_question_incomplete",
        questionId: "scope",
      },
    });
    expect(result.dimensions.competency.questions[0]?.witnessStatus).toBe("missing");
  });

  it("keeps stale source review ahead of a competency gap and preserves the cause", () => {
    const competency = answeredCompetency();
    competency.questions[0] = {
      id: "scope",
      status: "visible-gap",
      witnesses: emptyWitnesses(),
      unresolvedWitnesses: ["scope-evidence-unresolved"],
    };
    const result = deriveMeaningAssessment(input({
      competency,
      source: {
        ...sourceReceipt(),
        status: "review_required",
        currentness: "stale",
        topGapId: "source_changed",
      },
    }));

    expect(result).toMatchObject({
      status: "review_required",
      topGap: { dimension: "source", id: "source_changed" },
      nextAction: { id: "remeasure_source" },
    });
  });

  it("requires review when the ontology graph changed after either receipt", () => {
    const result = deriveMeaningAssessment(input({ graphHash: CHANGED_GRAPH }));

    expect(result).toMatchObject({
      status: "review_required",
      topGap: { dimension: "source", id: "ontology_changed" },
      nextAction: { id: "remeasure_source" },
      provenance: {
        graphHash: CHANGED_GRAPH,
        sourceGraphHash: CURRENT_GRAPH,
      },
    });
  });

  it("requires review when competency evidence belongs to an older graph", () => {
    const competency = answeredCompetency();
    competency.graphHash = CHANGED_GRAPH;
    const result = deriveMeaningAssessment(input({ competency }));

    expect(result).toMatchObject({
      status: "review_required",
      topGap: { dimension: "competency", id: "competency_ontology_changed" },
      nextAction: { id: "reevaluate_competency" },
      provenance: { competencyGraphHash: CHANGED_GRAPH },
    });
  });

  it("does not restamp a hidden source as current or leak private coordinates", () => {
    const result = deriveMeaningAssessment(input({
      source: {
        ...sourceReceipt(),
        currentness: "unavailable",
        rootPath: "/private/work/sample-product",
        remote: "git@example.invalid:private/sample-product.git",
      },
    }));
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      status: "review_required",
      dimensions: {
        source: { status: "verified_current", currentness: "unavailable" },
      },
      topGap: { dimension: "source", id: "source_currentness_unavailable" },
      nextAction: { id: "verify_source_currentness" },
    });
    expect(serialized).not.toContain("/private/work");
    expect(serialized).not.toContain("git@");
  });

  it("fails closed on unsupported source receipt versions", () => {
    const result = deriveMeaningAssessment(input({
      source: { ...sourceReceipt(), receiptContractVersion: 999 },
    }));

    expect(result).toMatchObject({
      status: "invalid",
      topGap: { dimension: "assessment", id: "assessment_input_invalid" },
      nextAction: { id: "repair_assessment_input" },
    });
  });

  it("rejects a verified source receipt that still declares a gap", () => {
    const result = deriveMeaningAssessment(input({
      source: { ...sourceReceipt(), topGapId: "source_role_evidence_missing" },
    }));

    expect(result).toMatchObject({
      status: "invalid",
      topGap: { dimension: "assessment", id: "assessment_input_invalid" },
    });
    expect(result.provenance.sourceGapId).toBe("source_role_evidence_missing");
  });

  it("sanitizes invalid slug and hash fields instead of echoing path-shaped input", () => {
    const result = deriveMeaningAssessment(input({
      projectSlug: "/private/work/sample-product",
      graphHash: "/private/work/graph",
    }));
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      projectSlug: null,
      status: "invalid",
      provenance: { graphHash: null },
    });
    expect(serialized).not.toContain("/private/work");
  });

  it("accepts traversal-safe vault-relative and localized project slugs", () => {
    const nested = deriveMeaningAssessment(input({ projectSlug: "projects/sample" }));
    const localized = deriveMeaningAssessment(input({ projectSlug: "프로젝트/샘플" }));
    const spaced = deriveMeaningAssessment(input({ projectSlug: "projects/My App" }));

    expect(nested).toMatchObject({ projectSlug: "projects/sample", status: "verified_current" });
    expect(localized).toMatchObject({ projectSlug: "프로젝트/샘플", status: "verified_current" });
    expect(spaced).toMatchObject({ projectSlug: "projects/My App", status: "verified_current" });
  });

  it("normalizes both MCP and web negative readiness vocabulary", () => {
    expect(normalizeMeaningStructureStatus("needs_attention")).toBe("needs_structure");
    expect(normalizeMeaningStructureStatus("needs_shape")).toBe("needs_structure");
    expect(normalizeMeaningStructureStatus("needs-links")).toBe("needs_structure");
    expect(normalizeMeaningStructureStatus("needs-shape")).toBe("needs_structure");
    expect(normalizeMeaningStructureStatus("unknown")).toBe("invalid");

    const result = deriveMeaningAssessment(input({ structure: { status: "needs_attention" } }));
    expect(result).toMatchObject({
      status: "needs_evidence",
      dimensions: { structure: { status: "needs_structure" } },
      topGap: { dimension: "structure", id: "structure_not_ready" },
    });
  });

  it("rejects unknown structure vocabulary and keeps quality output categorical", () => {
    const invalid = deriveMeaningAssessment(input({ structure: { status: "raedy" as "ready" } }));
    const current = deriveMeaningAssessment(input());

    expect(invalid.status).toBe("invalid");
    for (const result of [invalid, current]) {
      expect(result.provenance.evaluator).toBe("meaningAssessment:v1");
      expect(JSON.stringify(result)).not.toMatch(/confidence|percentage|percent|score|ratio/i);
    }
  });
});
