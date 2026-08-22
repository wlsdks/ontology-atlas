import type { ProjectImpactMode } from "@/entities/project";

export interface ImpactModeCopyKeys {
  mode: ProjectImpactMode;
  labelKey: string;
  helpKey: string;
}

/**
 * design-council B6 rank16 — ProjectDrawer's 4 impact-mode pills each trigger a
 * different graph operation (none = no emphasis · upstream = the dependency closure ·
 * downstream = the dependent closure · network = the bidirectional closure, see
 * `resolveProjectImpactInsight`), while the help text was always the same single line —
 * an honesty defect. The label/help i18n key pairs are declared here in one place so
 * the ProjectDrawer render and the tests reference the same list (preventing drift).
 *
 * The direction vocabulary is unified with rank13 (FullDetailA1's reach direction
 * toggle): upstream = "what this item needs", downstream = "what needs this item".
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
