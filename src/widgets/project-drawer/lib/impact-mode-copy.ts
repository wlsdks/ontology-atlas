import type { ProjectImpactMode } from "@/entities/project";

export interface ImpactModeCopyKeys {
  mode: ProjectImpactMode;
  labelKey: string;
  helpKey: string;
}

/**
 * Label and help keys for ProjectDrawer's four impact modes (none, upstream, downstream and network
 * closures via `resolveProjectImpactInsight`), declared once for the render and the tests.
 * Direction words match FullDetailA1: upstream is "what this item needs", downstream "what needs
 * this item".
 */
export const IMPACT_MODE_COPY_KEYS: ImpactModeCopyKeys[] = [
  { mode: "none", labelKey: "impactModeNone", helpKey: "impactHelpNone" },
  {
    mode: "upstream",
    labelKey: "impactModeUpstream",
    helpKey: "impactHelpUpstream",
  },
  {
    mode: "downstream",
    labelKey: "impactModeDownstream",
    helpKey: "impactHelpDownstream",
  },
  {
    mode: "network",
    labelKey: "impactModeNetwork",
    helpKey: "impactHelpNetwork",
  },
];
