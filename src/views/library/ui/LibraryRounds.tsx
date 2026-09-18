"use client";

import { Clock3, Pause, Play, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type { RoundPassEntry, RoundRecord } from "@/entities/library-round";
import { cadenceKey } from "@/entities/library-round";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import { badgeClass } from "@/shared/ui/badge-class";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { PAGE_FRAME_FORM } from "@/shared/ui/page-frame";
import { Button, Chip, EmptyState, IconButton, InfoHint, RowButton, useToast } from "@/shared/ui";

import { useLibraryRounds } from "../lib/library-rounds-context";
import { lastOutcome, lastPass, nextRound, sinceSpan, summarizeSince } from "../lib/round-presentation";
import { NewRoundSheet } from "./parts/NewRoundSheet";
import { EmptyShape } from "./parts/EmptyShape";
import { RoundsLedger } from "./parts/RoundsLedger";
import { SinceYouLeft } from "./parts/SinceYouLeft";

/**
 * **Rounds** — the fifth Library tab (spec §9).
 *
 * Index on the left, in the Library's own column: the rounds this Mac keeps, one row each, and
 * the New round press. Stage on the right: a header line saying what ran last and what runs
 * next, the morning card, then the ledger on its axis. Selecting a round in the index filters
 * the ledger to it and puts its own presses (run now, pause, remove) in the header.
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
  const toast = useToast();
  const runner = useLibraryRounds();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetNonce, setSheetNonce] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  const time = useMemo(() => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }), [locale]);
  const dayTime = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }), [locale]);
  const now = new Date();
  const todayKey = now.toDateString();

  const rounds = runner?.rounds ?? EMPTY_ROUNDS;
  const entries = runner?.ledger ?? EMPTY_ENTRIES;
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
  const last = lastPass(entries);
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
    if (key === "daily") return t("cadence.daily", { time: at });
    return t("cadence.weekdays", { time: at });
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
    if (entry.outcome === "refused" || entry.outcome === "failed") return { text: t(`outcome.${entry.outcome}`), tone: "danger" as const };
    return { text: t("outcome.held"), tone: "quiet" as const };
  };

  const toneClass = {
    quiet: "border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]",
    amber: "border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]",
    indigo: "border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] text-[color:var(--color-indigo-text-soft)]",
    danger: "border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a12)] text-[color:var(--color-danger-text)]",
  };

  const openSheet = () => {
    setSheetNonce((value) => value + 1);
    setSheetOpen(true);
  };

  const save = async (round: RoundRecord) => {
    if (!runner) return false;
    const ok = await runner.save(round);
    if (ok) {
      toast.show(t("sheet.saved", { name: round.name, time: dueLabel(round.nextDueAt) }), "success");
      setSelectedId(round.id);
    }
    return ok;
  };

  const removeRound = async (round: RoundRecord) => {
    if (!runner) return;
    await runner.remove(round.id);
    if (selectedId === round.id) setSelectedId(null);
  };

  const setAll = async (enabled: boolean) => {
    if (!runner) return;
    for (const round of rounds) if (round.enabled !== enabled) await runner.setEnabled(round.id, enabled);
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

  const headerLine = runner.running
    ? t("header.running", { name: runner.running.roundName })
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
      data-rounds-running={runner.running ? runner.running.phase : undefined}
      className="topology-ui-scale relative flex min-h-0 w-full flex-1 bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)] max-lg:flex-col"
    >
      <aside
        data-testid="library-rounds-index"
        aria-label={t("indexAria")}
        className="flex w-full min-w-0 min-h-0 flex-col overflow-hidden bg-[color:var(--color-panel)] max-lg:max-h-[40vh] max-lg:border-b max-lg:border-[color:var(--color-border-soft)] lg:w-[var(--docs-list-width)] lg:flex-none lg:border-r lg:border-[color:var(--color-border-soft)]"
      >
        {/*
          **The same column head the other four tabs draw** (2026-09-17). The strip already
          says "Rounds" and carries the count of the ones that are on; this column said
          "Rounds · 3" 38 px below it — one thing, two numbers, neither labelled — while
          Sources and Wiki carry no name at all since the owner's decision this morning. The
          name is now assistive-only, the glyph keeps the seat the Library's info glyph has
          (x 76), and the door below takes the seat the search field takes (76–331), so
          switching tabs changes what the column lists and nothing about where it sits.
        */}
        <div className="flex-none border-b border-[color:var(--color-overlay-2)] px-3 pb-2.5 pt-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="sr-only">{t("indexHeader", { count: rounds.length })}</h1>
            <InfoHint label={t("lede")} align="left">{t("lede")}</InfoHint>
          </div>
          {/*
            The column's door wears the column's door grammar — the muted, left-reading chip
            "Add files" and "Bring from a service" wear one tab away. As a filled 40px indigo
            slab it measured the loudest object on the screen (255 × 40 of solid
            `--color-indigo`), which put the attention winner on a door to a form instead of
            on the morning card that says what went stale. The filled press still exists
            where the commitment is made: the sheet's "Allow and save", and the empty stage.
          */}
          <div className="mt-2 min-w-0">
            <Chip
              onClick={openSheet}
              data-testid="library-rounds-new"
              tone="muted"
              className="w-full justify-start hover:text-[color:var(--color-text-primary)]"
            >
              <Plus size={ICON_SIZE.sm} aria-hidden />
              <span className="min-w-0 truncate">{t("newRound")}</span>
            </Chip>
          </div>
        </div>
        <ul className="atlas-scroll-quiet min-h-0 flex-1 overflow-y-auto px-1 pb-3 pt-2" data-testid="library-rounds-list">
          {rounds.map((round) => {
            const word = outcomeWord(round);
            const isRunning = runner.running?.roundId === round.id;
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
                    The leading glyph the source and page rows carry, which is what puts this
                    row's name on the list's text edge (96 at 1512) instead of 82, and what
                    spec §9.1 asked for: the round's state, readable without reading.
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
                      {cadenceWords(round)} · {isRunning ? t("state.running") : round.enabled ? t("state.on") : t("state.paused")}
                    </span>
                  </span>
                  <span className={badgeClass({ shape: "micro", className: cn("border shrink-0", toneClass[word.tone]) })}>{word.text}</span>
                </RowButton>
              </li>
            );
          })}
        </ul>
      </aside>

      <section data-testid="library-rounds-stage" className="atlas-scroll-quiet min-h-0 min-w-0 flex-1 overflow-y-auto">
        {/* Left-aligned, not centred: the stage shares one text start line with the index beside it. */}
        <div className="flex w-full max-w-[1120px] flex-col gap-6 px-5 pt-5 md:px-8 md:pt-6 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p data-testid="library-rounds-header-line" className="min-w-0 flex-1 text-body leading-body text-[color:var(--color-text-secondary)]">
                <span className="text-[color:var(--color-text-primary)]">{t("header.rounds", { count: rounds.length })}</span>
                {last ? <> · {t("header.lastPass", { time: dueLabel(last.endedAt) })}</> : null}
                {" · "}
                <span className={runner.running ? "text-[color:var(--color-indigo-text-soft)]" : undefined}>{headerLine}</span>
              </p>
              {selected ? (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runner.runNow(selected.id)}
                    disabled={runner.running !== null}
                    data-testid="library-rounds-run-now"
                    aria-label={t("runNowNamed", { name: selected.name })}
                    className="atlas-touch-floor"
                  >
                    <Play size={ICON_SIZE.sm} aria-hidden />
                    {t("runNow")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void runner.setEnabled(selected.id, !selected.enabled)} className="atlas-touch-floor" data-testid="library-rounds-toggle">
                    {selected.enabled ? <Pause size={ICON_SIZE.sm} aria-hidden /> : <Play size={ICON_SIZE.sm} aria-hidden />}
                    {selected.enabled ? t("pause") : t("resume")}
                  </Button>
                  <IconButton onClick={() => void removeRound(selected)} label={t("removeNamed", { name: selected.name })} data-testid="library-rounds-remove" className="atlas-touch-floor">
                    <Trash2 size={ICON_SIZE.sm} aria-hidden />
                  </IconButton>
                </div>
              ) : rounds.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => void setAll(allPaused)} className="atlas-touch-floor" data-testid="library-rounds-toggle-all">
                  {allPaused ? <Play size={ICON_SIZE.sm} aria-hidden /> : <Pause size={ICON_SIZE.sm} aria-hidden />}
                  {allPaused ? t("resumeAll") : t("pauseAll")}
                </Button>
              ) : null}
            </div>
            <p className="text-label leading-label text-[color:var(--color-text-quaternary)]">{t("limit")}</p>
          </header>

          {rounds.length === 0 ? (
            <EmptyState
              title={t("emptyTitle")}
              description={t("emptyDescription")}
              icon={<Clock3 />}
              shape={<EmptyShape icon={<Clock3 size={ICON_SIZE.md} aria-hidden />} columns={[t("shape.name"), t("shape.cadence"), t("shape.next")]} />}
              tone="solid"
              action={
                <Button className="atlas-touch-floor atlas-touch-floor-wide" onClick={openSheet}>
                  <Plus size={ICON_SIZE.sm} aria-hidden />
                  {t("newRound")}
                </Button>
              }
            />
          ) : (
            <>
              <SinceYouLeft span={span} summary={summary} locale={locale} onOpenPage={openPage} />
              <div className="flex flex-col gap-3">
                <h2 className="text-body-lg leading-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                  {t("ledger.title")}
                  {selected ? <span className="ml-2 text-body font-normal text-[color:var(--color-text-tertiary)]">· {selected.name}</span> : null}
                </h2>
                <RoundsLedger
                  entries={shownEntries}
                  locale={locale}
                  onOpenPage={openPage}
                  nextDueLabel={next ? dueLabel(next.nextDueAt) : null}
                  allPaused={allPaused}
                />
              </div>
            </>
          )}
        </div>
      </section>

      <NewRoundSheet
        key={sheetNonce}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        connectors={runner.connectors.map((connector) => ({ ...connector, name: connector.name }))}
        agentReady={runner.agentReady}
        onSave={save}
        existingCount={rounds.length}
      />
    </main>
  );
}

function Header({ t }: { t: ReturnType<typeof useTranslations<"library.rounds">> }) {
  return (
    <header className="min-w-0">
      <p className="text-caption leading-caption font-[var(--font-weight-strong)] uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-indigo-text-soft)]">
        {t("eyebrow")}
      </p>
      <h1 className="mt-2 text-display leading-display font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{t("title")}</h1>
      <p className="mt-2 max-w-prose text-body-lg leading-title text-[color:var(--color-text-tertiary)] [word-break:keep-all]">{t("lede")}</p>
    </header>
  );
}

