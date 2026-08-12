export type ConstructionEnvelopeState =
  | "ready"
  | "malformed"
  | "project_mismatch"
  | "digest_mismatch"
  | "plan_mismatch";

export type ConstructionPlanEquality = "equal" | "write_not_available";

export interface ConstructionReviewSignals {
  readonly red: number;
  readonly unknown: number;
  readonly conflict: number;
}

export interface ConstructionHumanApproval {
  readonly decision: string;
  readonly decidedBy: string;
  readonly authority: string;
  readonly decidedAt: string | null;
}

export interface ConstructionPlanCounts {
  readonly concepts: number;
  readonly relations: number;
  readonly competencies: number;
}

export interface ConstructionPostWriteMaintenance {
  readonly status: string;
  readonly blocker: string | null;
  readonly nextAction: string | null;
  readonly boundary: string | null;
}

/**
 * Read-only projection of existing MCP artifacts.
 *
 * This is not a second qualification result and it is never persisted. The UI
 * keeps the original packet and analyzer rows so an expert can inspect exactly
 * what the existing validators returned.
 */
export interface ConstructionReviewProjection {
  readonly envelopeState: "ready";
  readonly projectSlug: string;
  readonly purposeOutcome: string;
  readonly qualificationStatus: string;
  readonly writeEligibility: string;
  readonly planEquality: ConstructionPlanEquality;
  readonly firstBlocker: string | null;
  readonly firstDiagnostic: string | null;
  readonly currentDecision: string;
  readonly nextDecision: string;
  readonly humanApproval: ConstructionHumanApproval;
  readonly planCounts: ConstructionPlanCounts;
  readonly signals: ConstructionReviewSignals;
  readonly postWriteMaintenance: ConstructionPostWriteMaintenance | null;
  readonly planDigest: string;
  readonly sourceDigest: string;
  readonly qualification: Readonly<Record<string, unknown>>;
  readonly lifecycle: Readonly<Record<string, unknown>>;
  readonly reviewPlan: Readonly<Record<string, unknown>>;
  readonly writePlan: Readonly<Record<string, unknown>> | null;
}

export type ConstructionReviewParseResult =
  | { readonly ok: true; readonly value: ConstructionReviewProjection }
  | {
      readonly ok: false;
      readonly state: Exclude<ConstructionEnvelopeState, "ready">;
      readonly issues: readonly string[];
    };
