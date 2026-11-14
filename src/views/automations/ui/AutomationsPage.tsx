"use client";

import { Plus, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type CSSProperties } from "react";

import { OpenVaultCta } from "@/features/docs-vault-local";
import type { RoundPassEntry, RoundRecord } from "@/entities/library-round";
import { useLocalVault } from "@/entities/vault-session";
import type { RoundsRunnerValue } from "@/features/library-rounds";
import { useRouter } from "@/i18n/navigation";
import { isTauriVaultRuntime } from "@/shared/lib/vault-folder/tauri-vault-fs";
import { cn } from "@/shared/lib/cn";
import { usePanelPresence } from "@/shared/lib/render-timing/use-presence";
import { usePrefersReducedMotion } from "@/shared/lib/render-timing/use-prefers-reduced-motion";
import { MOTION } from "@/shared/motion";
import { SPRING, springEasing, springSettleMs } from "@/shared/motion/spring";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { RoundsLedger } from "@/widgets/round-ledger";
import { Button, EmptyState, FeatureStage, GetAppLink, PageHeaderBar, TabBar, useToast, WaitStage } from "@/shared/ui";

import { PAGE_FRAME_FORM, PAGE_LEDE, PAGE_STAGE_FILL, PAGE_WAIT_LIFT } from "@/shared/ui/tokens/page-frame";
import { AutomationScheduleRow } from "./AutomationScheduleRow";
import { AutomationLaneFacts, AutomationListPanel } from "./AutomationListFrame";
import { AutomationScheduleArtwork } from "./AutomationScheduleArtwork";
import listStyles from "./automation-list-frame.module.css";

import { NewOntologyRoundSheet } from "./NewOntologyRoundSheet";

type AutomationLane = "ontology" | "documents";

const subscribeToRuntime = () => () => {};
const serverRuntimeSnapshot = (): boolean | null => null;

