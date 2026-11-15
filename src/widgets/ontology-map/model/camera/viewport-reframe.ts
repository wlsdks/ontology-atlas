export interface ViewportReframeState {
  /** Map pan, wheel or pinch. */
  userDriven: boolean;
  domeActive: boolean;
  focused: boolean;
  pairFocused: boolean;
  realmActive: boolean;
  /** Recent changes, path, or full expand. */
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
 * One priority for what to reframe when the viewport settles: each lens owns a different
 * "what is being viewed", so without it an opened panel reverts to full view or the graph
 * skews to one side.
 */
export function resolveViewportReframeMode(state: ViewportReframeState): ViewportReframeMode {
  // The program never steals a camera or edge-pair context the user holds.
  if (state.userDriven || state.pairFocused) return "preserve";

  // The dome has its own reframe that keeps yaw and pitch.
  if (state.domeActive) return state.focused ? "dome-focus" : "dome-overview";

  // The selected node is the most specific reading target, even inside realms and lenses.
  if (state.focused) return "focus";
  if (state.realmActive) return "realm";
  if (state.spotlightActive) return "spotlight";
  return "overview";
}
