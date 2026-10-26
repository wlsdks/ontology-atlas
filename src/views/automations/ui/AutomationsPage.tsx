"use client";

import { motion } from "framer-motion";
import { LibraryBig, Plus, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition, type CSSProperties } from "react";

import { OpenVaultCta } from "@/features/docs-vault-local";
import type { RoundRecord } from "@/entities/library-round";
import type { RoundsRunnerValue } from "@/features/library-rounds";
import { Link, useRouter } from "@/i18n/navigation";
import { DESTINATION_HREF, withQuery } from "@/shared/config/destinations";
import { isTauriVaultRuntime } from "@/shared/lib/vault-folder/tauri-vault-fs";
import { cn } from "@/shared/lib/cn";
import { usePanelPresence, useSwapHeight } from "@/shared/lib/render-timing/use-presence";
import { usePrefersReducedMotion } from "@/shared/lib/render-timing/use-prefers-reduced-motion";
import { MOTION } from "@/shared/motion";
import { framerSpring, SPRING, springEasing, springSettleMs } from "@/shared/motion/spring";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { Button, buttonVariants, EmptyState, PageHeaderBar, TabBar, useToast, WaitStage } from "@/shared/ui";

import { PAGE_FRAME_FORM, PAGE_LEDE, PAGE_STAGE_FILL, PAGE_WAIT_LIFT } from "@/shared/ui/tokens/page-frame";
import { AutomationScheduleRow } from "./AutomationScheduleRow";
import { AutomationGhostRow, AutomationLaneFacts, AutomationLaneIntro, AutomationListPanel } from "./AutomationListFrame";
import listStyles from "./automation-list-frame.module.css";

import { NewOntologyRoundSheet } from "./NewOntologyRoundSheet";

type AutomationLane = "ontology" | "documents";

const subscribeToRuntime = () => () => {};
const serverRuntimeSnapshot = (): boolean | null => null;

const EMPTY_RUNNER_ROUNDS: RoundRecord[] = [];

const ARRIVAL_MS = Math.max(springSettleMs(SPRING.surface), MOTION.settle.duration * 1000);

function isLaneRound(round: RoundRecord, lane: AutomationLane): boolean {
  return lane === "ontology" ? round.kind === "ontology" : round.kind !== "ontology";
}

