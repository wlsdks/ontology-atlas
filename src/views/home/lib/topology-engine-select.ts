import type { TopologyAnalysisMode } from "../model/url-state";

/**
 * Which topology render engine `HomePage` should mount for its map/graph
 * canvas slot — the flag-gated strangler switch from
 * `docs/TOPOLOGY-V2-DESIGN.md` §1.2/§4 P2.
 *
 * Extracted into its own pure function (rather than inlined in the JSX
 * ternary) so the "flag off = zero behavior change" contract is a unit test,
 * not a manual read of a 2000-line component. When `v2Enabled` is false,
 * `selectTopologyEngine` reduces to exactly the pre-existing condition that
 * chose between `TopologyMapCanvas` and `SigmaTopology` — see
 * `topology-engine-select.test.ts`'s parity assertions.
 */
export interface TopologyEngineSelectInput {
  /** `isTopologyMapV2Enabled()` result. */
  v2Enabled: boolean;
  analysisMode: TopologyAnalysisMode;
  /** `localGraphRoot === null` — true at the ontology root, false once a project's local ego graph is open. */
  isAtLocalGraphRoot: boolean;
  /** `topologySkeleton != null` — the map-canvas skeleton layout is ready. */
  hasTopologySkeleton: boolean;
  /** `ontologyInsight != null` — the derived ontology graph is ready. */
  hasOntologyInsight: boolean;
}

export type TopologyEngineChoice = "map-v2" | "map-canvas" | "sigma";

/**
 * `v2Enabled` always wins when true — `docs/TOPOLOGY-V2-DESIGN.md` §1.2
 * unifies the map tab, graph tab, and project-detail neighbor map behind
 * one engine, so none of the other inputs matter once the flag is on.
 *
 * When `v2Enabled` is false, this is exactly today's pre-v2 condition:
 * `TopologyMapCanvas` when not on the graph tab, at the ontology root, and
 * both the skeleton layout and ontology insight are ready; `SigmaTopology`
 * otherwise. (The caller is still responsible for the outer
 * `topologyRenderState.renderCanvas` gate — this function only decides
 * *which* engine, not *whether* to render at all.)
 */
export function selectTopologyEngine(
  input: TopologyEngineSelectInput,
): TopologyEngineChoice {
  if (input.v2Enabled) return "map-v2";

  const canUseMapCanvas =
    input.analysisMode !== "graph" &&
    input.isAtLocalGraphRoot &&
    input.hasTopologySkeleton &&
    input.hasOntologyInsight;

  return canUseMapCanvas ? "map-canvas" : "sigma";
}
