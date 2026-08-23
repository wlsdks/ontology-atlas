export interface ViewportReframeState {
  /** Was the last camera movement directly created by the user, such as map pan, wheel, or pinch? */
  userDriven: boolean;
  /** Is the currently rendered 3D dome runtime active? */
  domeActive: boolean;
  /** Has a single node been selected, making that node's ego the current reading target? */
  focused: boolean;
  /** Are both endpoints of an edge selected, requiring preservation of the existing camera context? */
  pairFocused: boolean;
  /** Is region expansion in progress or active? */
  realmActive: boolean;
  /** Is there an explicit node-set lens, such as recent changes, path, or full expand? */
  spotlightActive: boolean;
}

export type ViewportReframeMode =
  | "preserve"
  | "dome-focus"
  | "dome-overview"
  | "focus"
  | "realm"
  | "spotlight"
  | "overview";

/**
 * Determines which camera meaning to recompute after the map viewport settles.
 *
 * A panel width change is not a simple resize. Even on the same screen, the selected node, region,
 * and path lenses each own a different "what is currently being viewed". If this priority is not
 * centralized here, opening the agent panel always reverts to full view, or conversely, the camera
 * from the previous screen width remains, causing the graph to skew to one side.
 */
export function resolveViewportReframeMode(state: ViewportReframeState): ViewportReframeMode {
  // The program does not steal the camera and edge-pair context held by the user.
  if (state.userDriven || state.pairFocused) return "preserve";

  // The dome has a self-reframe path that preserves posture (yaw/pitch) first.
  if (state.domeActive) return state.focused ? "dome-focus" : "dome-overview";

  // The selected node is the most specific current reading target, even within regions/lenses.
  if (state.focused) return "focus";
  if (state.realmActive) return "realm";
  if (state.spotlightActive) return "spotlight";
  return "overview";
}
