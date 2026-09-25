"use client";

import { LibraryBig, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";

import { OpenVaultCta } from "@/features/docs-vault-local";
import type { RoundRecord } from "@/entities/library-round";
import type { RoundsRunnerValue } from "@/features/library-rounds";
import { Link, useRouter } from "@/i18n/navigation";
import { isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { cn } from "@/shared/lib/cn";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Button, buttonVariants, EmptyState, TabBar, useToast } from "@/shared/ui";

import { PAGE_FRAME_FORM, PAGE_HEADER_ROW } from "@/shared/ui/page-frame";
import { AutomationScheduleRow } from "./AutomationScheduleRow";
import { AutomationEmptyWorkbench } from "./AutomationEmptyWorkbench";

import { NewOntologyRoundSheet } from "./NewOntologyRoundSheet";

type AutomationLane = "ontology" | "documents";

const subscribeToRuntime = () => () => {};
const serverRuntimeSnapshot = (): boolean | null => null;

const EMPTY_RUNNER_ROUNDS: RoundRecord[] = [];

function isLaneRound(round: RoundRecord, lane: AutomationLane): boolean {
  return lane === "ontology" ? round.kind === "ontology" : round.kind !== "ontology";
}

export function AutomationsPage({
  runner,
  onOpenDocumentSchedule,
}: {
  runner: RoundsRunnerValue | null;
  onOpenDocumentSchedule: () => void;
}) {
  const t = useTranslations("automations");
  const desktop = useSyncExternalStore(subscribeToRuntime, isTauriVaultRuntime, serverRuntimeSnapshot);
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const requested = params.get("kind");
  const lane: AutomationLane = requested === "documents" ? "documents" : "ontology";
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [ontologySheetOpen, setOntologySheetOpen] = useState(false);
  const [ontologyDraft, setOntologyDraft] = useState(0);
  const [lanePending, startLaneTransition] = useTransition();

  const allRounds = runner?.rounds ?? EMPTY_RUNNER_ROUNDS;
  const rounds = useMemo(() => allRounds.filter((round) => isLaneRound(round, lane)), [allRounds, lane]);
  const selected = selectedId === undefined ? rounds[0] ?? null : rounds.find((round) => round.id === selectedId) ?? null;

  const selectLane = (nextLane: AutomationLane) => {
    const query = new URLSearchParams(params.toString());
    query.set("kind", nextLane);
    // The old lane's create action must not remain pressable while navigation commits.
    startLaneTransition(() => router.push(`/automations/?${query}`, { scroll: false }));
    setSelectedId(undefined);
  };

  const saveOntology = async (round: RoundRecord) => {
    if (!runner) return false;
    // `save` answers `{ ok, startedNow }`; an ontology round never starts its first pass on
    // save, so only the verdict is read here.
    const { ok } = await runner.save(round);
    if (ok) toast.show(t("saved", { name: round.name }), "success");
    return ok;
  };

  // A missing file is a new schedule collection, not a failed read. The first save creates it.
  const ready = desktop === true && (runner?.storeStatus === "ok" || runner?.storeStatus === "missing");
  const state = desktop === null ? "loading" : !desktop || !runner ? "app-required" : runner.storeStatus === "no-vault" ? "no-vault"
    : runner.storeStatus === "loading" ? "loading" : ready ? "ready" : "malformed";
  const add = lane === "ontology" ? () => {
    setOntologyDraft((draft) => draft + 1);
    setOntologySheetOpen(true);
  } : onOpenDocumentSchedule;

  // Where no schedule can exist yet (the browser, no folder), the list drops its "0": it would
  // count something this runtime cannot hold. The stage's title is the one empty message.
  const emptyStage = (title: string, description: string, action: ReactNode, canHoldSchedules: boolean) => (
    <AutomationEmptyWorkbench title={title} description={description} action={action}
      previewTitle={t(`${lane}.preview.title`)}
      count={canHoldSchedules ? 0 : null}
      columns={[t(`${lane}.preview.name`), t(`${lane}.preview.cadence`), t(`${lane}.preview.next`)]}
      facts={[
        { title: t(`${lane}.facts.runs.title`), body: t(`${lane}.facts.runs.body`) },
        { title: t(`${lane}.facts.when.title`), body: t(`${lane}.facts.when.body`) },
        { title: t(`${lane}.facts.writes.title`), body: t(`${lane}.facts.writes.body`) },
      ]} />
  );

  return (
    <main id="main" tabIndex={-1} data-testid="automations" data-automations-state={state} data-automations-lane={lane}
      className="atlas-scroll-quiet min-h-0 flex-1 overflow-y-auto bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      <div className={`${PAGE_FRAME_FORM} flex min-h-full flex-col gap-6 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))] lg:pb-[var(--page-bottom-breath)]`}>
        <header className={PAGE_HEADER_ROW}>
          {/* The "runs locally while Atlas is open" fact lives in the lede: as an 11px eyebrow it
              floated alone at the top right, tied to nothing, as a fourth header text size. */}
          <div className="min-w-0">
            <h1 className="text-display font-[var(--font-weight-signature)]">{t("title")}</h1>
            <p className="mt-2 max-w-prose text-body-lg text-[color:var(--color-text-tertiary)]">{t("lede")}</p>
          </div>
        </header>

        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--color-divider)] pb-3">
          <TabBar ariaLabel={t("tabsAria")} activeKey={lane} onSelect={(key) => selectLane(key as AutomationLane)}
            idPrefix="automations" testId="automations-tabs" placement="header"
            items={[
              { key: "ontology", label: t("tabs.ontology"), testId: "automations-tab-ontology" },
              { key: "documents", label: t("tabs.documents"), testId: "automations-tab-documents" },
            ]} />
          {ready && rounds.length > 0 ? <Button variant="outline" onClick={add} disabled={lanePending} data-testid="automations-new" className="atlas-touch-floor atlas-touch-floor-wide">
            <Plus size={ICON_SIZE.sm} aria-hidden />{t(`${lane}.new`)}
          </Button> : null}
        </div>

        <section id={`automations-tabpanel-${lane}`} role="tabpanel" aria-labelledby={`automations-tab-${lane}`} className="flex min-w-0 flex-1 flex-col gap-5">
          {state === "app-required" || state === "no-vault" ? (
            // The same stage as an empty lane: the tabs still switch what each lane would do,
            // and one primary action wins, instead of a one-row notice over a blank screen.
            // Both stages' first press is the 32px primary `Button` most destinations use for
            // theirs: at 40px its 12px corner read as a pill beside them (owner review, 2026-09-26).
            <div className="flex flex-1 flex-col pt-6 pb-8">
              {emptyStage(
                state === "app-required" ? t("appRequiredTitle") : t("openFolderTitle"),
                state === "app-required" ? t("appRequiredDescription") : t("openFolderDescription"),
                state === "app-required"
                  ? <Link href="/download/" className={cn(buttonVariants({ variant: "primary", size: "sm" }), "atlas-touch-floor atlas-touch-floor-wide")}>{t("getApp")}</Link>
                  : <OpenVaultCta testId="automations-open-vault" className="atlas-touch-floor atlas-touch-floor-wide" />,
                false,
              )}
            </div>
          ) : state === "loading" ? (
            <div role="status" aria-busy="true"><EmptyState title={t("loadingTitle")} skeleton tone="solid" /></div>
          ) : state === "malformed" ? (
            <EmptyState title={t("malformedTitle")} description={t("malformedDescription")} icon={<TriangleAlert />} tone="solid"
              action={<Button variant="outline" onClick={() => void runner?.refresh()} className="atlas-touch-floor atlas-touch-floor-wide">{t("retry")}</Button>} />
          ) : runner ? (
            <>
              {/* The count is a quiet label, not a heading: at text-title it matched every row name
                  under it, so the list had no attention winner. */}
              {rounds.length > 0 ? <div data-testid="automations-lane-card" className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="text-body font-[var(--font-weight-emphasis)] tabular-nums text-[color:var(--color-text-secondary)]">{t("scheduleCount", { count: rounds.length })}</h2>
                  <p className="flex items-center gap-1.5 text-body text-[color:var(--color-text-tertiary)]">
                    <ShieldCheck size={ICON_SIZE.sm} className="flex-none" aria-hidden />{t(`${lane}.guard`)}
                  </p>
                </div>
                {runner.running ? <p role="status" className="text-body text-[color:var(--color-indigo-text-soft)]">{t("running", { name: runner.running.roundName })}</p> : null}
                {/* -mr-3.5 cancels the ghost's px-3.5, so the label ends on the cards' right edge
                    instead of 14px inside it; the hover surface overhangs the gutter instead. */}
                {lane === "documents" ? <Link href="/library/?tab=rounds" data-testid="automations-open-library-rounds" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "atlas-touch-floor atlas-touch-floor-wide -mr-3.5")}>
                  <LibraryBig size={ICON_SIZE.sm} aria-hidden />{t("documents.openRounds")}
                </Link> : null}
              </div> : null}
              {rounds.length === 0 ? (
                <div className="flex flex-1 flex-col pt-6 pb-8">
                  {emptyStage(t(`${lane}.emptyTitle`), t(`${lane}.emptyDescription`),
                    <Button size="sm" onClick={add} disabled={lanePending} data-testid="automations-new" className="atlas-touch-floor atlas-touch-floor-wide"><Plus size={ICON_SIZE.sm} aria-hidden />{t(`${lane}.new`)}</Button>,
                    true)}
                </div>
              ) : (
                <ul data-testid="automations-list" className="flex flex-col gap-2">
                  {rounds.map((round) => <AutomationScheduleRow key={round.id} round={round} runner={runner}
                    expanded={selected?.id === round.id} onToggle={() => setSelectedId(selected?.id === round.id ? null : round.id)} />)}
                </ul>
              )}
            </>
          ) : null}
        </section>
        <NewOntologyRoundSheet key={ontologyDraft} open={ready && ontologySheetOpen} onClose={() => setOntologySheetOpen(false)} onSave={saveOntology} />
      </div>
    </main>
  );
}
