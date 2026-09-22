import type { useTopologyPreferences } from "./use-topology-preferences";
import type { useTopologyRouteControls } from "./use-topology-route-controls";

import { computeOntologyChangeset, useChangeBaseline } from "@/entities/knowledge-graph";
import { useLocalVault, useSummaryFreshness, useVaultSessionIdentityScope } from "@/entities/vault-session";
import { useProjects } from "@/features/project-data-source";
import { useAdaptiveRecentChanges, useOntologyInsight, useVaultConceptFacts, useVaultDocFreshnessIndex, useVaultValidationSummary } from "@/features/vault-ontology";
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
   * **A folder of pages and no nodes is a wiki on its own, and it opens on the Library.**
   *
   * The vault shape is one folder (ledger, 2026-09-06): `sources/` and `wiki/` always,
   * the map's folders when there is a map. A person who opened Atlas on documents used
   * to land here, on an empty canvas that had nothing to draw and said so. Read from the
   * manifest, not from the drawn graph — the graph is derived later and is empty for a
   * moment on every open — and done once per manifest, so a person who then walks back
   * to the map on purpose is not sent away again.
   */
  const landedManifestRef = useRef<object | null>(null);
  useEffect(() => {
    if (vault.status !== "loaded" || !vault.manifest) return;
    if (landedManifestRef.current === vault.manifest) return;
    landedManifestRef.current = vault.manifest;
    // A wiki without a map opens on the Library: the template alone says a person chose
    // the wiki, so the empty map is not their first screen.
    const shape = describeVaultShape(vault.manifest.docs ?? []);
    if (!shape.map && shape.wiki) router.replace(DESTINATION_HREF.library);
  }, [router, vault.manifest, vault.status]);
  const tAgent = useTranslations("vaultAgentPanel");
  // With no bridge (the web build) neither the button nor the panel is drawn —
  // painting a door that will not open is the opposite of honest degradation.
  const llmBridgeAvailable = isLlmChatBridgeAvailable();
  /** Evidence for the gap a first line points at — the same fact map the panel and
   * the insight queue read. */
  const vaultConceptFacts = useVaultConceptFacts();
  const { insight: ontologyInsight } = useOntologyInsight();
  // "When did this change" for the node datasheet (mode-aware manifest updatedAt).
  const docFreshnessIndex = useVaultDocFreshnessIndex();
  // The recent-changes spotlight lens over an mtime window. A numeric `?recent=`
  // preset pins that window; "auto" and off use the adaptive ramp. The map's
  // sinking and the INDEX lens share this one hook as their single source.
  const spotlightOn = recentWindow !== null;
  /*
   * Fit the camera to the highlighted nodes only at the **moment** the lens turns
   * on or its window changes (owner report 2026-08-02: narrowing the window left
   * the view unmoved).
   *
   * What crosses is an event, not a value: the map reads `spotlightIds` every
   * frame, so the ids alone cannot say "this just changed", and fitting every frame
   * would keep stealing the view the user parked afterwards.
   *
   * The counter exists so render never calls `Date.now()` — lint caught it and the
   * rule is right: render must be pure, and reading the clock gives different
   * output for the same input when React discards and retries a render. The only
   * property needed is "it differs", so a monotonic counter is enough. It ticks
   * only on renders where the lens or the window changed.
   */
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
  /*
   * On the sample, pressing this chip offers a way forward instead of a dead end.
   * Owner, 2026-08-03: *"Shouldn't something pop up on the screen when the chip is clicked? … Display a nice popup in the center of the screen to guide folder setup?"* (the chip should open something
   * — a dialog in the middle of the screen that leads to picking a folder).
   *
   * **Two empty states, told apart.** For someone who opened their own folder, zero
   * recent changes really means there is nothing to show, so the chip stays disabled
   * with its tooltip — opening a modal to say "there is nothing" is still rejected
   * (2026-08-02, popup soup). The sample is different: the zero there comes from the
   * fixture's dates being whenever this repo last touched them, which has nothing to
   * do with the user and will never become non-zero by waiting. When the reason is a
   * next action rather than an absence, give the next action.
   */
  const [recentNeedsVaultOpen, setRecentNeedsVaultOpen] = useState(false);
  /** Same for "create one from here" on the sample: a route to a folder, not a dead
   * end. */
  /**
   * Which "open your folder" sentence to show when a write is asked of the sample:
   * creating and editing are different promises, so the dialog names the one
   * that was attempted. `null` keeps it closed.
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
  // Owner: *"If it's showing all changes, zoom out significantly"* (if it is showing
  // every change, zoom right out). The moment the lens turns on, the camera pulls
  // back to a full fit so all the changed places — including auto-expansions — fit
  // one screen. Once per off→on transition only, so it does not fight manual
  // exploration while the lens is up, and it reuses the existing fit token rather
  // than adding a camera primitive.
  const prevSpotlightOnRef = useRef(spotlightOn);
  useEffect(() => {
    if (spotlightOn && !prevSpotlightOnRef.current) {
      setFitViewToken((token) => token + 1);
    }
    prevSpotlightOnRef.current = spotlightOn;
  }, [setFitViewToken, spotlightOn]);
  // Reference instant for the "N days ago" labels. Day resolution, so a snapshot
  // taken once per session is enough — and calling `Date.now()` during render
  // violates react-hooks purity. Labels staying still for the session is desirable
  // for the same reason `changeBaseline` is pinned.
  const [updatedAgoNowMs] = useState(() => Date.now());
  // When a change baseline is pinned in the shared store, nodes added or changed
  // since it pulse on the map, so the spatial view and the ontology change panel
  // show the same baseline during a review.
  const changeBaseline = useChangeBaseline();
  // Computed once and used twice: the pulse (`touchedNodeIds`) and the re-entry
  // review pill.
  const ontologyChangeset = useMemo(
    () =>
      computeOntologyChangeset(changeBaseline, ontologyInsight?.nodes ?? [], ontologyInsight?.edges ?? []),
    [changeBaseline, ontologyInsight],
  );
  const changedSlugs = ontologyChangeset.touchedNodeIds;
  // Long-untouched nodes, judged from vault mtime, sink through the engine's
  // existing stale channel (dash + opaque token). Reuses the session snapshot
  // instant so the judgement does not shift mid-session, same as the datasheet's
  // "N days ago" labels.
  const dustySlugs = useMemo(
    () => deriveDustySlugs(ontologyInsight?.nodes ?? [], docFreshnessIndex, updatedAgoNowMs),
    [ontologyInsight, docFreshnessIndex, updatedAgoNowMs],
  );
  /*
   * ⚠️ **A document the checks caught is invisible on the map** (census state 3, 2026-08-31). A
   * broken `kind` drops the node from the graph and an unreadable frontmatter line silently loses
   * a field, and both were drawn as a healthy node or as nothing at all — the map has no place to
   * say "this file is not what it claims". The same summary the settings sheet and the insights
   * screen already count from is read here, so the three surfaces cannot disagree about one
   * folder, and the count is one quiet row shaped like the two beside it. Only errors: a warning
   * is advice, and advice does not belong in a row that says something is wrong.
   */
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
  // A `?p=` deep link that resolves to neither a project nor an ontology
  // node used to fail silently (the map just showed nothing highlighted) —
  // the exact "silent no-op" failure mode the old `/ontology` page's
  // deeplinkNotFound notice existed to fix. `/ontology`'s convergence
  // redirect (`OntologyRedirectPage`) can't diagnose this itself (it
  // translates + redirects synchronously, before ontology data loads) — this
  // is the ONE place `?p=` actually gets resolved, so it's the one place
  // that surfaces the miss. Notifies once per distinct dangling slug.
  //
  // `resolveDeeplinkMissDecision` (../lib/deeplink-miss-notice.ts) decides
  // *when*: a kind-prefixed slug (`element:foo`) can never collide with a
  // project slug, so it's flagged the moment neither list has it. A bare
  // slug (`project`) could still turn out to BE a project slug, so it waits
  // for `projectsQuery.loaded` — but only up to DEEPLINK_MISS_GRACE_MS, not
  // forever. Cross-verified UX round finding (2026-07-19, ledger item 3):
  // when the project list never finished loading, a bare miss used to stay
  // silent permanently — the dangling `?p=` param just sat there unexplained.
  const deeplinkMissNotifiedRef = useRef<string | null>(null);
  /**
   * **When the vault changes, clear vault-scoped URL state** (2026-08-01, the same
   * treatment as the `?slug=` fix in the docs surface).
   *
   * The values behind keys like `?p=` and `?pathFrom=` are names that only mean
   * something inside one vault, and the URL knows nothing about vaults. So when the
   * user switched folders or moved between the sample and their own vault, those
   * names lost their meaning, nobody cleared them, and they stuck: the map judged a
   * node that no longer exists as selected and dimmed **everything**, and the path
   * chip asserted "no path" between two nodes that were not there.
   *
   * First mount is skipped — a `?p=` present then is not residue, it is something
   * somebody handed over (a deep link, an agent handoff, a bookmark). That case is
   * not to be erased; it is what the unresolved-slug toast below must say honestly.
   *
   * The toast's once-only memory is cleared at the same time. Without that, coming
   * back A→B→A leaves the screen **completely silent** for a slug that really is
   * missing this time.
   */
  const vaultIdentity = useVaultSessionIdentityScope();
  const vaultIdentityRef = useRef<string | null>(null);
  /**
   * Whether it is yet safe to diagnose "not found". The unresolved toast and the
   * canvas focus decision must read the **same** signal; if they diverge, the screen
   * focuses a ghost while the toast says it is missing, or the reverse.
   */
  const deeplinkSourceReady =
    vault.restoreAttempted &&
    (vault.status === "idle" ||
      vault.status === "loaded" ||
      vault.status === "unsupported");
  /**
   * ⚠️ **A scope before it settles is not a scope.** The first render happens
   * before the vault is restored, so the identity reads as `sample:…`. Recording
   * that as "the previous vault" makes the restore itself look like a vault switch
   * and erases the deep link the user arrived with. Measured 2026-08-01 in the
   * browser: reloading a URL pointing at a real node dropped its `?p=` on the spot.
   * Only values seen after `deeplinkSourceReady` count.
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

    // "notify-after-grace" — bare slug, project list still loading. Wait
    // bounded rather than forever; cancelled + re-decided if the deps
    // change first (e.g. the project list finishes loading and resolves
    // the slug after all).
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
  // Absolute vault path on the Tauri desktop (bridge active); `null` for a web File
  // System Access handle, which makes the history tile and panel degrade honestly to
  // the session changeset.
  const gitVaultPath = vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null;
  // Direction B (2026-08-25 design-directions) — summary nodes whose description has
  // fallen behind the membership it describes. Empty in the browser, which has no Git
  // history to read; the node popover simply renders no row there.
  const summaryFreshnessCandidates = useMemo(
    () =>
      (ontologyInsight?.nodes ?? [])
        // `agentSlug` is the vault-root-relative address, which is exactly what
        // `vault_node_revisions` resolves against; `evidenceIds[0]` would carry the
        // bundled sample's extra path segment and, for a node with no document of its
        // own, would name someone else's file.
        .filter((node) => node.hasOwnDocument !== false && Boolean(node.agentSlug))
        .map((node) => ({ slug: node.agentSlug as string, kind: node.kind })),
    [ontologyInsight],
  );
  const summaryFreshness = useSummaryFreshness(gitVaultPath ?? undefined, summaryFreshnessCandidates);
  const handoffSource: "loaded-vault" | "read-only-sample" =
    vault.status === "loaded" ? "loaded-vault" : "read-only-sample";
  return {
    vault, selectedOntologyNode, ontologyInsight, setNeedsVaultReason, recentChanges, docFreshnessIndex,
    updatedAgoNowMs, spotlightOn, changedSlugs, dustySlugs, deeplinkSourceReady, handoffSource, vaultIdentity,
    llmBridgeAvailable, gitVaultPath, tAgent, vaultConceptFacts, handleToggleSpotlight, spotlightNeedsVault,
    ontologyChangeset, brokenDocCount, spotlightFitToken, recentNeedsVaultOpen, setRecentNeedsVaultOpen,
    needsVaultReason, summaryFreshness
  } as const;
}
