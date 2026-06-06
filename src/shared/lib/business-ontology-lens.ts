export type BusinessOntologyLensStep = "domain" | "capability" | "element";

export interface BusinessOntologyLens {
  policy: "business-first";
  readOrder: readonly BusinessOntologyLensStep[];
  guidance: readonly string[];
  decisionQuestions: readonly string[];
}

export const DEFAULT_BUSINESS_ONTOLOGY_LENS: BusinessOntologyLens = {
  policy: "business-first",
  readOrder: ["domain", "capability", "element"],
  guidance: [
    "Read business/product domains first, then capabilities, then implementation evidence.",
    "Do not treat paths, APIs, routes, or commands as the ontology root.",
  ],
  decisionQuestions: [
    "Which business/product domain boundary does this code change?",
    "What capability claim can a planner, marketer, or leader discuss?",
    "Which implementation evidence proves or disproves that capability?",
  ],
};
