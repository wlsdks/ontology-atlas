"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ChangeEvent } from "react";

import {
  type RoundCadenceKey,
  type RoundRecord,
  cadenceFromKey,
  isValidClockTime,
  nextDueAt,
} from "@/entities/library-round";
import { fieldLabel } from "@/shared/ui/control-class";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { Button, Dialog, DialogBody, DialogFooter } from "@/shared/ui";
import { Input } from "@/shared/ui/input";

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
  const titleId = useId();
  const cadenceId = useId();
  const [cadence, setCadence] = useState<RoundCadenceKey>("6h");
  const [time, setTime] = useState("09:00");
  const [focus, setFocus] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState(false);

  const timeValid = cadence === "hour" || cadence === "6h" || isValidClockTime(time);
  const canSave = timeValid && !saving;
  const close = () => {
    if (!saving) onClose();
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setFailure(false);
    const now = new Date();
    const cadenceValue = cadenceFromKey(cadence, time);
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
      <header className="shrink-0">
        <p className="text-body text-[color:var(--color-text-tertiary)]">
          {t("ontology.eyebrow")}
        </p>
        <h2 id={titleId} className="mt-2 text-title leading-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t("ontology.sheet.title")}
        </h2>
      </header>

      <DialogBody className="flex flex-col gap-5 pr-1">
      <fieldset disabled={saving} className="contents disabled:pointer-events-none">
      <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{t("ontology.sheet.description")}</p>

      <Input
        label={t("sheetName")}
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
        placeholder={t("ontology.defaultName")}
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

      <div className="flex flex-col gap-2">
        <p id={cadenceId} className={fieldLabel()}>{t("cadence.label")}</p>
        <SegmentedControl<RoundCadenceKey>
          labelledBy={cadenceId}
          value={cadence}
          onChange={setCadence}
          variant="chips"
          fill
          testId="ontology-automation-cadence"
          options={[
            { value: "hour", label: t("cadence.hour") },
            { value: "6h", label: t("cadence.6h") },
            { value: "daily", label: t("cadence.daily") },
            { value: "weekdays", label: t("cadence.weekdays") },
          ]}
        />
        {cadence === "daily" || cadence === "weekdays" ? (
          <Input
            label={t("cadence.time")}
            type="time"
            value={time}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setTime(event.target.value)}
            className="w-32"
            data-testid="ontology-automation-time"
            error={timeValid ? undefined : "HH:MM"}
          />
        ) : null}
      </div>

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
