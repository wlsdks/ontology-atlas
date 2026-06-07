export type BusinessOntologyLensStep = "outcome" | "domain" | "capability" | "element";

export interface BusinessOntologyLens {
  policy: "business-first";
  readOrder: readonly BusinessOntologyLensStep[];
  guidance: readonly string[];
  decisionQuestions: readonly string[];
  decisionAnswerCriteria: readonly string[];
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
  decisionAnswerCriteria: [
    "Accept only if the answer names the outcome, cites facets plus domain_matrix pressure, and states the changed decision.",
    "Accept only if the answer names the boundary, reports match_nodes totals plus followUp, and cites coupling evidence.",
    "Accept only if the answer writes the human capability claim first, then cites capability scan evidence before implementation proof.",
    "Accept only if the answer lists capability -> element proof rows with followUp evidence and a proves/disproves/needs review verdict.",
  ],
};
