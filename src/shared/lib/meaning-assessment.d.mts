export type MeaningCompetencyQuestionId =
  | "scope"
  | "domains"
  | "abilities"
  | "evidence"
  | "impact";

export interface MeaningCompetencyQuestionContract {
  readonly id: MeaningCompetencyQuestionId;
  readonly type: "scoping" | "validation" | "relationship";
  readonly question: string;
  readonly priority: "core";
  readonly requiredWitnesses: readonly ("concepts" | "relations" | "evidence" | "paths")[];
}

export const MEANING_ASSESSMENT_CONTRACT: "meaningAssessment:v1";
export const MEANING_COMPETENCY_CONTRACT: "meaningCompetency:v1";
export const MEANING_COMPETENCY_EVALUATOR: "meaningProposalValidator:v1";
export const MEANING_WITNESS_INVENTORY_CONTRACT: "meaningWitnessInventory:v1";
export const MEANING_COMPETENCY_QUESTIONS: readonly MeaningCompetencyQuestionContract[];

export interface MeaningCompetencyWitnesses {
  concepts: string[];
  relations: Array<{ from: string; to: string; type: string }>;
  evidence: string[];
  paths: string[];
}

export interface MeaningCompetencyReceipt {
  contract: typeof MEANING_COMPETENCY_CONTRACT;
  receiptVersion: 1;
  evaluator: typeof MEANING_COMPETENCY_EVALUATOR;
  graphHash: string;
  inventory: {
    contract: typeof MEANING_WITNESS_INVENTORY_CONTRACT;
    graphHash: string;
    sourceFingerprint: string;
    concepts: string[];
    relations: Array<{ from: string; to: string; type: string }>;
    evidence: string[];
    paths: string[];
  };
  questions: Array<{
    id: MeaningCompetencyQuestionId;
    status: "answered" | "partial" | "visible-gap";
    witnesses: MeaningCompetencyWitnesses;
    unresolvedWitnesses: string[];
  }>;
}

export type MeaningStructureStatus = "ready" | "needs_structure" | "invalid";
export type MeaningStructureInputStatus =
  | MeaningStructureStatus
  | "needs_attention"
  | "needs_shape"
  | "needs-links"
  | "needs-shape";
export type MeaningSourceStatus =
  | "not_measured"
  | "needs_evidence"
  | "review_required"
  | "invalid"
  | "verified_current";
export type MeaningSourceCurrentness = "current" | "stale" | "unavailable";
export type MeaningSourceGapId =
  | "source_unbound"
  | "multiple_active_sources"
  | "receipt_missing"
  | "receipt_malformed"
  | "source_role_evidence_missing"
  | "declared_source_path_missing"
  | "source_inventory_truncated"
  | "ontology_changed"
  | "source_changed";

export interface MeaningAssessmentInput {
  projectSlug: string;
  graphHash: string;
  structure: { status: MeaningStructureInputStatus };
  competency: MeaningCompetencyReceipt;
  source: {
    status: MeaningSourceStatus;
    currentness: MeaningSourceCurrentness;
    graphHash?: string | null;
    receiptContractVersion?: number | null;
    sourceId?: string | null;
    sourceRevision?: string | null;
    sourceFingerprint?: string | null;
    measuredAt?: string | null;
    topGapId?: MeaningSourceGapId | null;
    [key: string]: unknown;
  };
}

export interface MeaningAssessment {
  contract: "meaningAssessment:v1";
  projectSlug: string | null;
  status: "needs_evidence" | "review_required" | "invalid" | "verified_current";
  dimensions: {
    structure: { status: MeaningStructureStatus; basis: "structure_only" };
    competency: {
      status: "answered" | "needs_evidence";
      questions: Array<{
        id: MeaningCompetencyQuestionId;
        status: "answered" | "partial" | "visible-gap" | "unassessed";
        witnessStatus: "resolved" | "missing" | "unavailable";
      }>;
    };
    source: { status: MeaningSourceStatus; currentness: MeaningSourceCurrentness };
  };
  topGap: {
    dimension: "assessment" | "structure" | "competency" | "source";
    id: string;
    questionId?: MeaningCompetencyQuestionId;
  } | null;
  nextAction: { id: string; target?: string };
  provenance: {
    evaluator: "meaningAssessment:v1";
    graphHash: string | null;
    competencyContract: "meaningCompetency:v1" | null;
    competencyEvaluator: "meaningProposalValidator:v1" | null;
    competencyGraphHash: string | null;
    witnessInventoryContract: "meaningWitnessInventory:v1" | null;
    witnessInventoryGraphHash: string | null;
    witnessInventorySourceFingerprint: string | null;
    sourceGraphHash: string | null;
    sourceReceiptContractVersion: 1 | null;
    sourceId: string | null;
    sourceRevision: string | null;
    sourceFingerprint: string | null;
    sourceMeasuredAt: string | null;
    sourceGapId: MeaningSourceGapId | null;
  };
}

export function deriveMeaningAssessment(input: MeaningAssessmentInput): MeaningAssessment;
export function normalizeMeaningStructureStatus(value: unknown): MeaningStructureStatus;
