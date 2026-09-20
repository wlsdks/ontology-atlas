"use client";

import { Cable, Check, Folder, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import {
  DEFAULT_SERVICE_ROUND_LIMIT,
  type RoundCadence,
  type RoundOnStale,
  type RoundPlace,
  type RoundPlaceService,
  type RoundRecord,
  cadenceFromMinutes,
  deriveRoundKind,
  isValidClockTime,
  nextDueAt,
  turnsPerDay,
} from "@/entities/library-round";
import { cn } from "@/shared/lib/cn";
import { CadencePicker, type CadenceUnit } from "@/shared/ui/cadence-picker";
import { controlClass, fieldLabel } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { transientSurface } from "@/shared/ui/transient-surface";
import { Button, Chip, Dialog, IconButton, Surface } from "@/shared/ui";
import { Input } from "@/shared/ui/input";

import { capitalize, serviceExample, unusedRoundName } from "../../lib/round-presentation";

/**
 * **New round** — one sentence, one list of places, one rail.
 *
 * Specs: `docs/superpowers/specs/2026-09-17-library-rounds-design.md` §9.3 and
 * `docs/superpowers/specs/2026-09-21-round-cadence-and-scope.md` §2–§3.
 *
 * ## What the owner rejected, and what replaced it
 *
 * The first sheet was box soup: every question wore the same 40px bordered rectangle, the
 * readback sat in a box that read as a text field, and the selected chip was barely darker
 * than its siblings, so nothing on the screen said which thing was the point. Three moves fix
 * the hierarchy without adding a primitive:
 *
 * 1. **The readback is the lead paragraph**, unboxed, at `text-body-lg`. The words each
 *    control changes — the cadence, the places, the stale action — are inked
 *    `--color-indigo-text-soft`, so every press is visible *in the sentence* rather than only
 *    in the control that made it.
 * 2. **The name is the title.** An `h2` you click to edit, the way the project page's name
 *    works, instead of a separate field at the bottom of a form asking what to call a thing
 *    the sheet has already described.
 * 3. **The rail is the protagonist.** The unit is a compact segmented control and the track
 *    below it fills the column, because "how often" is the choice the owner came to make.
 *
 * ## The kind is derived, never chosen
 *
 * "What to check" used to be a two-chip question whose answer a person had to translate into
 * consequences. It is now "what to look at": a list of places. A round that names a service
 * spends an agent turn per pass and is a service round; one that names none is the local
 * check. `deriveRoundKind` is the only place that decides, and the legacy `connectorId`,
 * `connectorName` and `query` are still written from the first service place so a build older
 * than 2026-09-21 reads the record it finds.
 *
 * The form's state lives in this component and starts fresh on mount; the parent gives the
 * sheet a new `key` each time it opens, so a cancelled draft never leaks into the next one.
 */

export interface NewRoundSheetProps {
  open: boolean;
  onClose: () => void;
  connectors: readonly { id: string; name: string; enabled: boolean }[];
  agentReady: boolean;
  /** Real folders in the open folder, so a watched path is picked and never typed. */
  folders: readonly string[];
  onSave: (round: RoundRecord) => Promise<boolean>;
  /** The names already in the index, so a second round of the same shape is told apart from the first. */
  existingNames: readonly string[];
  /** A pass is in flight, so this round's first one waits for its due time rather than starting now. */
  passRunning: boolean;
}

/** A service place while it is being edited: the key keeps React rows stable as fields change. */
interface ServiceDraft {
  key: string;
  connectorId: string;
  connectorName: string;
  location: string;
  query: string;
}

/**
 * From this many agent turns a day the cost line changes ink, not words (spec §2.3: "every 30
 * minutes or faster"). Thirty minutes is exactly 48, and it is the first cadence the spec names
 * as too much, so the comparison includes it.
 */
const COST_ALARM_TURNS_PER_DAY = 48;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function NewRoundSheet({
  open,
  onClose,
  connectors,
  agentReady,
  folders,
  onSave,
  existingNames,
  passRunning,
}: NewRoundSheetProps) {
  const t = useTranslations("library.rounds");
  const titleId = useId();
  const placesId = useId();
  const staleId = useId();

  const enabledConnectors = useMemo(() => connectors.filter((connector) => connector.enabled), [connectors]);

  const [vaultPaths, setVaultPaths] = useState<string[]>([]);
  const [ownDocumentsOnly, setOwnDocumentsOnly] = useState(false);
  const [services, setServices] = useState<ServiceDraft[]>([]);
  /*
   * Hours at one hour is the cadence every round had before the rail existed, and it is the
   * one the minute rail cannot say — its detents stop at 30 — so opening on Minutes would put
   * the thumb somewhere the value is not.
   */
  const [unit, setUnit] = useState<CadenceUnit>("hours");
  const [minutes, setMinutes] = useState(60);
  const [time, setTime] = useState("09:00");
  const [weekdaysOnly, setWeekdaysOnly] = useState(false);
  const [onStale, setOnStale] = useState<RoundOnStale>("redraft");
  const [nameEdited, setNameEdited] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  const places: RoundPlace[] = useMemo(() => {
    const vault: RoundPlace = { kind: "vault", paths: vaultPaths };
    if (ownDocumentsOnly) (vault as { ownDocumentsOnly?: boolean }).ownDocumentsOnly = true;
    return [
      vault,
      ...services.map<RoundPlaceService>((draft) => {
        const place: RoundPlaceService = { kind: "service", connectorId: draft.connectorId, connectorName: draft.connectorName };
        if (draft.location.trim()) place.location = draft.location.trim();
        if (draft.query.trim()) place.query = draft.query.trim();
        return place;
      }),
    ];
  }, [ownDocumentsOnly, services, vaultPaths]);

  const kind = deriveRoundKind(places);
  const timeValid = unit !== "day" || isValidClockTime(time);
  const cadence: RoundCadence = unit === "day" ? { daily: timeValid ? time : "09:00", weekdaysOnly } : cadenceFromMinutes(minutes);
  const perDay = turnsPerDay(cadence);

  const cadenceWords = useMemo(() => {
    if (unit === "day") return weekdaysOnly ? t("sheet.readbackWeekdays", { time }) : t("sheet.readbackDaily", { time });
    if (minutes === 60) return t("sheet.readbackHour");
    if (minutes === 360) return t("sheet.readback6h");
    return minutes < 60 ? t("cadence.everyMinutes", { count: minutes }) : t("cadence.everyHours", { count: minutes / 60 });
  }, [minutes, t, time, unit, weekdaysOnly]);

  // The cadence is not part of the name: the index and the header already say it, and a
  // name holding a separator reads as two fields wherever the name sits in a sentence.
  //
  // **A sibling already wearing that name earns a number.** Two rounds saved with the default
  // name stood in the index, the header and every ledger row as the same word, so neither the
  // "run now" press nor a row of the ledger could be attributed to one of them.
  const derivedName = useMemo(
    () =>
      unusedRoundName(
        services.length > 0 ? capitalize(services[0].connectorName) : t("name.consistency"),
        existingNames,
      ),
    [existingNames, services, t],
  );
  const name = nameEdited ?? derivedName;

  const folderNames = ownDocumentsOnly ? [...vaultPaths, t("sheet.placeOwn")] : vaultPaths;
  const canSave =
    name.trim().length > 0 && timeValid && (kind === "consistency" || agentReady) && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setFailure(null);
    const now = new Date();
    const record: RoundRecord = {
      id: newId(),
      name: name.trim(),
      kind,
      cadence,
      enabled: true,
      places,
      createdAt: now.toISOString(),
      nextDueAt: nextDueAt(cadence, now).toISOString(),
    };
    record.onStale = onStale;
    /*
     * The legacy fields are written from the **first** service place (spec §3.2): a build
     * before 2026-09-21 knows only one connector per round, and a record it cannot read is a
     * round that silently stops running after a downgrade.
     */
    const first = services[0];
    if (first) {
      record.connectorId = first.connectorId;
      record.connectorName = first.connectorName;
      record.query = first.query.trim();
      record.limit = DEFAULT_SERVICE_ROUND_LIMIT;
    }
    const saved = await onSave(record);
    setSaving(false);
    if (saved) onClose();
    else setFailure(t("sheet.saveFailed", { reason: "write" }));
  };

  const may: string[] = [t("sheet.mayReadVault")];
  for (const draft of services) {
    const service = capitalize(draft.connectorName);
    may.push(
      draft.location.trim()
        ? t("sheet.mayCallPlace", { service, location: draft.location.trim() })
        : t("sheet.mayCallConnector", { service }),
    );
  }
  if (kind === "service") {
    may.push(t("sheet.mayWriteSources"));
    may.push(t("sheet.mayWritePages"));
  } else if (onStale === "redraft") {
    may.push(t("sheet.mayWritePages"));
  }
  may.push(t("sheet.mayNothingElse"));

  const cost =
    kind === "service"
      ? t("sheet.costPerPass", { count: perDay })
      : onStale === "redraft"
        ? t("sheet.costOnStale")
        : t("sheet.costNone");
  const costAlarming = kind === "service" && perDay >= COST_ALARM_TURNS_PER_DAY;

  /** The one ink every control's own word wears inside the readback sentence. */
  const em = (chunks: ReactNode) => <span className="text-[color:var(--color-indigo-text-soft)]">{chunks}</span>;

  const addService = (connector: { id: string; name: string }) => {
    setServices((current) => [
      ...current,
      { key: newId(), connectorId: connector.id, connectorName: connector.name, location: "", query: "" },
    ]);
    setAddOpen(false);
  };

  const patchService = (key: string, change: Partial<ServiceDraft>) => {
    setServices((current) => current.map((draft) => (draft.key === key ? { ...draft, ...change } : draft)));
  };

  const toggleFolder = (folder: string) => {
    setVaultPaths((current) => (current.includes(folder) ? current.filter((path) => path !== folder) : [...current, folder]));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      labelledBy={titleId}
      testId="library-rounds-sheet"
      /*
       * **Focus lands on the sheet, not on its name.** The name is a click-to-edit title, so
       * taking focus on open drew a full field ring around it — the "this is a text box" look
       * the owner objected to in the first sheet. The container takes focus instead; the title
       * is the first thing Tab reaches and shows its ring only then.
       */
      initialFocus="container"
      /*
       * Capped at the window and scrolling inside: a round with two service places, its
       * folder chips and the scope list runs past a 720px window, and the shared dialog has
       * no height cap of its own, so "Allow and save" stood below the window with no way to
       * reach it (measured in the rounds spec, 2026-09-20). The cap uses the same chrome
       * inset the viewport-sized dialog keeps.
       */
      className="flex max-h-[calc(100vh-var(--chrome-inset)*2)] flex-col gap-5 overflow-y-auto atlas-scroll-quiet"
    >
      {/*
        **The name is the title.** Click it and it is a field, the way the project page's own
        name works; there is no second "Name" box at the foot of the form asking what to call
        the thing the paragraph below has already described.
      */}
      {renaming ? (
        <div className="min-w-0">
          <h2 id={titleId} className="sr-only">
            {name}
          </h2>
          <Input
            ref={renameRef}
            size="lg"
            value={name}
            aria-label={t("sheet.nameAria")}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setNameEdited(event.target.value)}
            onBlur={() => setRenaming(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault();
                setRenaming(false);
              }
            }}
            data-testid="library-rounds-name"
            className="w-full"
          />
        </div>
      ) : (
        <h2 id={titleId} className="min-w-0">
          <button
            type="button"
            onClick={() => setRenaming(true)}
            data-testid="library-rounds-rename"
            title={t("sheet.rename")}
            className={controlClass({
              shape: "row",
              size: "md",
              hoverSurface: "lift",
              className: "-mx-2 w-full justify-start px-2 text-title leading-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]",
            })}
          >
            <span className="min-w-0 truncate">{name}</span>
            <Pencil size={ICON_SIZE.sm} aria-hidden className="flex-none text-[color:var(--color-text-quaternary)]" />
          </button>
        </h2>
      )}

      {/*
        **The sheet reads back what it will do, as one sentence, before anything is saved**
        (owner on the installed app, 2026-09-19: the screen was "hard to operate", compared
        with tools that show the result of each choice as it is made). It is a paragraph, not
        a boxed field: a box around a sentence a person cannot type into is a lie about what
        the control is. The inked words are exactly the ones the controls below change.
      */}
      <p
        data-testid="library-rounds-readback"
        role="status"
        aria-live="polite"
        className="text-body-lg leading-title text-[color:var(--color-text-secondary)] [word-break:keep-all]"
      >
        {/*
          The cadence leads whichever clause comes first, so each language keeps its own word
          order and no fragment is a bare placeholder with nothing of the language in it.
        */}
        {services.length > 0
          ? t.rich("sheet.readbackServices", {
              cadence: cadenceWords,
              places: services.map((draft) => (draft.location.trim() ? `${capitalize(draft.connectorName)} ${draft.location.trim()}` : capitalize(draft.connectorName))).join(", "),
              em,
            })
          : null}
        {folderNames.length > 0
          ? t.rich(services.length > 0 ? "sheet.readbackFolders" : "sheet.readbackFoldersLead", {
              cadence: cadenceWords,
              folders: folderNames.join(", "),
              em,
            })
          : services.length > 0
            ? t("sheet.readbackWholeFolder")
            : t.rich("sheet.readbackWholeFolderLead", { cadence: cadenceWords, em })}
        {t.rich(onStale === "redraft" ? "sheet.readbackStaleRedraft" : "sheet.readbackStaleMark", { em })}
        {kind === "service"
          ? t("sheet.readbackTurn")
          : passRunning
            ? t("sheet.readbackQueued")
            : t("sheet.readbackNow")}
      </p>

      {/* ---- What to look at ------------------------------------------------------------- */}

      <div className="flex flex-col gap-2">
        <p id={placesId} className={fieldLabel()}>
          {t("sheet.places")}
        </p>
        <ul aria-labelledby={placesId} data-testid="library-rounds-places" className="flex flex-col">
          <li
            data-testid="library-rounds-place-vault"
            className="flex flex-col gap-2 border-t border-[color:var(--color-divider)] py-2.5"
          >
            <div className="flex min-w-0 items-start gap-2">
              <Folder size={ICON_SIZE.sm} aria-hidden className="mt-0.5 flex-none text-[color:var(--color-text-quaternary)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-body leading-body text-[color:var(--color-text-primary)]">{t("sheet.placeVault")}</span>
                <span className="mt-0.5 block text-label leading-label text-[color:var(--color-text-quaternary)]">
                  {folderNames.length > 0 ? folderNames.join(" · ") : t("sheet.placeVaultAll")}
                </span>
              </span>
              {/* The first row is the folder itself and has no remove press: a round with no
                  place at all would be a rule about nothing. */}
              <span className="relative flex-none">
                <Chip
                  size="md"
                  tone="muted"
                  onClick={() => setFolderMenuOpen((value) => !value)}
                  aria-expanded={folderMenuOpen}
                  data-testid="library-rounds-folders"
                >
                  {t("sheet.chooseFolders")}
                </Chip>
                <Surface
                  open={folderMenuOpen}
                  motion="chrome"
                  role="group"
                  aria-label={t("sheet.chooseFolders")}
                  className="absolute right-0 top-[calc(100%+4px)] z-10 max-h-56 w-64 overflow-y-auto atlas-scroll-quiet p-1.5"
                  {...transientSurface("menu")}
                  data-testid="library-rounds-folder-menu"
                >
                  <button
                    type="button"
                    onClick={() => setOwnDocumentsOnly((value) => !value)}
                    className={controlClass({ shape: "row", size: "md", active: ownDocumentsOnly, hoverSurface: "lift", className: "w-full justify-start text-left" })}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body leading-body">{t("sheet.placeOwn")}</span>
                      <span className="block truncate text-label leading-label text-[color:var(--color-text-quaternary)]">{t("sheet.placeOwnDetail")}</span>
                    </span>
                    {ownDocumentsOnly ? <Check size={ICON_SIZE.sm} aria-hidden className="flex-none" /> : null}
                  </button>
                  {folders.length === 0 ? (
                    <p className="px-2 py-1.5 text-label leading-label text-[color:var(--color-text-quaternary)]">{t("sheet.noFolders")}</p>
                  ) : (
                    folders.map((folder) => (
                      <button
                        key={folder}
                        type="button"
                        onClick={() => toggleFolder(folder)}
                        data-folder={folder}
                        className={controlClass({ shape: "row", size: "md", active: vaultPaths.includes(folder), hoverSurface: "lift", className: "w-full justify-start text-left" })}
                      >
                        <span className="min-w-0 flex-1 truncate text-body leading-body">{folder}</span>
                        {vaultPaths.includes(folder) ? <Check size={ICON_SIZE.sm} aria-hidden className="flex-none" /> : null}
                      </button>
                    ))
                  )}
                </Surface>
              </span>
            </div>
            {vaultPaths.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pl-6">
                {vaultPaths.map((folder) => (
                  <Chip key={folder} size="md" tone="muted" onClick={() => toggleFolder(folder)} aria-label={t("sheet.removeFolder", { folder })}>
                    <span className="truncate">{folder}</span>
                    <Trash2 size={ICON_SIZE.sm} aria-hidden />
                  </Chip>
                ))}
              </div>
            ) : null}
          </li>

          {services.map((draft, index) => (
            <li
              key={draft.key}
              data-testid={`library-rounds-place-${index}`}
              data-connector={draft.connectorName}
              className="flex flex-col gap-2 border-t border-[color:var(--color-divider)] py-2.5"
            >
              <div className="flex min-w-0 items-start gap-2">
                {/* The kind glyph, matching the folder row above it — never a rotated plus,
                    which reads as a close button sitting at the head of the row. */}
                <Cable size={ICON_SIZE.sm} aria-hidden className="mt-0.5 flex-none text-[color:var(--color-text-quaternary)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-body leading-body text-[color:var(--color-text-primary)]">{capitalize(draft.connectorName)}</span>
                  <span className="mt-0.5 block text-label leading-label text-[color:var(--color-text-quaternary)]">
                    {draft.location.trim() || t("sheet.whereAnywhere")}
                  </span>
                </span>
                <IconButton
                  size="md"
                  label={t("sheet.removePlace", { place: capitalize(draft.connectorName) })}
                  onClick={() => setServices((current) => current.filter((entry) => entry.key !== draft.key))}
                  data-testid={`library-rounds-place-${index}-remove`}
                  className="flex-none"
                >
                  <Trash2 size={ICON_SIZE.sm} aria-hidden />
                </IconButton>
              </div>
              <div className="grid grid-cols-2 gap-2 pl-6">
                <Input
                  label={t("sheet.where")}
                  value={draft.location}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => patchService(draft.key, { location: event.target.value })}
                  placeholder={t("sheet.wherePlaceholder")}
                  data-testid={`library-rounds-place-${index}-where`}
                />
                <Input
                  label={t("sheet.query")}
                  value={draft.query}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => patchService(draft.key, { query: event.target.value })}
                  placeholder={t(`sheet.queryPlaceholder${serviceExample(draft.connectorName)}`)}
                  data-testid={`library-rounds-place-${index}-query`}
                />
              </div>
            </li>
          ))}
        </ul>

        <div className="relative self-start border-t border-transparent">
          <Chip
            size="md"
            tone="muted"
            onClick={() => setAddOpen((value) => !value)}
            aria-expanded={addOpen}
            data-testid="library-rounds-add-place"
          >
            <Plus size={ICON_SIZE.sm} aria-hidden />
            {t("sheet.addPlace")}
          </Chip>
          <Surface
            open={addOpen}
            motion="chrome"
            role="menu"
            aria-label={t("sheet.addPlace")}
            className="absolute left-0 top-[calc(100%+4px)] z-10 w-72 p-1.5"
            {...transientSurface("menu")}
            data-testid="library-rounds-add-menu"
          >
            {enabledConnectors.length === 0 ? (
              <p className="px-2 py-1.5 text-label leading-label text-[color:var(--color-text-quaternary)]">{t("sheet.addNoConnector")}</p>
            ) : (
              enabledConnectors.map((connector) => (
                <button
                  key={connector.id}
                  type="button"
                  role="menuitem"
                  onClick={() => addService(connector)}
                  data-connector={connector.name}
                  className={controlClass({ shape: "row", size: "md", hoverSurface: "lift", className: "w-full justify-start text-left" })}
                >
                  <span className="min-w-0 flex-1 truncate text-body leading-body">{capitalize(connector.name)}</span>
                </button>
              ))
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAddOpen(false);
                setFolderMenuOpen(true);
              }}
              className={controlClass({ shape: "row", size: "md", hoverSurface: "lift", className: "w-full justify-start text-left" })}
            >
              <span className="min-w-0 flex-1 truncate text-body leading-body">{t("sheet.addFolder")}</span>
            </button>
          </Surface>
        </div>
        {kind === "service" && !agentReady ? (
          <p className="text-body leading-body text-[color:var(--color-amber-source-a90)]">{t("sheet.noAgent")}</p>
        ) : null}
      </div>

      {/* ---- How often — the protagonist -------------------------------------------------- */}

      <CadencePicker
        unit={unit}
        onUnitChange={setUnit}
        minutes={minutes}
        onMinutesChange={setMinutes}
        daily={time}
        weekdaysOnly={weekdaysOnly}
        onDayChange={(next) => {
          setTime(next.daily);
          setWeekdaysOnly(next.weekdaysOnly);
        }}
        timeValid={timeValid}
        testId="library-rounds-cadence"
        labels={{
          legend: t("sheet.how"),
          unitMinutes: t("picker.unitMinutes"),
          unitHours: t("picker.unitHours"),
          unitDay: t("picker.unitDay"),
          detent: (value) => String(value < 60 ? value : value / 60),
          valueText: (value) =>
            value < 60 ? t("picker.valueMinutes", { count: value }) : t("picker.valueHours", { count: value / 60 }),
          railAria: t("picker.railAria"),
          daily: t("cadence.dailyChip"),
          weekdays: t("cadence.weekdaysChip"),
          time: t("sheet.time"),
          dayAria: t("picker.dayAria"),
          timeError: "HH:MM",
        }}
      />

      {/* ---- When a page goes stale ------------------------------------------------------- */}

      <div className="flex flex-col gap-2">
        <p id={staleId} className={fieldLabel()}>
          {t("sheet.onStale")}
        </p>
        <SegmentedControl<RoundOnStale>
          labelledBy={staleId}
          value={onStale}
          onChange={setOnStale}
          variant="chips"
          fill
          testId="library-rounds-on-stale"
          options={[
            { value: "redraft", label: t("sheet.redraft") },
            { value: "mark", label: t("sheet.mark") },
          ]}
        />
        <p className="text-label leading-label text-[color:var(--color-text-quaternary)]">
          {onStale === "redraft" ? t("sheet.redraftHint") : t("sheet.markHint")}
        </p>
      </div>

      {/* ---- What this round may do ------------------------------------------------------- */}

      {/*
        A hairline and a list, not a fourth card: this is the one block on the sheet a person
        cannot edit, and a box around it made it look like another question. The cost line
        under the rule keeps the same words at every cadence and only changes ink above 48
        agent turns a day, because a drag that feels good must not out-argue the invoice.
      */}
      <div className="border-t border-[color:var(--color-divider)] pt-3" data-testid="library-rounds-scope">
        <p className={fieldLabel()}>{t("sheet.may")}</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {may.map((line) => (
            <li key={line} className="flex items-start gap-2 text-body leading-body text-[color:var(--color-text-primary)]">
              <Check size={ICON_SIZE.sm} className="mt-0.5 flex-none text-[color:var(--color-indigo-text-soft)]" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p
          className={cn(
            "mt-3 text-label leading-label",
            costAlarming ? "text-[color:var(--color-amber-source-a90)]" : "text-[color:var(--color-text-tertiary)]",
          )}
          data-cost-tone={costAlarming ? "alarming" : "quiet"}
          data-testid="library-rounds-cost"
        >
          {cost}
        </p>
      </div>

      {failure ? <p role="alert" className="text-body leading-body text-[color:var(--color-danger-text)]">{failure}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose} className="atlas-touch-floor atlas-touch-floor-wide">
          {t("sheet.cancel")}
        </Button>
        <Button onClick={() => void save()} disabled={!canSave} data-testid="library-rounds-allow" className="atlas-touch-floor atlas-touch-floor-wide">
          {t("sheet.allowAndSave")}
        </Button>
      </div>
    </Dialog>
  );
}
