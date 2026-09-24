"use client";

import { CalendarClock, Clock3, Pause, Play, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import type { RoundPassEntry, RoundRecord } from "@/entities/library-round";
import { cadenceKey, cadenceMinutes, roundPlaceLabels, roundPlaces } from "@/entities/library-round";
import { useLocalVault } from "@/entities/vault-session";
import { Link, useRouter } from "@/i18n/navigation";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { cn } from "@/shared/lib/cn";
import { badgeClass } from "@/shared/ui/badge-class";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { PAGE_FRAME_FORM } from "@/shared/ui/page-frame";
import { Button, EmptyState, RowButton, buttonVariants } from "@/shared/ui";

import { useLibraryRounds } from "../lib/library-rounds-context";
import { capitalize } from "../lib/round-presentation";
import { lastOutcome, nextRound, sinceSpan, summarizeSince } from "../lib/round-presentation";
import { RoundsLedger } from "./parts/RoundsLedger";
import { SinceYouLeft } from "./parts/SinceYouLeft";
import { RoundsHistoryEmpty } from "./parts/RoundsHistoryEmpty";

/**
 * **Check history** — the Library's read side of document rounds.
 *
 * One centred page: what runs next, the away card, the rounds this Mac keeps, and the ledger.
 * Selecting a round filters the ledger. Schedule controls
 * live in Automations; the Library keeps the execution evidence and page links.
 *
 * The web build has no clock and no agent, so it draws the explanation and the app door and
 * nothing that would be a lie there.
 */
const EMPTY_ENTRIES: RoundPassEntry[] = [];
const EMPTY_ROUNDS: RoundRecord[] = [];

export function LibraryRounds() {
  const t = useTranslations("library.rounds");
  const locale = useLocale();
  const router = useRouter();
  const runner = useLibraryRounds();
  const vault = useLocalVault();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const time = useMemo(() => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }), [locale]);
  const dayTime = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }), [locale]);
  const now = new Date();
  const todayKey = now.toDateString();

  const sourceRounds = runner?.rounds ?? EMPTY_ROUNDS;
  const sourceEntries = runner?.ledger ?? EMPTY_ENTRIES;
  const rounds = useMemo(() => sourceRounds.filter((round) => round.kind !== "ontology"), [sourceRounds]);
  const entries = useMemo(() => sourceEntries.filter((entry) => entry.kind !== "ontology"), [sourceEntries]);
  const runnerState = runner?.state ?? null;
  const selected = rounds.find((round) => round.id === selectedId) ?? null;
  const shownEntries = useMemo(
    () => (selected ? entries.filter((entry) => entry.roundId === selected.id || entry.outcome === "asleep") : entries),
    [entries, selected],
  );
  // `todayKey` stands for the day: the span only changes when the state does or the date turns.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const span = useMemo(() => sinceSpan(runnerState, new Date()), [runnerState, todayKey]);
  const summary = useMemo(() => summarizeSince(entries, span), [entries, span]);
  /*
   * **A running round that is no longer in the index is not running.** Measured in the browser
   * on 2026-09-21: removing a round mid-pass left the header saying "running now · <name>" for
   * a round that was gone. The runner now ends that pass (`stopPassFor`), and this is the
   * second half of the same promise: what the screen says is derived from the rounds that
   * exist, so no race can leave a ghost on it.
   */
  const running = runner?.running && rounds.some((round) => round.id === runner.running?.roundId) ? runner.running : null;
  /** Slug → the title a person knows the page by; a page that is gone keeps its slug. */
  const pageTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const doc of vault.manifest?.docs ?? []) {
      if (doc.title) map.set(doc.slug, doc.title);
    }
    return map;
  }, [vault.manifest]);
  const titleFor = useCallback(
    (slug: string) => pageTitles.get(slug.replace(/\.md$/, "")) ?? slug.replace(/^wiki\//, "").replace(/\.md$/, ""),
    [pageTitles],
  );
  const next = nextRound(rounds);
  const allPaused = rounds.length > 0 && rounds.every((round) => !round.enabled);

  const openPage = (slug: string) => {
    const bare = slug.replace(/\.md$/, "");
    router.push(`/docs/?slug=${encodeURIComponent(bare)}`);
  };

  const cadenceWords = (round: RoundRecord) => {
    const key = cadenceKey(round.cadence);
    const at = "daily" in round.cadence ? round.cadence.daily : "";
    if (key === "hour") return t("cadence.hour");
    if (key === "6h") return t("cadence.6h");
    if (key === "minutes") return t("cadence.everyMinutes", { count: cadenceMinutes(round.cadence) ?? 0 });
    if (key === "hours") return t("cadence.everyHours", { count: (cadenceMinutes(round.cadence) ?? 60) / 60 });
    if (key === "daily") return t("cadence.daily", { time: at });
    return t("cadence.weekdays", { time: at });
  };

  /**
   * The row's second line: **how often**, then **where**. The column exists to say name,
   * cadence and next run (spec §9.1), so the cadence leads and the places take the
   * truncation — with the places first, a row with two connectors cut off the one thing the
   * column is for. A service is named the way its own row names it, capitalised.
   */
  const placeWords = (round: RoundRecord) => {
    const labels = roundPlaceLabels(roundPlaces(round)).map((label) =>
      label.includes(" · ") ? label.split(" · ").map(capitalize).join(" · ") : capitalize(label),
    );
    return labels.length > 0
      ? t("index.subtitle", { cadence: cadenceWords(round), places: labels.join(" · ") })
      : cadenceWords(round);
  };

  const dueLabel = (iso: string) => {
    const date = new Date(iso);
    return date.toDateString() === now.toDateString() ? time.format(date) : dayTime.format(date);
  };

  const outcomeWord = (round: RoundRecord) => {
    const entry = lastOutcome(round, entries);
    if (!entry) return { text: t("outcome.none"), tone: "quiet" as const };
    if (entry.outcome === "stale") return { text: t("outcome.stale", { count: entry.stale.length }), tone: "amber" as const };
    if (entry.outcome === "redrafted") {
      return { text: t("outcome.redrafted", { count: entry.written.filter((p) => p.startsWith("wiki/")).length }), tone: "indigo" as const };
    }
    if (entry.outcome === "reviewed") return { text: t("outcome.reviewed"), tone: "indigo" as const };
    if (entry.outcome === "refused" || entry.outcome === "failed") return { text: t(`outcome.${entry.outcome}`), tone: "danger" as const };
    return { text: t("outcome.held"), tone: "quiet" as const };
  };

  const toneClass = {
    quiet: "border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]",
    amber: "border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]",
    indigo: "border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] text-[color:var(--color-indigo-text-soft)]",
    danger: "border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a12)] text-[color:var(--color-danger-text)]",
  };

  /* ---- Not on this surface ------------------------------------------------------------- */

  if (!runner || runner.storeStatus === "no-vault") {
    return (
      <main id="main" tabIndex={-1} data-testid="library-rounds" data-rounds-state="app-required" className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--color-canvas)]">
        <div className={`${PAGE_FRAME_FORM} flex flex-col gap-6 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]`}>
          <Header t={t} />
          <div data-testid="library-rounds-app-required">
            <EmptyState
              title={t("appRequiredTitle")}
              description={t("appRequiredDescription")}
              icon={<Clock3 />}
              tone="solid"
              action={
                <Link
                  href="/download/"
                  data-testid="library-rounds-get-app"
                  className={cn(controlClass({ shape: "link", size: "lg", tone: "accent" }), "atlas-touch-floor atlas-touch-floor-wide self-start")}
                >
                  {t("getApp")}
                </Link>
              }
            />
          </div>
        </div>
      </main>
    );
  }

  if (runner.storeStatus === "loading") {
    return (
      <main id="main" tabIndex={-1} data-testid="library-rounds" data-rounds-state="loading" className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--color-canvas)]">
        <div className={`${PAGE_FRAME_FORM} flex flex-col gap-6`}>
          <Header t={t} />
          <EmptyState title={t("loadingTitle")} skeleton tone="solid" />
        </div>
      </main>
    );
  }

  if (runner.storeStatus === "malformed" || runner.storeStatus === "unavailable") {
    return (
      <main id="main" tabIndex={-1} data-testid="library-rounds" data-rounds-state="malformed" className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--color-canvas)]">
        <div className={`${PAGE_FRAME_FORM} flex flex-col gap-6`}>
          <Header t={t} />
          <EmptyState
            title={t("malformedTitle")}
            description={t("malformedDescription")}
            icon={<TriangleAlert />}
            tone="solid"
            className="border-[color:var(--color-amber-source-a35)]"
            action={<Button variant="outline" className="atlas-touch-floor atlas-touch-floor-wide" onClick={() => void runner.refresh()}>{t("retry")}</Button>}
          />
        </div>
      </main>
    );
  }

  /* ---- The workbench --------------------------------------------------------------------- */

  const headerLine = running
    ? t("header.running", { name: running.roundName })
    : allPaused
      ? t("header.paused")
      : next
        ? t("header.next", { time: dueLabel(next.nextDueAt), name: next.name })
        : t("header.nothingYet");

  return (
    <main
      id="main"
      tabIndex={-1}
      data-testid="library-rounds"
      data-rounds-state={rounds.length === 0 ? "empty" : "ready"}
      data-rounds-running={running ? running.phase : undefined}
      className="topology-ui-scale relative flex min-h-0 w-full flex-1 bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]"
    >
      <section data-testid="library-rounds-stage" className="atlas-scroll-quiet min-h-0 min-w-0 flex-1 overflow-y-auto">
        {/*
          **The Library page tabs' one content frame** (2026-09-25). Check history and Work
          scope both wear `PAGE_FRAME_FORM`, centred, with nothing beside it: the same width,
          the same start line and the same top, so switching between the two moves nothing
          but the words. Round three had shifted this frame toward an index column; with the
          column folded into the page (below), the shift and the band it left are both gone.
        */}
        <div className={cn(
          PAGE_FRAME_FORM,
          "flex flex-col gap-8 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]",
        )}>
          {/*
            The same page head Work scope draws: eyebrow, display headline, then the status as
            its description. The status line used to be the head, at body size, and the largest
            text on the screen was the empty state's own headline below it.

            No "last pass" in it (round three): the ledger's top row is the last pass, one line
            below, and the header's 09:00 beside the away card's "→ 09:02" read as two different
            "now"s on one screen. The header says how many and what runs next; the ledger says
            what ran.
          */}
          <header className="min-w-0">
            <div className="min-w-0">
              <p className="text-caption leading-caption font-[var(--font-weight-strong)] uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-indigo-text-soft)]">
                {t("eyebrow")}
              </p>
              <h1 className="mt-2 text-display leading-display font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {t("title")}
              </h1>
              <p data-testid="library-rounds-header-line" className="mt-2 max-w-prose text-body-lg leading-title text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
                <span className="text-[color:var(--color-text-secondary)]">{t("header.rounds", { count: rounds.length })}</span>
                {" · "}
                <span className={running ? "text-[color:var(--color-indigo-text-soft)]" : undefined}>{headerLine}</span>
              </p>
              <p className="mt-1.5 text-label leading-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]">{t("limit")}</p>
            </div>
          </header>

          {rounds.length === 0 ? (
            <RoundsHistoryEmpty title={t("emptyTitle")} description={t("emptyDescription")}
              kindsLabel={t("emptyKinds")}
              signalsLabel={t("emptySignals")}
              signals={(["stale", "redrafted", "refused", "held"] as const).map((tone) => ({
                tone, name: t(`signal.${tone}`), body: t(`signal.${tone}Body`),
              }))}
              kinds={[
                { id: "consistency", name: t("kind.consistency"), body: t("kind.consistencyBody") },
                { id: "service", name: t("kind.service"), body: t("kind.serviceBody") },
              ]}
              action={<Link href={`${DESTINATION_HREF.automations}?kind=documents`} data-testid="library-rounds-new"
                className={cn(buttonVariants(), "atlas-touch-floor atlas-touch-floor-wide")}>
                <CalendarClock size={ICON_SIZE.sm} aria-hidden />{t("emptyAction")}</Link>} />
          ) : (
            <>
              <SinceYouLeft span={span} summary={summary} locale={locale} onOpenPage={openPage} titleFor={titleFor} />
              {/*
                **The schedules stand in the page, not in a column beside it** (2026-09-25,
                round four). A 280px index column held two rows and then ~700px of empty
                panel at 949 and 1080 tall, and it pushed this tab's headline 112px right of
                Work scope's at 1512: switching tabs moved the page sideways. The rounds are
                now a section of the same centred form frame every page tab wears, between the
                away card (what happened) and the ledger (each run) it filters. The door to
                Automations heads the section it manages; the help glyph that said the same
                thing as the door's label is gone.
              */}
              <section data-testid="library-rounds-index" aria-labelledby="library-rounds-index-title" className="flex flex-col gap-3">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <h2 id="library-rounds-index-title" className="text-body-lg leading-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                    {t("index.title")}
                  </h2>
                  {/* Schedule changes live in Automations; this door keeps results and controls distinct. */}
                  <Link href={`${DESTINATION_HREF.automations}?kind=documents`} data-testid="library-rounds-new"
                    className={cn(controlClass({ shape: "link", size: "sm", tone: "secondary" }), "atlas-touch-floor")}>
                    <CalendarClock size={ICON_SIZE.sm} aria-hidden />{t("manageAutomations")}
                  </Link>
                </div>
                <ul aria-label={t("indexAria")} data-testid="library-rounds-list"
                  className="grid grid-cols-1 gap-x-4 border-y border-[color:var(--color-divider)] py-1 md:grid-cols-2">
                  {rounds.map((round) => {
                    const word = outcomeWord(round);
                    const isRunning = running?.roundId === round.id;
                    return (
                      <li key={round.id}>
                        <RowButton
                          data-testid={`library-round-${round.id}`}
                          data-round-enabled={round.enabled}
                          onClick={() => setSelectedId((current) => (current === round.id ? null : round.id))}
                          active={selectedId === round.id}
                          aria-pressed={selectedId === round.id}
                          hoverInk="strong"
                          hoverSurface="lift"
                          className="w-full px-2 text-left"
                        >
                          {/*
                            The round's state as a glyph, readable without reading (spec §9.1).
                          */}
                          <span className="flex-none self-start pt-1 text-[color:var(--color-text-quaternary)]">
                            {isRunning ? <Play size={ICON_SIZE.sm} aria-hidden /> : round.enabled ? <Clock3 size={ICON_SIZE.sm} aria-hidden /> : <Pause size={ICON_SIZE.sm} aria-hidden />}
                          </span>
                          <span className="min-w-0 flex-1 py-0.5">
                            <span className="flex items-center gap-2">
                              <span className={cn("truncate text-body leading-body font-[var(--font-weight-strong)]", round.enabled ? "text-[color:var(--color-text-primary)]" : "text-[color:var(--color-text-tertiary)]")}>
                                {round.name}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate text-label leading-label text-[color:var(--color-text-quaternary)]">
                              {placeWords(round)} · {isRunning ? t("state.running") : round.enabled ? t("state.on") : t("state.paused")}
                            </span>
                          </span>
                          <span className={badgeClass({ shape: "micro", className: cn("border shrink-0", toneClass[word.tone]) })}>{word.text}</span>
                        </RowButton>
                      </li>
                    );
                  })}
                </ul>
              </section>
              <div className="flex flex-col gap-3">
                <h2 className="text-body-lg leading-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                  {t("ledger.title")}
                  {selected ? <span className="ml-2 text-body font-normal text-[color:var(--color-text-tertiary)]">· {selected.name}</span> : null}
                </h2>
                <RoundsLedger
                  entries={shownEntries}
                  locale={locale}
                  onOpenPage={openPage}
                  titleFor={titleFor}
                  running={running}
                  nextDueLabel={next ? dueLabel(next.nextDueAt) : null}
                  allPaused={allPaused}
                />
              </div>
            </>
          )}
        </div>
      </section>

    </main>
  );
}

function Header({ t }: { t: ReturnType<typeof useTranslations<"library.rounds">> }) {
  return (
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-caption leading-caption font-[var(--font-weight-strong)] uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-indigo-text-soft)]">
          {t("eyebrow")}
        </p>
        <h1 className="mt-2 text-display leading-display font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{t("title")}</h1>
        <p className="mt-2 max-w-prose text-body-lg leading-title text-[color:var(--color-text-tertiary)] [word-break:keep-all]">{t("lede")}</p>
      </div>
      <Link href={`${DESTINATION_HREF.automations}?kind=documents`} data-testid="library-rounds-manage-automations" className={cn(controlClass({ shape: "link", size: "sm", tone: "secondary" }), "atlas-touch-floor")}>
        <CalendarClock size={ICON_SIZE.sm} aria-hidden />
        {t("manageAutomations")}
      </Link>
    </header>
  );
}
