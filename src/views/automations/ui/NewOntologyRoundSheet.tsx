"use client";

import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type ChangeEvent } from "react";

import {
  DEFAULT_RECHECK_LIMIT,
  MAX_RECHECK_LIMIT,
  type RoundCadence,
  type RoundRecord,
  cadenceFromMinutes,
  cadenceMinutes,
  isValidClockTime,
  nextDueAt,
  roundWidens,
  turnsPerDay,
} from "@/entities/library-round";
import { cn } from "@/shared/lib/cn";
import { fieldLabel } from "@/shared/ui/control-class";
import { CadencePicker, type CadenceUnit } from "@/shared/ui/cadence-picker";
import { Button, Dialog, DialogBody, DialogFooter } from "@/shared/ui";
import { Input } from "@/shared/ui/fields/input";
import { SegmentedControl } from "@/shared/ui/fields/segmented-control";
import { RECHECK_MAX_SENT_BYTES } from "@/features/library-rounds";

import { formatRecheckSize } from "../model/recheck-size";

/** The documents sheet's threshold: thirty minutes or faster is 48 agent turns a day. */
const COST_ALARM_TURNS_PER_DAY = 48;

export interface NewOntologyRoundSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (round: RoundRecord) => Promise<boolean>;
  round?: RoundRecord | null;
  allowedHere?: boolean;
  /** Whether the open folder sits in a Git repository; `null` while not known. A recheck needs one. */
  inRepository?: boolean | null;
}

