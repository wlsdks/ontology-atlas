"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState, type ReactNode } from "react";

import {
  DEFAULT_SERVICE_ROUND_LIMIT,
  type RoundCadence,
  type RoundOnStale,
  type RoundPlace,
  type RoundRecord,
  cadenceFromMinutes,
  deriveRoundKind,
  isValidClockTime,
  nextDueAt,
  roundWidens,
  turnsPerDay,
} from "@/entities/library-round";
import { CadencePicker, type CadenceUnit } from "@/shared/ui/cadence-picker";
import { fieldLabel } from "@/shared/ui/control-class";
import { SegmentedControl } from "@/shared/ui/fields/segmented-control";
import { Button, Dialog, DialogBody, DialogFooter } from "@/shared/ui";

import { capitalize, unusedRoundName } from "../../lib/rounds/round-presentation";
import { initialRoundDraft, placesOfDraft, roundRecordOf, newRoundId, type ServiceDraft } from "../../model/rounds/round-draft";
import { cadenceWords, costLine, mayLines } from "../../model/rounds/round-grants";
import { RoundGrants } from "./RoundGrants";
import { RoundNameTitle } from "./RoundNameTitle";
import { RoundPlacesField } from "./RoundPlacesField";

/**
 * A scheduled check as one sentence, one list of places and one rail. `deriveRoundKind` alone
 * decides the kind: naming a service place makes a service check. State starts fresh on mount; the
 * parent passes a new `key` per open.
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
  round?: RoundRecord | null;
  allowedHere?: boolean;
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
  round = null,
  allowedHere = true,
}: NewRoundSheetProps) {
  const t = useTranslations("library.rounds");
  const locale = useLocale();
  const titleId = useId();
  const staleId = useId();

  const enabledConnectors = useMemo(() => connectors.filter((connector) => connector.enabled), [connectors]);

  const [start] = useState(() => initialRoundDraft(round));
  const [vaultPaths, setVaultPaths] = useState<string[]>(() => [...start.vault.paths]);
  const [ownDocumentsOnly, setOwnDocumentsOnly] = useState(start.vault.ownDocumentsOnly === true);
  const [services, setServices] = useState<ServiceDraft[]>(start.services);
  const [unit, setUnit] = useState<CadenceUnit>(start.unit);
  const [minutes, setMinutes] = useState(start.minutes);
  const [time, setTime] = useState(start.daily?.daily ?? "09:00");
  const [weekdaysOnly, setWeekdaysOnly] = useState(start.daily?.weekdaysOnly ?? false);
  const [onStale, setOnStale] = useState<RoundOnStale>(round?.onStale ?? "redraft");
  const [nameEdited, setNameEdited] = useState<string | null>(round?.name ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const places: RoundPlace[] = useMemo(() => placesOfDraft(vaultPaths, ownDocumentsOnly, services), [ownDocumentsOnly, services, vaultPaths]);

  const kind = deriveRoundKind(places);
  const timeValid = unit !== "day" || isValidClockTime(time);
  const cadence: RoundCadence = unit === "day" ? { daily: timeValid ? time : "09:00", weekdaysOnly } : cadenceFromMinutes(minutes);
  const perDay = turnsPerDay(cadence);

  const readbackCadence = useMemo(
    () => cadenceWords({ unit, minutes, time, weekdaysOnly }, t),
    [minutes, t, time, unit, weekdaysOnly],
  );

  // The cadence is not part of the name: the index and header already say it. A sibling already wearing
  // that name earns a number, or a "run now" press and a ledger row could not be told apart.
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
  const close = () => {
    if (!saving) onClose();
  };

  const limit = services.length > 0 ? round?.limit ?? DEFAULT_SERVICE_ROUND_LIMIT : undefined;
  const widened = round !== null && roundWidens(round, { ...round, kind, cadence, places, onStale, limit });
  const asksToAllow = round === null || !allowedHere || widened;
  const nextRunLabel = round
    ? new Intl.DateTimeFormat(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(nextDueAt(cadence, new Date()))
    : null;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setFailure(null);
    const record = roundRecordOf({ round, name, kind, cadence, places, onStale, services, limit, now: new Date() });
    let saved = false;
    try {
      saved = await onSave(record);
      if (!saved) setFailure(t("sheet.saveFailed", { reason: "write" }));
    } catch {
      setFailure(t("sheet.saveFailed", { reason: "write" }));
    } finally {
      setSaving(false);
    }
    if (saved) onClose();
  };

  const may = mayLines({ kind, onStale, services }, t);
  const cost = costLine({ kind, onStale, turnsPerDay: perDay }, t);

  /** The one ink every control's own word wears inside the readback sentence. */
  const em = (chunks: ReactNode) => <span className="text-[color:var(--color-indigo-text-soft)]">{chunks}</span>;

  const addService = (connector: { id: string; name: string }) => {
    setServices((current) => [
      ...current,
      { key: newRoundId(), connectorId: connector.id, connectorName: connector.name, location: "", query: "" },
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
      onClose={close}
      size="md"
      labelledBy={titleId}
      testId="library-rounds-sheet"
      /*
       * Focus lands on the container, not the name: the name is a click-to-edit title and focusing it on
       * open would draw a full field ring.
       */
      initialFocus="container"
      /*
       * Capped at the window and scrolling inside, since the shared dialog has no height cap and a long
       * form would push the save button below the window; same chrome inset the viewport-sized dialog
       * keeps.
       */
      className="flex max-h-[calc(100dvh-var(--chrome-inset)*2)] flex-col gap-4 overflow-hidden break-keep"
    >
      <fieldset disabled={saving} className="contents disabled:pointer-events-none"
        onPointerDownCapture={(event) => {
          if (!(event.target instanceof Element) || event.target.closest('[data-testid="library-rounds-add-menu"], [data-testid="library-rounds-folder-menu"], [data-testid="library-rounds-add-place"], [data-testid="library-rounds-folders"]')) return;
          setAddOpen(false);
          setFolderMenuOpen(false);
        }}
        onKeyDownCapture={(event) => {
          if (event.key !== "Escape" || (!addOpen && !folderMenuOpen)) return;
          event.preventDefault();
          event.stopPropagation();
          const trigger = addOpen ? "library-rounds-add-place" : "library-rounds-folders";
          setAddOpen(false);
          setFolderMenuOpen(false);
          event.currentTarget.querySelector<HTMLButtonElement>(`[data-testid="${trigger}"]`)?.focus();
        }}>
      <RoundNameTitle name={name} titleId={titleId} saving={saving} editing={round !== null} onNameChange={setNameEdited} />
      <DialogBody className="flex flex-col gap-5 pr-1">
      {/* The sheet reads back what it will do as one sentence before anything is saved. It is a paragraph,
         not a boxed field, since a box around text a person cannot type is false about the control; the
         inked words are the ones the controls below change. */}
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
              cadence: readbackCadence,
              places: services.map((draft) => (draft.location.trim() ? `${capitalize(draft.connectorName)} ${draft.location.trim()}` : capitalize(draft.connectorName))).join(", "),
              em,
            })
          : null}
        {folderNames.length > 0
          ? t.rich(services.length > 0 ? "sheet.readbackFolders" : "sheet.readbackFoldersLead", {
              cadence: readbackCadence,
              folders: folderNames.join(", "),
              em,
            })
          : services.length > 0
            ? t("sheet.readbackWholeFolder")
            : t.rich("sheet.readbackWholeFolderLead", { cadence: readbackCadence, em })}
        {t.rich(onStale === "redraft" ? "sheet.readbackStaleRedraft" : "sheet.readbackStaleMark", { em })}
        {kind === "service"
          ? t("sheet.readbackTurn")
          : round
            ? null
            : passRunning
              ? t("sheet.readbackQueued")
              : t("sheet.readbackNow")}
        {nextRunLabel ? t("sheet.readbackEditNext", { time: nextRunLabel }) : null}
      </p>

      <RoundPlacesField
        folders={folders}
        vaultPaths={vaultPaths}
        ownDocumentsOnly={ownDocumentsOnly}
        folderNames={folderNames}
        services={services}
        enabledConnectors={enabledConnectors}
        showNoAgent={kind === "service" && !agentReady}
        addOpen={addOpen}
        folderMenuOpen={folderMenuOpen}
        onAddOpenChange={setAddOpen}
        onFolderMenuOpenChange={setFolderMenuOpen}
        onToggleFolder={toggleFolder}
        onToggleOwnDocumentsOnly={() => setOwnDocumentsOnly((value) => !value)}
        onAddService={addService}
        onPatchService={patchService}
        onRemoveService={(key) => setServices((current) => current.filter((entry) => entry.key !== key))}
      />

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
        <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">
          {onStale === "redraft" ? t("sheet.redraftHint") : t("sheet.markHint")}
        </p>
      </div>

      <RoundGrants lines={may} cost={cost.text} costAlarming={cost.alarming} widens={round !== null && widened} />

      {failure ? <p role="alert" className="text-body leading-body text-[color:var(--color-danger-text)]">{failure}</p> : null}

      </DialogBody>
      </fieldset>
      <DialogFooter>
        <Button variant="ghost" onClick={close} disabled={saving} className="atlas-touch-floor atlas-touch-floor-wide">
          {t("sheet.cancel")}
        </Button>
        <Button onClick={() => void save()} disabled={!canSave} data-testid="library-rounds-allow" className="atlas-touch-floor atlas-touch-floor-wide">
          {saving
            ? round ? t("sheet.savingChanges") : t("sheet.saving")
            : !round ? t("sheet.allowAndSave") : asksToAllow ? t("sheet.allowAndSaveEdit") : t("sheet.saveChanges")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
