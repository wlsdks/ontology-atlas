import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import type { WorldNodeKind } from "./topology-world";

export function radiusForKind(kind: WorldNodeKind, tokens: OntologyMapTokens): number {
  if (kind === "project") return tokens.radiusProject;
  if (kind === "domain") return tokens.radiusDomain;
  if (kind === "capability") return tokens.radiusCapability;
  return tokens.radiusElement;
}
