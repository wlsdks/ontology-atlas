import type { useTopologyCanvasFocus } from "../use-topology-canvas-focus";
import type { useTopologyPreferences } from "../use-topology-preferences";
import type { useTopologySourceReadiness } from "./use-topology-source-readiness";

import { copyText } from "@/shared/lib/clipboard/copy-text";
import { formatProjectSourceHandoff } from "@/shared/lib/project-source/project-source-receipt";
import { useToast } from "@/shared/ui";
import { useCallback, useMemo } from "react";
import { copyHandoffWithFeedback } from "../../lib/project-source/copy-handoff-with-feedback";
import type { NodeDatasheetDerivation } from "../inspector/use-node-datasheet-model";

interface Options {
  toast: ReturnType<typeof useToast>;
  v2DatasheetModel: NodeDatasheetDerivation["v2DatasheetModel"];
  topologyCanvasFocus: Pick<ReturnType<typeof useTopologyCanvasFocus>, "setFullDetailSlug">;
  topologySourceReadiness: Pick<ReturnType<typeof useTopologySourceReadiness>, "projectSource" | "projectSourceMeasuredAtLabel">;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "t">;
  askAgent: ((request: string) => void) | null;
}
export function useTopologySourceActions({ toast, v2DatasheetModel, topologyPreferences, topologySourceReadiness, topologyCanvasFocus, askAgent }: Options) {
  const { t } = topologyPreferences;
  const { projectSource, projectSourceMeasuredAtLabel } = topologySourceReadiness;
  const { setFullDetailSlug } = topologyCanvasFocus;

  const copyV2NodeHandoff = useCallback(
    async (text: string) => {
      await copyHandoffWithFeedback({
        text: text === v2DatasheetModel?.handoffText && projectSource.view
          ? `${text}\n\n${formatProjectSourceHandoff(projectSource.view)}`
          : text,
        copy: copyText,
        show: toast.show,
        copiedMessage: t("nodeDatasheet.handoffCopied"),
        failedMessage: t("nodeDatasheet.handoffCopyFailed"),
      });
    },
    [t, toast, v2DatasheetModel, projectSource.view],
  );
  const handleProjectSourceAction = useCallback(async (selectNode: (nodeId: string) => void) => {
    const action = projectSource.view?.nextAction.id;
    if (!action || !v2DatasheetModel) return;
    if (projectSource.canRunSourceAction) {
      await projectSource.runNextAction();
      return;
    }
    if (action === "use_current_evidence") {
      await copyV2NodeHandoff(v2DatasheetModel.handoffText);
      return;
    }
    if (action === "repair_source_path") {
      if (projectSource.repairTarget) {
        selectNode(projectSource.repairTarget.nodeId);
        setFullDetailSlug(projectSource.repairTarget.nodeId);
      }
      return;
    }
    if (action === "record_source_role") {
      // Finding the file that carries each concept is reading code, so the step is a request an agent can run.
      const request = t("nodeDatasheet.sourceRoleRequest");
      if (askAgent) {
        setFullDetailSlug(null);
        askAgent(request);
        return;
      }
      await copyHandoffWithFeedback({
        text: request,
        copy: copyText,
        show: toast.show,
        copiedMessage: t("nodeDatasheet.sourceRoleRequestCopied"),
        failedMessage: t("nodeDatasheet.handoffCopyFailed"),
      });
      return;
    }
    if (action === "review_inventory_limit") {
      setFullDetailSlug(v2DatasheetModel.nodeId);
    }
  }, [projectSource, v2DatasheetModel, copyV2NodeHandoff, setFullDetailSlug, askAgent, t, toast]);
  const projectSourceNextAction = projectSource.view?.nextAction.id ?? null;
  const projectSourceNextActionAvailable = Boolean(
    // Nothing is prescribed until the proposal settles, or the button changes and shifts under the
    // cursor.
    projectSource.proposalSettled
    && (projectSource.canRunSourceAction
      || projectSourceNextAction === "use_current_evidence"
      || projectSourceNextAction === "record_source_role"
      || projectSourceNextAction === "repair_source_path"
      || projectSourceNextAction === "review_inventory_limit"),
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
      // Always an action label.
      action: view.nextAction.id === "record_source_role" && !askAgent
        ? t("nodeDatasheet.sourceAction_record_source_role_copy")
        : t(`nodeDatasheet.sourceAction_${view.nextAction.id}`),
      why: projectSource.repairUnavailable
        ? t("nodeDatasheet.sourceRepairUnavailable")
        : projectSource.repairTarget
          ? t("nodeDatasheet.sourceRepairTarget", { title: projectSource.repairTarget.title, path: projectSource.repairTarget.path })
          : t(`nodeDatasheet.sourceWhy_${view.nextAction.id}`),
      busy: t("nodeDatasheet.sourceBusy"),
    };
  }, [
    projectSource.view,
    projectSource.repairTarget,
    projectSource.repairUnavailable,
    projectSourceMeasuredAtLabel,
    askAgent,
    t,
  ]);
  // No binding exists yet, so the connect path reads its own failure sentence without "unchanged"
  // reassurance.
  const projectSourceUnbound = projectSource.view?.nextAction.id === "connect_source";
  const projectSourceErrorLabel = projectSource.error
    ? projectSourceUnbound && t.has(`nodeDatasheet.sourceErrorUnbound_${projectSource.error}`)
      ? t(`nodeDatasheet.sourceErrorUnbound_${projectSource.error}`)
      : t(`nodeDatasheet.sourceError_${projectSource.error}`)
    : null;
  /**
   * Measuring the vault root once finds the enclosing git repository, so "link a code folder" can
   * propose it. The evidence line states only what was measured; with no proposal or low confidence
   * this is `null` and only the folder picker draws.
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
    projectSourceLabels, copyV2NodeHandoff, projectSourceErrorLabel,
    projectSourceProposal, handleProjectSourceConfirmProposal, projectSourceNextActionAvailable,
    handleProjectSourceAction
  } as const;
}
