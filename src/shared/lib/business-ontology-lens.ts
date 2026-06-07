export type BusinessOntologyLensStep = "outcome" | "domain" | "capability" | "element";

export interface BusinessOntologyLens {
  policy: "business-first";
  readOrder: readonly BusinessOntologyLensStep[];
  guidance: readonly string[];
  decisionQuestions: readonly string[];
}

export const BUSINESS_ONTOLOGY_READ_ORDER_PROOF = "outcome>domain>capability>element";

export const DEFAULT_BUSINESS_ONTOLOGY_LENS: BusinessOntologyLens = {
  policy: "business-first",
  readOrder: ["outcome", "domain", "capability", "element"],
  guidance: [
    "Read the business outcome first, then business/product domains, capabilities, and implementation evidence.",
    "Do not treat paths, APIs, routes, or commands as the ontology root.",
  ],
  decisionQuestions: [
    "What business outcome should this ontology explain or improve?",
    "Which business/product domain boundary does this code change?",
    "What capability claim can a planner, marketer, or leader discuss?",
    "Which implementation evidence proves or disproves that capability?",
  ],
};