type OntologyKind = "ontology" | "recheck";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function NewOntologyRoundSheet({ open, onClose, onSave, round = null, allowedHere = true, inRepository = null }: NewOntologyRoundSheetProps) {
  const t = useTranslations("automations");
  const rounds = useTranslations("library.rounds");
  const locale = useLocale();
  const titleId = useId();
  const kindLabelId = useId();
  const [kind, setKind] = useState<OntologyKind>(round?.kind === "recheck" ? "recheck" : "ontology");
  const recheck = kind === "recheck";
  const [limitText, setLimitText] = useState(String(round?.limit ?? DEFAULT_RECHECK_LIMIT));
  const limit = Number(limitText);
  const limitValid = !recheck || (/^\d+$/.test(limitText.trim()) && limit >= 1 && limit <= MAX_RECHECK_LIMIT);
  const startMinutes = round ? cadenceMinutes(round.cadence) : 360;
  const startDaily = round && "daily" in round.cadence ? round.cadence : null;
  const [unit, setUnit] = useState<CadenceUnit>(startMinutes === null ? "day" : startMinutes < 60 ? "minutes" : "hours");
  const [minutes, setMinutes] = useState(startMinutes ?? 360);
  const [weekdaysOnly, setWeekdaysOnly] = useState(startDaily?.weekdaysOnly ?? false);
  const [time, setTime] = useState(startDaily?.daily ?? "09:00");
  const [focus, setFocus] = useState(round?.query ?? "");
  const [name, setName] = useState(() => round?.name ?? t("ontology.defaultName"));
  const defaultName = (value: OntologyKind) => (value === "recheck" ? t("recheck.defaultName") : t("ontology.defaultName"));
  const chooseKind = (next: OntologyKind) => {
    if (name.trim() === "" || name === defaultName(kind)) setName(defaultName(next));
    setKind(next);
  };
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState(false);

  const timeValid = unit !== "day" || isValidClockTime(time);
  const cadenceValue: RoundCadence = unit === "day" ? { daily: timeValid ? time : "09:00", weekdaysOnly } : cadenceFromMinutes(minutes);
  const perDay = turnsPerDay(cadenceValue);
  const costAlarming = perDay >= COST_ALARM_TURNS_PER_DAY;
  const draftLimit = recheck && limitValid ? limit : undefined;
  const widened = round !== null && roundWidens(round, { ...round, cadence: cadenceValue, query: recheck ? "" : focus.trim(), limit: draftLimit });
  const asksToAllow = round === null || !allowedHere || widened;
  const noGit = recheck && inRepository === false;
  const canSave = timeValid && limitValid && !noGit && !saving;
  const close = () => {
    if (!saving) onClose();
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setFailure(false);
    const now = new Date();
    let saved = false;
    try {
      const record: RoundRecord = {
        id: round?.id ?? newId(),
        name: name.trim() || defaultName(kind),
        kind,
        cadence: cadenceValue,
        enabled: round?.enabled ?? true,
        query: recheck ? "" : focus.trim(),
        createdAt: round?.createdAt ?? now.toISOString(),
        nextDueAt: nextDueAt(cadenceValue, now).toISOString(),
      };
      if (recheck) record.limit = limit;
      if (round?.lastPassAt) record.lastPassAt = round.lastPassAt;
      saved = await onSave(record);
      if (!saved) setFailure(true);
    } catch {
      setFailure(true);
    } finally {
      setSaving(false);
    }
    if (saved) onClose();
  };

  return (
    <Dialog open={open} onClose={close} size="md" labelledBy={titleId} testId="ontology-automation-sheet" className="flex max-h-[calc(100dvh-var(--chrome-inset)*2)] flex-col gap-4 overflow-hidden break-keep">
      <header className="shrink-0">
        <h2 id={titleId} className="text-title leading-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {round ? t(recheck ? "recheck.sheet.editTitle" : "ontology.sheet.editTitle") : t("ontology.sheet.title")}
        </h2>
      </header>

      {/* -mr-1 pr-1: the scrollbar keeps its gutter while the fields end on the footer's right line. */}
      <DialogBody className="-mr-1 flex flex-col gap-5 pr-1">
      <fieldset disabled={saving} className="contents disabled:pointer-events-none">
      {round === null ? (
        <div className="flex flex-col gap-2">
          <p id={kindLabelId} className={fieldLabel()}>{t("recheck.kindLabel")}</p>
          <SegmentedControl<OntologyKind>
            labelledBy={kindLabelId}
            value={kind}
            onChange={chooseKind}
            variant="chips"
            testId="ontology-automation-kind"
            options={[
              { value: "ontology", label: t("recheck.kindCheck"), testId: "ontology-automation-kind-check" },
              { value: "recheck", label: t("recheck.kindRecheck"), testId: "ontology-automation-kind-recheck" },
            ]}
          />
        </div>
      ) : null}

      <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{t(recheck ? "recheck.sheet.description" : "ontology.sheet.description")}</p>

      <Input
        label={t("sheetName")}
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
        data-testid="ontology-automation-name"
      />

      {recheck ? (
        <Input
          label={t("recheck.sheet.limit")}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_RECHECK_LIMIT}
          value={limitText}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setLimitText(event.target.value)}
          hint={limitValid ? t("recheck.sheet.limitHint") : undefined}
          error={limitValid ? undefined : t("recheck.sheet.limitHint")}
          data-testid="ontology-automation-limit"
        />
      ) : (
        <Input
          label={t("ontology.sheet.focus")}
          value={focus}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setFocus(event.target.value)}
          placeholder={t("ontology.sheet.focusPlaceholder")}
          hint={t("ontology.sheet.focusHint")}
          data-testid="ontology-automation-focus"
        />
      )}

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
        testId="ontology-automation-cadence"
        labels={{
          legend: t("cadence.label"),
          unitMinutes: rounds("picker.unitMinutes"),
          unitHours: rounds("picker.unitHours"),
          unitDay: rounds("picker.unitDay"),
          detent: (value) => String(value < 60 ? value : value / 60),
          valueText: (value) =>
            value < 60 ? rounds("picker.valueMinutes", { count: value }) : rounds("picker.valueHours", { count: value / 60 }),
          railAria: rounds("picker.railAria"),
          daily: rounds("cadence.dailyChip"),
          weekdays: rounds("cadence.weekdaysChip"),
          time: t("cadence.time"),
          dayAria: rounds("picker.dayAria"),
          timeError: "HH:MM",
        }}
      />

      <div className="border-t border-[color:var(--color-divider)] pt-3">
        <p className={fieldLabel()}>{t("ontology.sheet.scopeTitle")}</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {(recheck
            ? [t("recheck.sheet.mayRead"), t("recheck.sheet.mayWrite"), t("recheck.sheet.mayCommit"), t("recheck.sheet.mayNever")]
            : [t("ontology.sheet.mayRead"), t("ontology.sheet.mayPropose"), t("ontology.sheet.mayNeverWrite")]
          ).map((line) => (
            <li key={line} className="flex items-start gap-2 text-body leading-body text-[color:var(--color-text-primary)]">
              <Check size={16} className="mt-0.5 flex-none text-[color:var(--color-indigo-text-soft)]" aria-hidden />
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
          data-testid="ontology-automation-cost"
        >
          {recheck
            ? t("recheck.sheet.cost", { limit: limitValid ? limit : DEFAULT_RECHECK_LIMIT, size: formatRecheckSize(RECHECK_MAX_SENT_BYTES, locale), count: perDay })
            : rounds("sheet.costPerPass", { count: perDay })}
        </p>
        {noGit ? (
          <p role="alert" data-testid="ontology-automation-no-git" className="mt-3 text-body leading-body text-[color:var(--color-amber-source-a90)]">{t("recheck.sheet.noGit")}</p>
        ) : null}
        {widened ? (
          <p data-testid="ontology-automation-widens" className="mt-3 text-body leading-body text-[color:var(--color-amber-source-a90)]">{t("editWidens")}</p>
        ) : null}
      </div>



      {failure ? <p role="alert" className="text-body leading-body text-[color:var(--color-danger-text)]">{t("saveFailed")}</p> : null}

      </fieldset>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={close} disabled={saving} className="atlas-touch-floor atlas-touch-floor-wide">{t("cancel")}</Button>
        <Button onClick={() => void save()} disabled={!canSave} data-testid="ontology-automation-allow" className="atlas-touch-floor atlas-touch-floor-wide">
          {saving
            ? round ? t("savingChanges") : t("saving")
            : !round ? t("allowAndSchedule") : asksToAllow ? t("allowAndSave") : t("saveChanges")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
