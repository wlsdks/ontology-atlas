import type { useTopologyPreferences } from "./use-topology-preferences";
import type { useTopologyRouteControls } from "./use-topology-route-controls";

import { computeOntologyChangeset, useChangeBaseline } from "@/entities/knowledge-graph";
import { useArrivingVaultIdentityScope, useLocalVault, useSummaryFreshness, useVaultSessionIdentityScope } from "@/entities/vault-session";
import { useProjects } from "@/features/project-data-source";
import { useAdaptiveRecentChanges, useArrivingOntologyInsight, useOntologyInsight, useVaultConceptFacts, useVaultDocDates, useVaultDocFileDates, useVaultValidationSummary } from "@/features/vault-ontology";
import { useRouter } from "@/i18n/navigation";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { isLlmChatBridgeAvailable } from "@/shared/lib/tauri-llm";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";
import { describeVaultShape } from "@/shared/lib/vault-shape";
import { useToast } from "@/shared/ui";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveDeeplinkMissDecision } from "../lib/deeplink-miss-notice";
import { resolveTopologySelectedOntologyNode } from "../lib/resolve-topology-selected-node";
import { deriveDustySlugs } from "../lib/topology-dusty";
import { clearVaultScopedRouteState } from "./url-state";
import { buildSpotlightFitSignature, useSpotlightFitTransition } from "./use-spotlight-fit-transition";
const DEEPLINK_MISS_GRACE_MS = 4000;
interface Options {
  router: ReturnType<typeof useRouter>;
  recentWindow: import("./url-state").HomeRouteState["recentWindow"];
  pathSourceSlug: string | null;
  pathTargetSlug: string | null;
  expandAllActive: boolean;
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  setFitViewToken: React.Dispatch<React.SetStateAction<number>>;
  selectedSlug: string | null;
  projectsQuery: ReturnType<typeof useProjects>;
  toast: ReturnType<typeof useToast>;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "t">;
  topologyRouteControls: Pick<ReturnType<typeof useTopologyRouteControls>, "selectedProject">;
}
export function useTopologyVaultReadModel({
  router, recentWindow, pathSourceSlug, pathTargetSlug, expandAllActive, setRouteState, setFitViewToken,
  selectedSlug, projectsQuery, toast, topologyRouteControls, topologyPreferences
}: Options) {
  const { selectedProject } = topologyRouteControls;
  const { t } = topologyPreferences;

  const vault = useLocalVault();
  /**
   * A folder of pages with no map opens on the Library. Read from the manifest, since the derived
   * graph is briefly empty on every open, and once per manifest, so walking back to the map is not
   * redirected again.
   */
  const landedManifestRef = useRef<object | null>(null);
  useEffect(() => {
    if (vault.status !== "loaded" || !vault.manifest) return;
    if (landedManifestRef.current === vault.manifest) return;
    landedManifestRef.current = vault.manifest;
    const shape = describeVaultShape(vault.manifest.docs ?? []);
    if (!shape.map && shape.wiki) router.replace(DESTINATION_HREF.library);
  }, [router, vault.manifest, vault.status]);
  const tAgent = useTranslations("vaultAgentPanel");
  // Without a bridge (web build) neither button nor panel is drawn: never paint a door that will
  // not open.
  const llmBridgeAvailable = isLlmChatBridgeAvailable();
  /** The same fact map the panel and the insight queue read. */
  const vaultConceptFacts = useVaultConceptFacts();
  const arrivingInsight = useArrivingOntologyInsight();
  const { insight: settledInsight } = useOntologyInsight();
  const ontologyInsight = arrivingInsight ?? settledInsight;
  // Git dates where Git knows, else the file's date (`useVaultDocDates`).
  const { index: docFreshnessIndex, reading: docDatesReading } = useVaultDocDates();
  // File dates, not commits, answer whether the document on screen changed since it opened
  // (conflict baseline).
  const docFileDateIndex = useVaultDocFileDates();
  // A numeric `?recent=` pins the window; "auto" and off use the adaptive ramp. Map and INDEX
  // share this hook.
  const spotlightOn = recentWindow !== null;
  // Fits the camera only when the lens turns on or its window changes: the map
  // reads `spotlightIds` every frame, so an event token is needed, or every frame steals the view.
  // A counter, not `Date.now()`, keeps render pure.
  const spotlightFitToken = useSpotlightFitTransition(
    buildSpotlightFitSignature({
      recentWindow,
      spotlightOn,
      pathSourceSlug,
      pathTargetSlug,
      expandAllActive,
    }),
  );
  const recentChanges = useAdaptiveRecentChanges(
    spotlightOn && recentWindow !== "auto" ? recentWindow : undefined,
  );
  // On the sample the zero-change chip opens a folder dialog, since waiting never makes the
  // fixture's count non-zero; in a user's folder zero means nothing to show, so the chip stays
  // disabled with its tooltip.
  const [recentNeedsVaultOpen, setRecentNeedsVaultOpen] = useState(false);
  /**
   * Which "open your folder" sentence a write on the sample shows: creating and editing are
   * different promises. `null` keeps it closed.
   */
  const [needsVaultReason, setNeedsVaultReason] = useState<"createNeedsVault" | "editNeedsVault" | null>(null);
  const spotlightNeedsVault = vault.status !== 'loaded';
  const handleToggleSpotlight = useCallback(() => {
    if (spotlightNeedsVault) {
      setRecentNeedsVaultOpen(true);
      return;
    }
    setRouteState((current) => ({
      ...current,
      recentWindow: current.recentWindow === null ? "auto" : null,
    }));
  }, [spotlightNeedsVault, setRouteState, setRecentNeedsVaultOpen]);
  // On lens on, one full fit so all changed places fit one screen; once per off-to-on so manual
  // exploration wins.
  const prevSpotlightOnRef = useRef(spotlightOn);
  useEffect(() => {
    if (spotlightOn && !prevSpotlightOnRef.current) {
      setFitViewToken((token) => token + 1);
    }
    prevSpotlightOnRef.current = spotlightOn;
  }, [setFitViewToken, spotlightOn]);
  // Day resolution: one snapshot per session keeps labels still and render pure.
  const [updatedAgoNowMs] = useState(() => Date.now());
  // A pinned baseline makes nodes changed since it pulse, matching the change panel during a
  // review.
  const changeBaseline = useChangeBaseline();
  // Used by both the pulse (`touchedNodeIds`) and the re-entry review pill.
  const ontologyChangeset = useMemo(
    () =>
      computeOntologyChangeset(changeBaseline, ontologyInsight?.nodes ?? [], ontologyInsight?.edges ?? []),
    [changeBaseline, ontologyInsight],
  );
  const changedSlugs = ontologyChangeset.touchedNodeIds;
  // Uses the session snapshot instant so the judgement does not shift mid-session.
  const dustySlugs = useMemo(
    () => deriveDustySlugs(ontologyInsight?.nodes ?? [], docFreshnessIndex, updatedAgoNowMs),
    [ontologyInsight, docFreshnessIndex, updatedAgoNowMs],
  );
  // A broken `kind` drops a node and a bad frontmatter line loses a field, so the map shows a
  // validation row.
  // It reads the same summary as settings and insights so the three agree; errors only, since
  // warnings are advice.
  const vaultValidation = useVaultValidationSummary();
  const brokenDocCount = useMemo(
    () =>
      vaultValidation.issuesBySlug.filter((entry) =>
        entry.issues.some((issue) => issue.severity === "error"),
      ).length,
    [vaultValidation],
  );
  const selectedOntologyNode = useMemo(() => {
    if (!selectedSlug || selectedProject) return null;
    if (!ontologyInsight) return null;
    return resolveTopologySelectedOntologyNode(selectedSlug, ontologyInsight.nodes);
  }, [selectedSlug, selectedProject, ontologyInsight]);
  // The one place `?p=` resolves, so the one place that reports a miss, once per distinct
  // slug. `resolveDeeplinkMissDecision` decides when: a bare slug waits for projects, but
  // only `DEEPLINK_MISS_GRACE_MS`.
  const deeplinkMissNotifiedRef = useRef<string | null>(null);
  /**
   * Clears vault-scoped URL state when the vault changes, or `?p=` and `?pathFrom=` name nodes that
   * are not here. First mount is skipped: a `?p=` then was handed over and the miss toast reports
   * it honestly. The toast's once-only memory clears too, or returning A->B->A stays silent for a
   * truly missing slug.
   */
  const arrivingIdentity = useArrivingVaultIdentityScope();
  const sessionIdentity = useVaultSessionIdentityScope();
  const vaultIdentity = arrivingIdentity ?? sessionIdentity;
  const vaultIdentityRef = useRef<string | null>(null);
  /**
   * The miss toast and the canvas focus read this same signal, or one focuses a ghost while the
   * other says missing.
   */
  const deeplinkSourceReady =
    vault.restoreAttempted &&
    (vault.status === "idle" ||
      vault.status === "loaded" ||
      vault.status === "unsupported");
  /**
   * The first render reads a `sample:` identity before restore; recording it would make the restore
   * look like a vault switch and erase the arrival deep link. Only values seen
   * after `deeplinkSourceReady` count.
   */
  useEffect(() => {
    if (!deeplinkSourceReady) return;
    const previous = vaultIdentityRef.current;
    vaultIdentityRef.current = vaultIdentity;
    if (previous === null || previous === vaultIdentity) return;
    deeplinkMissNotifiedRef.current = null;
    setRouteState(clearVaultScopedRouteState, { replace: true });
  }, [deeplinkSourceReady, vaultIdentity, setRouteState]);
  useEffect(() => {
    const decision = resolveDeeplinkMissDecision({
      selectedSlug,
      hasOntologyMatch: Boolean(selectedOntologyNode),
      hasProjectMatch: Boolean(selectedProject),
      projectsLoaded: projectsQuery.loaded,
      sourceReady: deeplinkSourceReady,
    });
    if (decision.action === "none") return;
    if (!selectedSlug || deeplinkMissNotifiedRef.current === selectedSlug) return;

    const notify = () => {
      deeplinkMissNotifiedRef.current = selectedSlug;
      toast.show(t("deeplinkNotFound", { query: selectedSlug }), "error");
    };

    if (decision.action === "notify-now") {
      let cancelled = false;
      window.queueMicrotask(() => {
        if (!cancelled) notify();
      });
      return () => {
        cancelled = true;
      };
    }

    // Bounded wait; cancelled and re-decided when the deps change first.
    const timer = window.setTimeout(notify, DEEPLINK_MISS_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [
    selectedSlug,
    projectsQuery.loaded,
    ontologyInsight,
    selectedProject,
    selectedOntologyNode,
    deeplinkSourceReady,
    toast,
    t,
  ]);
  // Tauri vault path; `null` for a web handle, where the history tile degrades to the session
  // changeset.
  const gitVaultPath = vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null;
  // Summary nodes whose description lags their membership. Empty in the browser, which has no Git
  // history.
  const summaryFreshnessCandidates = useMemo(
    () =>
      (ontologyInsight?.nodes ?? [])
        // `agentSlug` is the vault-root address `vault_node_revisions` resolves; `evidenceIds[0]`
        // can carry the sample's extra segment or another node's file.
        .filter((node) => node.hasOwnDocument !== false && Boolean(node.agentSlug))
        .map((node) => ({ slug: node.agentSlug as string, kind: node.kind })),
    [ontologyInsight],
  );
  const summaryFreshness = useSummaryFreshness(gitVaultPath ?? undefined, summaryFreshnessCandidates);
  const handoffSource: "loaded-vault" | "read-only-sample" =
    vault.status === "loaded" ? "loaded-vault" : "read-only-sample";
  return {
    vault, selectedOntologyNode, ontologyInsight, setNeedsVaultReason, recentChanges, docFreshnessIndex,
    docFileDateIndex, docDatesReading, updatedAgoNowMs, spotlightOn, changedSlugs, dustySlugs, deeplinkSourceReady, handoffSource, vaultIdentity,
    llmBridgeAvailable, gitVaultPath, tAgent, vaultConceptFacts, handleToggleSpotlight, spotlightNeedsVault,
    ontologyChangeset, brokenDocCount, spotlightFitToken, recentNeedsVaultOpen, setRecentNeedsVaultOpen,
    needsVaultReason, summaryFreshness
  } as const;
}
