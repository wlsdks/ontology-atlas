/**
 * The visible conversation surface inside the agent dock; its flex parent only yields to the
 * map. Its two 12px horizontal margins sum to `--chrome-inset` (24px), so fixed content widths
 * need no new number.
 */
export const AGENT_DOCK_INSET_SURFACE_CLASS = [
  "absolute inset-y-3 right-3",
  "overflow-hidden rounded-[var(--map-panel-radius)]",
  "border border-[color:var(--map-panel-border)]",
  "bg-[color:var(--color-panel)] shadow-[var(--map-panel-shadow)]",
].join(" ");

export function agentDockReflowStyle(properties: "width" | "width, margin-left") {
  return {
    transitionProperty: properties,
    transitionDuration: "var(--agent-panel-reflow-duration)",
    transitionTimingFunction: "var(--topology-motion-ease-out)",
  } as const;
}
