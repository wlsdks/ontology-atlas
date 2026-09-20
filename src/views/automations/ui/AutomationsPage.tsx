"use client";

import { CalendarClock, FileSearch, Pause, Play, Plus, ScanSearch, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import type { RoundRecord } from "@/entities/library-round";
import { cadenceKey } from "@/entities/library-round";
import type { RoundsRunnerValue } from "@/features/library-rounds";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import { badgeClass } from "@/shared/ui/badge-class";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Button, Chip, EmptyState, IconButton, InfoHint, RowButton, TabBar, useToast } from "@/shared/ui";

import { NewOntologyRoundSheet } from "./NewOntologyRoundSheet";

type AutomationLane = "ontology" | "documents";

const EMPTY_RUNNER_ROUNDS: RoundRecord[] = [];

function isLaneRound(round: RoundRecord, lane: AutomationLane): boolean {
  return lane === "ontology" ? round.kind === "ontology" : round.kind !== "ontology";
}

function displayTime(locale: string, value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date) : "—";
}

export function AutomationsPage({
  runner,
  onOpenDocumentSchedule,
}: {
  runner: RoundsRunnerValue | null;
  onOpenDocumentSchedule: () => void;
}) {
  const t = useTranslations("automations");
  const locale = useLocale();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const requested = params.get("kind");
  const lane: AutomationLane = requested === "documents" ? "documents" : "ontology";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ontologySheetOpen, setOntologySheetOpen] = useState(false);

  const allRounds = runner?.rounds ?? EMPTY_RUNNER_ROUNDS;
  const rounds = useMemo(() => allRounds.filter((round) => isLaneRound(round, lane)), [allRounds, lane]);
  const entries = runner?.ledger ?? [];
  const selected = rounds.find((round) => round.id === selectedId) ?? rounds[0] ?? null;
  const selectedEntries = selected ? entries.filter((entry) => entry.roundId === selected.id) : [];
  const last = selectedEntries.at(-1) ?? null;
  const next = rounds.filter((round) => round.enabled).sort((a, b) => Date.parse(a.nextDueAt) - Date.parse(b.nextDueAt))[0] ?? null;

  const selectLane = (nextLane: AutomationLane) => {
    const query = new URLSearchParams(params.toString());
    query.set("kind", nextLane);
    router.push(`/automations/?${query}`, { scroll: false });
    setSelectedId(null);
  };

  const saveOntology = async (round: RoundRecord) => {
    if (!runner) return false;
    const saved = await runner.save(round);
    if (saved) toast.show(t("saved", { name: round.name }), "success");
    return saved;
  };

  const cadenceLabel = (round: RoundRecord) => {
    const key = cadenceKey(round.cadence);
    if (key === "hour") return t("cadence.hour");
    if (key === "6h") return t("cadence.6h");
    const time = "daily" in round.cadence ? round.cadence.daily : "09:00";
    return key === "daily" ? t("cadence.dailyAt", { time }) : t("cadence.weekdaysAt", { time });
  };

  const add = lane === "ontology" ? () => setOntologySheetOpen(true) : onOpenDocumentSchedule;
  const icon = lane === "ontology" ? <ScanSearch size={ICON_SIZE.md} aria-hidden /> : <FileSearch size={ICON_SIZE.md} aria-hidden />;

  if (!runner || runner.storeStatus === "no-vault") {
    return (
      <main id="main" tabIndex={-1} data-testid="automations" data-automations-state="app-required" className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--color-canvas)]">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))] pt-8 md:px-8">
          <AutomationHeader t={t} lane={lane} onSelect={selectLane} />
          <div id={`automations-tabpanel-${lane}`} role="tabpanel" aria-labelledby={`automations-tab-${lane}`}>
            <EmptyState title={t("appRequiredTitle")} description={t("appRequiredDescription")} icon={<CalendarClock />} tone="solid" action={<Link href="/download/" className={cn(controlClass({ shape: "link", size: "lg", tone: "accent" }), "atlas-touch-floor atlas-touch-floor-wide")}>{t("getApp")}</Link>} />
          </div>
        </div>
      </main>
    );
  }

  if (runner.storeStatus === "loading") {
    return (
      <main id="main" tabIndex={-1} data-testid="automations" data-automations-state="loading" className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--color-canvas)]">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 pb-12 pt-8 md:px-8">
          <AutomationHeader t={t} lane={lane} onSelect={selectLane} />
          <div id={`automations-tabpanel-${lane}`} role="tabpanel" aria-labelledby={`automations-tab-${lane}`}>
            <EmptyState title={t("loadingTitle")} skeleton tone="solid" />
          </div>
        </div>
      </main>
    );
  }

  if (runner.storeStatus === "malformed" || runner.storeStatus === "unavailable") {
    return (
      <main id="main" tabIndex={-1} data-testid="automations" data-automations-state="malformed" className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--color-canvas)]">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 pb-12 pt-8 md:px-8">
          <AutomationHeader t={t} lane={lane} onSelect={selectLane} />
          <div id={`automations-tabpanel-${lane}`} role="tabpanel" aria-labelledby={`automations-tab-${lane}`}>
            <EmptyState title={t("malformedTitle")} description={t("malformedDescription")} icon={<TriangleAlert />} tone="solid" action={<Button variant="outline" onClick={() => void runner.refresh()} className="atlas-touch-floor atlas-touch-floor-wide">{t("retry")}</Button>} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main" tabIndex={-1} data-testid="automations" data-automations-state="ready" data-automations-lane={lane} className="topology-ui-scale flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      <header className="shrink-0 border-b border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 pb-4 pt-6 md:px-8">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
          <AutomationHeader t={t} lane={lane} onSelect={selectLane} />
        </div>
      </header>

      <div id={`automations-tabpanel-${lane}`} role="tabpanel" aria-labelledby={`automations-tab-${lane}`} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside aria-label={t("indexAria")} className="flex min-h-0 w-full flex-col overflow-hidden border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] lg:w-[var(--docs-list-width)] lg:flex-none lg:border-b-0 lg:border-r">
          <div className="flex-none border-b border-[color:var(--color-overlay-2)] px-3 pb-2.5 pt-4">
            <div className="flex items-center gap-1.5">
              <h2 className="text-body-lg leading-body font-[var(--font-weight-strong)]">{t(lane === "ontology" ? "ontology.indexTitle" : "documents.indexTitle", { count: rounds.length })}</h2>
              <InfoHint label={t(lane === "ontology" ? "ontology.info" : "documents.info")} align="left">{t(lane === "ontology" ? "ontology.info" : "documents.info")}</InfoHint>
            </div>
            <Chip onClick={add} data-testid="automations-new" tone="muted" className="mt-2 w-full justify-start hover:text-[color:var(--color-text-primary)]">
              <Plus size={ICON_SIZE.sm} aria-hidden />
              <span>{t(lane === "ontology" ? "ontology.new" : "documents.new")}</span>
            </Chip>
          </div>
          <ul className="atlas-scroll-quiet min-h-0 flex-1 overflow-y-auto px-1 pb-3 pt-2" data-testid="automations-list">
            {rounds.map((round) => {
              const isRunning = runner.running?.roundId === round.id;
              const pass = entries.filter((entry) => entry.roundId === round.id).at(-1);
              return (
                <li key={round.id}>
                  <RowButton data-testid={`automation-${round.id}`} active={selected?.id === round.id} aria-pressed={selected?.id === round.id} onClick={() => setSelectedId(round.id)} hoverInk="strong" hoverSurface="lift" className="w-full px-2 text-left">
                    <span className="flex-none self-start pt-1 text-[color:var(--color-text-quaternary)]">{isRunning ? <Play size={ICON_SIZE.sm} aria-hidden /> : round.enabled ? <CalendarClock size={ICON_SIZE.sm} aria-hidden /> : <Pause size={ICON_SIZE.sm} aria-hidden />}</span>
                    <span className="min-w-0 flex-1 py-0.5">
                      <span className={cn("block truncate text-body leading-body font-[var(--font-weight-strong)]", round.enabled ? "text-[color:var(--color-text-primary)]" : "text-[color:var(--color-text-tertiary)]")}>{round.name}</span>
                      <span className="mt-0.5 block truncate text-label leading-label text-[color:var(--color-text-quaternary)]">{cadenceLabel(round)} · {isRunning ? t("state.running") : round.enabled ? t("state.on") : t("state.paused")}</span>
                    </span>
                    <span className={badgeClass({ shape: "micro", className: "border border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]" })}>{pass ? t(`outcome.${pass.outcome}`) : t("outcome.none")}</span>
                  </RowButton>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="atlas-scroll-quiet min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-5 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))] pt-6 md:px-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-0 flex-1 text-body leading-body text-[color:var(--color-text-secondary)]">
                <span className="text-[color:var(--color-text-primary)]">{t(lane === "ontology" ? "ontology.count" : "documents.count", { count: rounds.length })}</span>
                {next ? <> · {t("next", { time: displayTime(locale, next.nextDueAt), name: next.name })}</> : null}
                {runner.running ? <> · <span className="text-[color:var(--color-indigo-text-soft)]">{t("running", { name: runner.running.roundName })}</span></> : null}
              </p>
              {selected ? (
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => runner.runNow(selected.id)} disabled={runner.running !== null} data-testid="automations-run-now" className="atlas-touch-floor"><Play size={ICON_SIZE.sm} aria-hidden />{t("runNow")}</Button>
                  <Button variant="ghost" size="sm" onClick={() => void runner.setEnabled(selected.id, !selected.enabled)} data-testid="automations-toggle" className="atlas-touch-floor">{selected.enabled ? <Pause size={ICON_SIZE.sm} aria-hidden /> : <Play size={ICON_SIZE.sm} aria-hidden />}{selected.enabled ? t("pause") : t("resume")}</Button>
                  <IconButton onClick={() => void runner.remove(selected.id)} label={t("removeNamed", { name: selected.name })} data-testid="automations-remove" className="atlas-touch-floor"><Trash2 size={ICON_SIZE.sm} aria-hidden /></IconButton>
                </div>
              ) : null}
            </div>

            <section className="rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-[var(--card-pad)]" data-testid="automations-lane-card">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-[color:var(--color-indigo-text-soft)]">{icon}</span>
                <div className="min-w-0">
                  <h2 className="text-title leading-title font-[var(--font-weight-signature)]">{t(lane === "ontology" ? "ontology.title" : "documents.title")}</h2>
                  <p className="mt-1 text-body leading-body text-[color:var(--color-text-tertiary)]">{t(lane === "ontology" ? "ontology.description" : "documents.description")}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-label leading-label text-[color:var(--color-text-secondary)]"><ShieldCheck size={ICON_SIZE.sm} aria-hidden />{t(lane === "ontology" ? "ontology.guard" : "documents.guard")}</span>
                {lane === "documents" ? <Link href="/library/?tab=rounds" data-testid="automations-open-library-rounds" className={cn(controlClass({ shape: "link", size: "sm", tone: "secondary" }), "atlas-touch-floor")}>{t("documents.openRounds")}</Link> : null}
              </div>
            </section>

            {rounds.length === 0 ? (
          <EmptyState title={t(lane === "ontology" ? "ontology.emptyTitle" : "documents.emptyTitle")} description={t(lane === "ontology" ? "ontology.emptyDescription" : "documents.emptyDescription")} icon={lane === "ontology" ? <ScanSearch size={ICON_SIZE.md} /> : <FileSearch size={ICON_SIZE.md} />} tone="solid" action={<Button onClick={add} className="atlas-touch-floor atlas-touch-floor-wide"><Plus size={ICON_SIZE.sm} aria-hidden />{t(lane === "ontology" ? "ontology.new" : "documents.new")}</Button>} />
            ) : (
              <section className="flex flex-col gap-3" data-testid="automations-history">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-body-lg leading-body font-[var(--font-weight-strong)]">{t("historyTitle")}</h2>
                  {last ? <span className="text-label leading-label text-[color:var(--color-text-quaternary)]">{displayTime(locale, last.endedAt)}</span> : null}
                </div>
                {last ? (
                  <article className="rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-[var(--card-pad)]" data-testid="automations-last-run">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-body leading-body font-[var(--font-weight-strong)]">{selected?.name}</span>
                      <span className="text-label leading-label text-[color:var(--color-indigo-text-soft)]">{t(`outcome.${last.outcome}`)}</span>
                    </div>
                    <p className="mt-2 text-body leading-body text-[color:var(--color-text-tertiary)]">{last.summary || t("noSummary")}</p>
                    {last.refused.length > 0 ? <p className="mt-2 text-label leading-label text-[color:var(--color-danger-text)]">{t("refused", { tools: last.refused.join(", ") })}</p> : null}
                    {last.called.length > 0 ? <p className="mt-1 truncate text-label leading-label text-[color:var(--color-text-quaternary)]" title={last.called.join(", ")}>{t("called", { tools: last.called.join(", ") })}</p> : null}
                  </article>
                ) : (
                  <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">{t("noRuns")}</p>
                )}
              </section>
            )}
          </div>
        </section>
      </div>

      <NewOntologyRoundSheet open={ontologySheetOpen} onClose={() => setOntologySheetOpen(false)} onSave={saveOntology} />
    </main>
  );
}

function AutomationHeader({
  t,
  lane,
  onSelect,
}: {
  t: ReturnType<typeof useTranslations<"automations">>;
  lane: AutomationLane;
  onSelect: (lane: AutomationLane) => void;
}) {
  return (
    <>
      <div>
        <p className="text-caption leading-caption font-[var(--font-weight-strong)] uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-indigo-text-soft)]">{t("eyebrow")}</p>
        <h1 className="mt-2 text-display leading-display font-[var(--font-weight-signature)]">{t("title")}</h1>
        <p className="mt-2 max-w-prose text-body-lg leading-title text-[color:var(--color-text-tertiary)] [word-break:keep-all]">{t("lede")}</p>
      </div>
      <TabBar
        ariaLabel={t("tabsAria")}
        activeKey={lane}
        onSelect={(next) => onSelect(next as AutomationLane)}
        idPrefix="automations"
        testId="automations-tabs"
        placement="header"
        items={[
          { key: "ontology", label: t("tabs.ontology"), testId: "automations-tab-ontology" },
          { key: "documents", label: t("tabs.documents"), testId: "automations-tab-documents" },
        ]}
      />
    </>
  );
}