const EMPTY_RUNNER_ROUNDS: RoundRecord[] = [];
const EMPTY_LEDGER: RoundPassEntry[] = [];

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
  const locale = useLocale();
  const desktop = useSyncExternalStore(subscribeToRuntime, isTauriVaultRuntime, serverRuntimeSnapshot);
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const reduced = usePrefersReducedMotion();
  const newButtonRef = useRef<HTMLButtonElement>(null);
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
  const linkedRound = rounds.find((round) => round.id === requestedRound) ?? null;
  const selected = selectedId === undefined
    ? linkedRound ?? rounds[0] ?? null
    : rounds.find((round) => round.id === selectedId) ?? null;
  // The link's filter holds until the person picks a row themselves.
  const documentLedger = useDocumentLedger(runner, lane === "documents", selectedId === undefined ? linkedRound : null);

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
  const stage = usePanelPresence(empty);
  /* Empty to filled (or back) within one lane, not a tab switch or a load. */
  const [seen, setSeen] = useState<{ lane: AutomationLane; ready: boolean; empty: boolean; arrived: ReadonlySet<string> | null }>(
    { lane, ready, empty, arrived: null });
  if (seen.lane !== lane || seen.ready !== ready || seen.empty !== empty) {
    const inPlace = seen.lane === lane && seen.ready && ready;
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
  const broken = state === "malformed" || state === "unavailable";
  const stageCopy = state === "app-required"
    ? { body: t("appRequiredDescription"), action: <GetAppLink data-testid="automations-get-app">{t("getApp")}</GetAppLink> }
    : state === "no-vault"
      ? { body: t("openFolderDescription"),
        action: <OpenVaultCta testId="automations-open-vault" className="atlas-touch-floor atlas-touch-floor-wide" /> }
      : { body: t(`${lane}.facts.runs.body`),
        action: <Button size="lg" data-testid="automations-stage-new" disabled={lanePending} onClick={() => {
          // The header button outlives this stage, so it is the sheet's return point.
          newButtonRef.current?.focus({ preventScroll: true });
          add();
        }}><Plus size={ICON_SIZE.lg} aria-hidden />{t(`${lane}.new`)}</Button> };

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
        actions={ready ? <Button ref={newButtonRef} size="sm" variant="outline" onClick={(event) => {
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
          <div data-placement={staged ? "stage" : "list"} className="relative flex min-w-0 flex-1 flex-col">
            {stage.mounted && !broken ? (
              <section id={staged ? `automations-tabpanel-${lane}` : undefined} role={staged ? "tabpanel" : undefined}
                aria-labelledby={staged ? `automations-tab-${lane}` : undefined}
                inert={stage.exiting} aria-hidden={stage.exiting || undefined}
                className={cn("flex min-w-0 flex-1 flex-col", stage.exiting && "motion-swap-out pointer-events-none absolute inset-0")}>
                <FeatureStage data-testid="automations-empty-workbench"
                  art={(motionState) => <AutomationScheduleArtwork {...motionState}
                    name={t("ghostExample", { name: lane === "ontology" ? t("ontology.defaultName") : tRounds("name.consistency") })}
                    cadence={lane === "ontology" ? t("cadence.6h") : t("cadence.hour")} />}
                  title={t("stageTitle")}
                  body={stageCopy.body}
                  action={stageCopy.action}
                  note={state === "ready" || stage.exiting ? t(`${lane}.facts.writes.body`) : undefined} />
              </section>
            ) : null}
            {staged && broken ? (
              <section id={`automations-tabpanel-${lane}`} role="tabpanel" aria-labelledby={`automations-tab-${lane}`} className="my-auto">
                <EmptyState title={t(`${state}Title`)} description={t(`${state}Description`)} icon={<TriangleAlert />} tone="solid"
                  action={<Button variant="outline" onClick={() => void runner?.refresh()} className="atlas-touch-floor atlas-touch-floor-wide">{t("retry")}</Button>} />
              </section>
            ) : null}
            {!staged && runner ? (
              <div className={cn("flex min-w-0 flex-1 flex-col gap-6", seen.arrived && "motion-swap-in")}>
                <p className={`max-w-prose ${PAGE_LEDE}`}>{t("lede")}</p>
                <section id={`automations-tabpanel-${lane}`} role="tabpanel" aria-labelledby={`automations-tab-${lane}`} className="grid min-w-0 gap-8">
                  <AutomationListPanel title={t(`${lane}.preview.title`)} count={rounds.length}
                    columns={[t(`${lane}.preview.name`), t(`${lane}.preview.cadence`), t(`${lane}.preview.last`)]}
                    trailing={<>
                      {runner.running ? <p role="status" className="text-body text-[color:var(--color-indigo-text-soft)]">{t("running", { name: runner.running.roundName })}</p> : null}
                    </>}>
                    <ul data-testid="automations-list" className="flex flex-col">
                      {rounds.map((round) => <AutomationScheduleRow key={round.id} round={round} runner={runner}
                        expanded={selected?.id === round.id} onToggle={() => setSelectedId(selected?.id === round.id ? null : round.id)}
                        onEdit={() => edit(round)} arrival={arrival(round.id)} />)}
                    </ul>
                  </AutomationListPanel>
                  {documentLedger && runner ? <section data-testid="automations-run-ledger" aria-labelledby="automations-run-ledger-title" className="min-w-0">
                    <RoundsLedger entries={documentLedger.entries} locale={locale} titleFor={documentLedger.titleFor}
                      onOpenPage={(slug) => router.push(`/docs/?slug=${encodeURIComponent(slug.replace(/\.md$/, ""))}`)}
                      running={runner.running && rounds.some((round) => round.id === runner.running?.roundId) ? runner.running : null}
                      heading={<h2 id="automations-run-ledger-title" className={listStyles.panelTitle}>
                        {t("historyTitle")}
                        {documentLedger.round ? <span className="ml-2 font-normal text-[color:var(--color-text-tertiary)]">· {documentLedger.round.name}</span> : null}
                      </h2>} />
                  </section> : null}
                  <AutomationLaneFacts facts={[
                    { title: t(`${lane}.facts.runs.title`), body: t(`${lane}.facts.runs.body`) },
                    { title: t(`${lane}.facts.when.title`), body: t(`${lane}.facts.when.body`) },
                    { title: t(`${lane}.facts.writes.title`), body: t(`${lane}.facts.writes.body`) },
                  ]} />
                </section>
              </div>
            ) : null}
          </div>
        )}
        <NewOntologyRoundSheet key={ontologyDraft} open={ready && ontologySheetOpen} onClose={() => setOntologySheetOpen(false)} onSave={saveOntology}
          round={editingOntology} allowedHere={editingOntology ? !runner?.notAllowedHere.has(editingOntology.id) : true} />
      </div>
    </main>
  );
}

/**
 * The Documents lane's passes, narrowed to the schedule a link named; null until one has run,
 * because the schedule list already says nothing has.
 */
function useDocumentLedger(runner: RoundsRunnerValue | null, shown: boolean, round: RoundRecord | null) {
  const vault = useLocalVault();
  const ledger = runner?.ledger ?? EMPTY_LEDGER;
  const entries = useMemo(() => shown ? ledger.filter((entry) => entry.kind !== "ontology"
    && (!round || entry.roundId === round.id || entry.outcome === "asleep")) : EMPTY_LEDGER, [ledger, round, shown]);
  const pageTitles = useMemo(() => new Map((vault.manifest?.docs ?? []).map((doc) => [doc.slug, doc.title])), [vault.manifest]);
  if (!entries.some((entry) => entry.outcome !== "asleep")) return null;
  const titleFor = (slug: string) => pageTitles.get(slug.replace(/\.md$/, "")) || slug.replace(/^wiki\//, "").replace(/\.md$/, "");
  return { entries, round, titleFor };
}
