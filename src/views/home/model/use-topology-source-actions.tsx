import type { useTopologyCanvasFocus } from "./use-topology-canvas-focus";
import type { useTopologyPreferences } from "./use-topology-preferences";
import type { useTopologySourceReadiness } from "./use-topology-source-readiness";

import { copyText } from "@/shared/lib/copy-text";
import { formatProjectSourceHandoff } from "@/shared/lib/project-source-receipt";
import { useToast } from "@/shared/ui";
import { useCallback, useMemo } from "react";
import { copyHandoffWithFeedback } from "../lib/copy-handoff-with-feedback";

interface Options {
  toast: ReturnType<typeof useToast>;
  v2DatasheetModel: { slug: string; nodeId: string; title: string; sourceTitle: string | null; kind: string; domain: { id: string; title: string; } | null; powered: boolean; updatedAtLabel: string | null; metric: { contains: number; usedBy: number; dependsOn: number; belongsTo: number; evidence: number; }; groups: import("@/widgets/ontology-map/ui/map-datasheet").V2ConnectionGroupsView; evidence: { rows: import("@/widgets/ontology-map/ui/map-datasheet").V2EvidenceRow[]; total: number; }; codeLocations: string[]; handoffText: string; documentHref: string | null; mentionDocumentHref: string | null; meaningEditHref: string; lastEditSubject: { kind: import("@/shared/lib/last-edit-subject").LastEditSubjectKind; ageLabel: string; } | null; mtimeConflict: boolean; } | null;
  topologyCanvasFocus: Pick<ReturnType<typeof useTopologyCanvasFocus>, "setFullDetailSlug">;
  topologySourceReadiness: Pick<ReturnType<typeof useTopologySourceReadiness>, "projectSource" | "projectSourceMeasuredAtLabel">;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "t">;
}
export function useTopologySourceActions({ toast, v2DatasheetModel, topologyPreferences, topologySourceReadiness, topologyCanvasFocus }: Options) {
  const { t } = topologyPreferences;
  const { projectSource, projectSourceMeasuredAtLabel } = topologySourceReadiness;
  const { setFullDetailSlug } = topologyCanvasFocus;

  const copyV2NodeHandoff = useCallback(
    async (text: string) => {
      await copyHandoffWithFeedback({
        text,
        copy: copyText,
        show: toast.show,
        copiedMessage: t("nodeDatasheet.handoffCopied"),
        failedMessage: t("nodeDatasheet.handoffCopyFailed"),
      });
    },
    [t, toast],
  );
  const projectAwareHandoffText = useMemo(() => {
    if (!v2DatasheetModel) return "";
    if (!projectSource.view) return v2DatasheetModel.handoffText;
    return `${v2DatasheetModel.handoffText}\n\n${formatProjectSourceHandoff(projectSource.view)}`;
  }, [v2DatasheetModel, projectSource.view]);
  const handleProjectSourceAction = useCallback(async () => {
    const action = projectSource.view?.nextAction.id;
    if (!action || !v2DatasheetModel) return;
    if (projectSource.canRunSourceAction) {
      await projectSource.runNextAction();
      return;
    }
    if (action === "use_current_evidence") {
      await copyV2NodeHandoff(projectAwareHandoffText);
      return;
    }
    if (
      action === "record_source_role"
      || action === "repair_source_path"
      || action === "review_inventory_limit"
    ) {
      setFullDetailSlug(v2DatasheetModel.nodeId);
    }
  }, [projectSource, v2DatasheetModel, copyV2NodeHandoff, projectAwareHandoffText, setFullDetailSlug]);
  const projectSourceNextAction = projectSource.view?.nextAction.id ?? null;
  const projectSourceNextActionAvailable = Boolean(
    // While the proposal is still settling, **draw no prescription at all.** Drawing
    // early means the button changes label and skin 300 ms later and shifts upward —
    // out from under a cursor that is already there.
    projectSource.proposalSettled
    && (projectSource.canRunSourceAction
      || projectSourceNextAction === "use_current_evidence"
      || projectSourceNextAction === "record_source_role"
      || projectSourceNextAction === "repair_source_path"
      || projectSourceNextAction === "review_inventory_limit"),
  );
  const projectSourceNeedsNativeRuntime = Boolean(
    projectSourceNextAction === "connect_source"
    || projectSourceNextAction === "repair_source_binding"
    || projectSourceNextAction === "measure_source"
    || projectSourceNextAction === "remeasure_source",
  );
  const projectSourceLabels = useMemo(() => {
    const view = projectSource.view;
    if (!view) return null;
    const sourceKind = view.receipt?.sourceKind;
    return {
      heading: t("nodeDatasheet.sourceHeading"),
      sourceKind: sourceKind ? t(`nodeDatasheet.sourceKind_${sourceKind}`) : undefined,
      status: t(`nodeDatasheet.sourceStatus_${view.status}`),
      measuredAt: projectSourceMeasuredAtLabel,
      currentness: t(`nodeDatasheet.sourceCurrent_${view.currentness}`),
      gap: t(`nodeDatasheet.sourceGap_${view.topGap?.id ?? "none"}`),
      /*
       * On the web this used to **turn into** an explanatory sentence ("you can link a
       * code folder in the installed app"), i.e. a notice wedged into the slot for an
       * action label. Web users got one grey unpressable sentence and nothing else —
       * no why, no where to go, no what still works here. The label is now always an
       * action label, and the notice for surfaces that cannot act is owned entirely by
       * `projectSourceDegraded`.
       */
      action: t(`nodeDatasheet.sourceAction_${view.nextAction.id}`),
      why: t(`nodeDatasheet.sourceWhy_${view.nextAction.id}`),
      busy: t("nodeDatasheet.sourceBusy"),
    };
  }, [
    projectSource.view,
    projectSourceMeasuredAtLabel,
    t,
  ]);
  /**
   * Built only when this surface cannot perform the action. The four folder-picking
   * actions (connect, rebind, measure, remeasure) need an absolute path, and a browser
   * cannot know one (the vault-absolute-path bridge in `.claude/rules/surfaces.md`).
   *
   * It carries all three parts: why · where · **and what still works here**. Without
   * the third, the notice claims things are impossible that are not (2026-08-01: the
   * web's "cannot connect" was false).
   */
  const projectSourceDegraded = useMemo(
    () => !projectSource.runtimeAvailable && projectSourceNeedsNativeRuntime
      ? {
        why: t("nodeDatasheet.sourceDegradedWhy"),
        ctaLabel: t("nodeDatasheet.sourceDegradedCta"),
        href: "/download/",
        stillWorks: t("nodeDatasheet.sourceDegradedStillWorks"),
      }
      : null,
    [projectSource.runtimeAvailable, projectSourceNeedsNativeRuntime, t],
  );
  const projectSourceErrorLabel = projectSource.error
    ? t(`nodeDatasheet.sourceError_${projectSource.error}`)
    : null;
  /**
   * **"Is this the right folder?" (the on-screen prompt) — connecting in one step instead of two.**
   *
   * Pressing "link a code folder" used to always open the OS folder picker, leaving
   * the person to find their own repository in a tree again. The app already knows
   * the answer: measuring the vault root once walks up to the git repository that
   * contains it.
   *
   * The one line of evidence states **only what was measured**: that it is a git
   * repository, and how many of the declared paths were actually found there. With
   * zero declared paths it says so rather than inventing a ratio. When there is no
   * proposal, or confidence is low, this whole value is `null` and the screen draws
   * only the folder picker as before — no dead CTA.
   */
  const projectSourceProposal = useMemo(() => {
    const proposed = projectSource.proposedRoot;
    if (!proposed) return null;
    const summary = proposed.witnessSummary;
    const support = summary && summary.total > 0
      ? t("nodeDatasheet.sourceProposeSupport", {
        total: summary.total,
        supported: summary.supported,
      })
      : t("nodeDatasheet.sourceProposeSupportNone");
    return {
      question: t("nodeDatasheet.sourceProposeQuestion"),
      rootPath: proposed.rootPath,
      reason: `${t("nodeDatasheet.sourceProposeReasonGit")} · ${support}`,
      confirmLabel: t("nodeDatasheet.sourceProposeConfirm"),
      pickOtherLabel: t("nodeDatasheet.sourceProposePickOther"),
      confidence: proposed.confidence,
    };
  }, [projectSource.proposedRoot, t]);
  const handleProjectSourceConfirmProposal = useCallback(async () => {
    const rootPath = projectSource.proposedRoot?.rootPath;
    if (!rootPath) return;
    await projectSource.runNextAction({ rootPath });
  }, [projectSource]);
  return {
    projectSourceLabels, copyV2NodeHandoff, projectSourceErrorLabel, projectSourceDegraded,
    projectSourceProposal, handleProjectSourceConfirmProposal, projectSourceNextActionAvailable,
    handleProjectSourceAction
  } as const;
}
