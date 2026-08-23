/**
 * The actual conversation surface inside the agent dock next to the map.
 *
 * The outer flex container is merely a layout device that yields to the map width, and
 * the panel the user sees is this single inset surface. Use radius / border /
 * surface / shadow tokens like INDEX·node data sheets so all four sides are visible. `inset-y-3`·`right-3`
 * are 12px steps from the spacing ramp, and the sum of the two horizontal margins equals the existing
 * `--chrome-inset`(24px) so consumers do not need to calculate a new number when computing fixed content width.
 */
export const AGENT_DOCK_INSET_SURFACE_CLASS = [
  "absolute inset-y-3 right-3",
  "overflow-hidden rounded-[var(--topology-v2-panel-radius)]",
  "border border-[color:var(--topology-v2-panel-border)]",
  "bg-[color:var(--color-panel)] shadow-[var(--topology-v2-panel-shadow)]",
].join(" ");