export function AutomationsPage({
  runner,
  onOpenDocumentSchedule,
  onEditDocumentSchedule,
}: {
  runner: RoundsRunnerValue | null;
  onOpenDocumentSchedule: () => void;
  onEditDocumentSchedule: (round: RoundRecord) => void;
}) {
  const t = useTranslations("automations");
  const tRounds = useTranslations("library.rounds");
  const desktop = useSyncExternalStore(subscribeToRuntime, isTauriVaultRuntime, serverRuntimeSnapshot);
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const reduced = usePrefersReducedMotion();
  const requested = params.get("kind");
  const lane: AutomationLane = requested === "documents" ? "documents" : "ontology";
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [ontologySheetOpen, setOntologySheetOpen] = useState(false);
  const [ontologyDraft, setOntologyDraft] = useState(0);
  const [editingOntology, setEditingOntology] = useState<RoundRecord | null>(null);
  const [lanePending, startLaneTransition] = useTransition();

  const allRounds = runner?.rounds ?? EMPTY_RUNNER_ROUNDS;
  const rounds = useMemo(() => allRounds.filter((round) => isLaneRound(round, lane)), [allRounds, lane]);
  const requestedRound = params.get("round");
  const selected = selectedId === undefined
    ? rounds.find((round) => round.id === requestedRound) ?? rounds[0] ?? null
    : rounds.find((round) => round.id === selectedId) ?? null;

  const selectLane = (nextLane: AutomationLane) => {
    const query = new URLSearchParams(params.toString());
    query.set("kind", nextLane);
    query.delete("round");
    startLaneTransition(() => router.push(`/automations/?${query}`, { scroll: false }));
    setSelectedId(undefined);
  };

  const saveOntology = async (round: RoundRecord) => {
    if (!runner) return false;
    const ok = editingOntology ? await runner.update(round) : (await runner.save(round)).ok;
    if (ok) toast.show(t(editingOntology ? "edited" : "saved", { name: round.name }), "success");
    return ok;
  };

  const edit = (round: RoundRecord) => {
    if (round.kind !== "ontology") {
      onEditDocumentSchedule(round);
      return;
    }
    setEditingOntology(round);
    setOntologyDraft((draft) => draft + 1);
    setOntologySheetOpen(true);
  };

  const ready = desktop === true && (runner?.storeStatus === "ok" || runner?.storeStatus === "missing");
  const state = desktop === null ? "loading" : !desktop || !runner ? "app-required" : runner.storeStatus === "no-vault" ? "no-vault"
    : runner.storeStatus === "loading" ? "loading" : ready ? "ready" : runner.storeStatus === "unavailable" ? "unavailable" : "malformed";
  const add = lane === "ontology" ? () => {
    setEditingOntology(null);
    setOntologyDraft((draft) => draft + 1);
    setOntologySheetOpen(true);
  } : onOpenDocumentSchedule;

  const empty = !ready || rounds.length === 0;
  const { hostRef: introHostRef, capture: captureIntro } = useSwapHeight(empty);
  const intro = usePanelPresence(empty);
  const ghost = usePanelPresence(empty);
  /* Empty to filled (or back) within one lane, not a tab switch or a load. */
  const [seen, setSeen] = useState<{ lane: AutomationLane; ready: boolean; empty: boolean; arrived: ReadonlySet<string> | null }>(
    { lane, ready, empty, arrived: null });
  if (seen.lane !== lane || seen.ready !== ready || seen.empty !== empty) {
    const inPlace = seen.lane === lane && seen.ready && ready;
    if (inPlace) captureIntro();
    const arrived = inPlace && seen.empty && !empty;
    setSeen({ lane, ready, empty, arrived: arrived ? new Set(rounds.map((round) => round.id)) : null });
    if (arrived) setSelectedId(null);
  }
  useEffect(() => {
    if (!seen.arrived) return;
    const timer = window.setTimeout(() => setSeen((current) => ({ ...current, arrived: null })), ARRIVAL_MS);
    return () => window.clearTimeout(timer);
  }, [seen.arrived]);
  const arrival = (id: string): { className?: string; style?: CSSProperties } => {
    if (!seen.arrived?.has(id)) return {};
    if (reduced) return { className: "motion-swap-in" };
    return {
      className: listStyles.arriving,
      style: { "--arrive-rise-duration": `${springSettleMs(SPRING.surface)}ms`, "--arrive-rise-easing": springEasing(SPRING.surface) } as CSSProperties,
    };
  };

  const loading = state === "loading";
  const staged = !loading && empty;
  const canHoldSchedules = state === "ready";
  const introCopy = state === "app-required"
    ? { title: t("appRequiredTitle"), description: t("appRequiredDescription"),
      action: <Link href="/download/" className={cn(buttonVariants({ variant: "primary", size: "sm" }), "atlas-touch-floor atlas-touch-floor-wide")}>{t("getApp")}</Link> }
    : state === "no-vault"
      ? { title: t("openFolderTitle"), description: t("openFolderDescription"),
        action: <OpenVaultCta testId="automations-open-vault" className="atlas-touch-floor atlas-touch-floor-wide" /> }
      : { title: t(`${lane}.emptyTitle`), description: t(`${lane}.emptyDescription`) };
  const ghostRow = (className?: string) => <AutomationGhostRow className={className}
    name={t("ghostExample", { name: lane === "ontology" ? t("ontology.defaultName") : tRounds("name.consistency") })}
    cadence={lane === "ontology" ? t("cadence.6h") : t("cadence.hour")} outcome={t("outcome.none")} />;

  return (
    <main id="main" tabIndex={-1} data-testid="automations" data-automations-state={state} data-automations-lane={lane}
      className="atlas-scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      <PageHeaderBar frame="page" title={t("title")}
        tabs={<TabBar variant="segmented" ariaLabel={t("tabsAria")} activeKey={lane} onSelect={(key) => selectLane(key as AutomationLane)}
          idPrefix="automations" testId="automations-tabs"
          items={[
            { key: "ontology", label: t("tabs.ontology"), testId: "automations-tab-ontology" },
            { key: "documents", label: t("tabs.documents"), testId: "automations-tab-documents" },
          ]} />}
        actions={ready ? <Button size="sm" variant={rounds.length === 0 ? "primary" : "outline"} onClick={(event) => {
          // WebKit may activate without focus; keep this opener as the sheet's return point.
          event.currentTarget.focus({ preventScroll: true });
          add();
        }} disabled={lanePending}
          data-testid="automations-new" className="atlas-touch-floor atlas-touch-floor-wide">
          <Plus size={ICON_SIZE.sm} aria-hidden />{t(`${lane}.new`)}
        </Button> : null} />
      <div className={cn(PAGE_FRAME_FORM, "relative", staged || loading ? PAGE_STAGE_FILL : "flex flex-1 flex-col pt-8 md:pt-10 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]")}>
        {loading ? (
          <section id={`automations-tabpanel-${lane}`} role="tabpanel" aria-labelledby={`automations-tab-${lane}`} className="flex min-w-0 flex-1 flex-col">
            <WaitStage mark="mascot" title={t("loadingTitle")} data-testid="automations-loading" aria-busy="true" delayed className={PAGE_WAIT_LIFT} />
          </section>
        ) : (
          <motion.div data-placement={staged ? "stage" : "list"} layout={reduced ? false : "position"} layoutDependency={staged}
            transition={framerSpring(SPRING.surface)} className={cn("flex min-w-0 flex-col gap-6", staged ? "my-auto" : "flex-1")}>
            <p className={`max-w-prose ${PAGE_LEDE}`}>{t("lede")}</p>

            <section id={`automations-tabpanel-${lane}`} role="tabpanel" aria-labelledby={`automations-tab-${lane}`} className="flex min-w-0 flex-1 flex-col gap-5">
              {state === "malformed" || state === "unavailable" ? (
                <EmptyState title={t(`${state}Title`)} description={t(`${state}Description`)} icon={<TriangleAlert />} tone="solid"
                  action={<Button variant="outline" onClick={() => void runner?.refresh()} className="atlas-touch-floor atlas-touch-floor-wide">{t("retry")}</Button>} />
              ) : (
                <div className="grid min-w-0 gap-8">
                  <div className="flex min-w-0 flex-col">
                    <div ref={introHostRef} className="relative min-w-0 overflow-hidden">
                      {intro.mounted ? <div inert={intro.exiting} aria-hidden={intro.exiting || undefined}
                        className={cn(intro.exiting && "motion-swap-out pointer-events-none absolute inset-x-0 top-0")}>
                        <AutomationLaneIntro {...introCopy} />
                      </div> : null}
                    </div>
                    <AutomationListPanel title={t(`${lane}.preview.title`)} count={canHoldSchedules ? rounds.length : null}
                      columns={[t(`${lane}.preview.name`), t(`${lane}.preview.cadence`), t(`${lane}.preview.last`)]}
                      trailing={runner && canHoldSchedules ? <>
                        {runner.running ? <p role="status" className="text-body text-[color:var(--color-indigo-text-soft)]">{t("running", { name: runner.running.roundName })}</p> : null}
                        {/* -mr-3.5 cancels the ghost button's px-3.5 so the label ends on the panel's inner edge. */}
                        {lane === "documents" ? <Link href={withQuery(DESTINATION_HREF.library, selected ? { tab: "rounds", round: selected.id } : { tab: "rounds" })} data-testid="automations-open-library-rounds" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "atlas-touch-floor atlas-touch-floor-wide -mr-3.5")}>
                          <LibraryBig size={ICON_SIZE.sm} aria-hidden />{t("documents.openRounds")}
                        </Link> : null}
                      </> : null}>
                      {empty || !runner ? ghostRow() : <div className="relative">
                        <ul data-testid="automations-list" className="flex flex-col">
                          {rounds.map((round) => <AutomationScheduleRow key={round.id} round={round} runner={runner}
                            expanded={selected?.id === round.id} onToggle={() => setSelectedId(selected?.id === round.id ? null : round.id)}
                            onEdit={() => edit(round)} arrival={arrival(round.id)} />)}
                        </ul>
                        {ghost.mounted && seen.arrived ? ghostRow("motion-swap-out pointer-events-none absolute inset-x-0 top-0") : null}
                      </div>}
                    </AutomationListPanel>
                  </div>
                  <AutomationLaneFacts facts={[
                    { title: t(`${lane}.facts.runs.title`), body: t(`${lane}.facts.runs.body`) },
                    { title: t(`${lane}.facts.when.title`), body: t(`${lane}.facts.when.body`) },
                    { title: t(`${lane}.facts.writes.title`), body: t(`${lane}.facts.writes.body`) },
                  ]} />
                </div>
              )}
            </section>
          </motion.div>
        )}
        <NewOntologyRoundSheet key={ontologyDraft} open={ready && ontologySheetOpen} onClose={() => setOntologySheetOpen(false)} onSave={saveOntology}
          round={editingOntology} allowedHere={editingOntology ? !runner?.notAllowedHere.has(editingOntology.id) : true} />
      </div>
    </main>
  );
}
