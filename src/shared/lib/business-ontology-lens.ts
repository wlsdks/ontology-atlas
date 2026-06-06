export type BusinessOntologyLensStep = "domain" | "capability" | "element";

export interface BusinessOntologyLens {
  policy: "business-first";
  readOrder: readonly BusinessOntologyLensStep[];
  guidance: readonly string[];
}

export const DEFAULT_BUSINESS_ONTOLOGY_LENS: BusinessOntologyLens = {
  policy: "business-first",
  readOrder: ["domain", "capability", "element"],
  guidance: [
    "Read business/product domains first, then capabilities, then implementation evidence.",
    "Do not treat paths, APIs, routes, or commands as the ontology root.",
  ],
};
