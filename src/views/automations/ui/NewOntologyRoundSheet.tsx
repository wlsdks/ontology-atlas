"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ChangeEvent } from "react";

import {
  type RoundCadence,
  type RoundRecord,
  cadenceFromMinutes,
  isValidClockTime,
  nextDueAt,
  turnsPerDay,
} from "@/entities/library-round";
import { cn } from "@/shared/lib/cn";
import { fieldLabel } from "@/shared/ui/control-class";
import { CadencePicker, type CadenceUnit } from "@/shared/ui/cadence-picker";
import { Button, Dialog, DialogBody, DialogFooter } from "@/shared/ui";
import { Input } from "@/shared/ui/input";

/** The documents sheet's threshold: a cadence of thirty minutes or faster is 48 agent turns a day. */
const COST_ALARM_TURNS_PER_DAY = 48;

export interface NewOntologyRoundSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (round: RoundRecord) => Promise<boolean>;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function NewOntologyRoundSheet({ open, onClose, onSave }: NewOntologyRoundSheetProps) {
  const t = useTranslations("automations");
  const rounds = useTranslations("library.rounds");
  const titleId = useId();
  /*
   * ⚠️ **One cadence control for one concept.** This sheet drew four radio chips (hourly, every
   * six hours, daily, weekdays) while the documents sheet for the same "create a schedule" action
   * drew the shared unit + rail picker (2026-09-25). Both now use `CadencePicker`; every six hours
   * stays the default, as the rail's 6h detent.
   */
  const [unit, setUnit] = useState<CadenceUnit>("hours");
  const [minutes, setMinutes] = useState(360);
  const [weekdaysOnly, setWeekdaysOnly] = useState(false);
  const [time, setTime] = useState("09:00");
  const [focus, setFocus] = useState("");
  // The default name is a real, editable value: as a placeholder it rendered in placeholder
  // grey, so nobody could tell it was already filled and would be saved.
  const [name, setName] = useState(() => t("ontology.defaultName"));
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState(false);

  const timeValid = unit !== "day" || isValidClockTime(time);
  const cadenceValue: RoundCadence = unit === "day" ? { daily: timeValid ? time : "09:00", weekdaysOnly } : cadenceFromMinutes(minutes);
  /* Every review pass is one agent turn, so a fast rail position is said in turns a day. */
  const perDay = turnsPerDay(cadenceValue);
  const costAlarming = perDay >= COST_ALARM_TURNS_PER_DAY;
  const canSave = timeValid && !saving;
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
      saved = await onSave({
        id: newId(),
        name: name.trim() || t("ontology.defaultName"),
        kind: "ontology",
        cadence: cadenceValue,
        enabled: true,
        query: focus.trim(),
        createdAt: now.toISOString(),
        nextDueAt: nextDueAt(cadenceValue, now).toISOString(),
      });
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
      {/* No eyebrow: "Ontology review" sat directly above "Schedule an ontology review". */}
      <header className="shrink-0">
        <h2 id={titleId} className="text-title leading-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t("ontology.sheet.title")}
        </h2>
      </header>

      {/* -mr-1 pr-1: the scrollbar keeps its gutter while the fields end on the footer's right line. */}
      <DialogBody className="-mr-1 flex flex-col gap-5 pr-1">
      <fieldset disabled={saving} className="contents disabled:pointer-events-none">
      <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{t("ontology.sheet.description")}</p>

      <Input
        label={t("sheetName")}
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
        data-testid="ontology-automation-name"
      />

      <Input
        label={t("ontology.sheet.focus")}
        value={focus}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setFocus(event.target.value)}
        placeholder={t("ontology.sheet.focusPlaceholder")}
        hint={t("ontology.sheet.focusHint")}
        data-testid="ontology-automation-focus"
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
          {[
            t("ontology.sheet.mayRead"),
            t("ontology.sheet.mayPropose"),
            t("ontology.sheet.mayNeverWrite"),
          ].map((line) => (
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
          {rounds("sheet.costPerPass", { count: perDay })}
        </p>
      </div>



      {failure ? <p role="alert" className="text-body leading-body text-[color:var(--color-danger-text)]">{t("saveFailed")}</p> : null}

      </fieldset>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={close} disabled={saving} className="atlas-touch-floor atlas-touch-floor-wide">{t("cancel")}</Button>
        <Button onClick={() => void save()} disabled={!canSave} data-testid="ontology-automation-allow" className="atlas-touch-floor atlas-touch-floor-wide">
          {saving ? t("saving") : t("allowAndSchedule")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
