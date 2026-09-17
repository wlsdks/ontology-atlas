"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type ChangeEvent } from "react";

import {
  DEFAULT_SERVICE_ROUND_LIMIT,
  type RoundCadenceKey,
  type RoundKind,
  type RoundOnStale,
  type RoundRecord,
  cadenceFromKey,
  isValidClockTime,
  nextDueAt,
} from "@/entities/library-round";
import { fieldLabel } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { Button, Dialog } from "@/shared/ui";
import { Input } from "@/shared/ui/input";

import { capitalize, turnsPerDay } from "../../lib/round-presentation";

/**
 * **New round** — one sheet, four fields, in the person's words (spec §9.3).
 *
 * The fourth field is not a field: it is the standing scope, derived from the first three and
 * shown as sentences the person cannot edit, because it is what the primary press approves.
 * The button therefore says "Allow and save", and the cost line beside it says what a pass
 * spends, in agent turns a day, so the choice of cadence is made with the bill in view.
 *
 * The form's state lives in this component and starts fresh on mount; the parent gives the
 * sheet a new `key` each time it opens, so a cancelled draft never leaks into the next one.
 */

export interface NewRoundSheetProps {
  open: boolean;
  onClose: () => void;
  connectors: readonly { id: string; name: string; enabled: boolean }[];
  agentReady: boolean;
  onSave: (round: RoundRecord) => Promise<boolean>;
  /** Ids already in use, so a second round for the same connector gets its own id. */
  existingCount: number;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function NewRoundSheet({ open, onClose, connectors, agentReady, onSave }: NewRoundSheetProps) {
  const t = useTranslations("library.rounds");
  const titleId = useId();
  const whatId = useId();
  const howId = useId();
  const staleId = useId();
  const serviceId = useId();

  const enabledConnectors = useMemo(() => connectors.filter((connector) => connector.enabled), [connectors]);
  const [kind, setKind] = useState<RoundKind>("consistency");
  const [cadence, setCadence] = useState<RoundCadenceKey>("hour");
  const [time, setTime] = useState("09:00");
  const [onStale, setOnStale] = useState<RoundOnStale>("redraft");
  const [connectorId, setConnectorId] = useState<string | null>(enabledConnectors[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [nameEdited, setNameEdited] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const connector = enabledConnectors.find((entry) => entry.id === connectorId) ?? null;
  const serviceLabel = connector ? capitalize(connector.name) : "";
  const cadenceWords = (() => {
    switch (cadence) {
      case "hour":
        return t("cadence.hourShort");
      case "6h":
        return t("cadence.6hShort");
      case "daily":
        return t("cadence.dailyShort", { time });
      case "weekdays":
        return t("cadence.weekdaysShort", { time });
    }
  })();
  // The cadence is not part of the name: the index and the header already say it, and a
  // name holding a separator reads as two fields wherever the name sits in a sentence.
  const derivedName = kind === "consistency" ? t("name.consistency") : serviceLabel || t("kind.service");
  const name = nameEdited ?? derivedName;
  void cadenceWords;

  const timeValid = cadence === "hour" || cadence === "6h" || isValidClockTime(time);
  const canSave = name.trim().length > 0 && timeValid && (kind === "consistency" || (connector !== null && agentReady)) && !saving;
  const perDay = turnsPerDay(cadenceFromKey(cadence, timeValid ? time : "09:00"));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setFailure(null);
    const now = new Date();
    const record: RoundRecord = {
      id: newId(),
      name: name.trim(),
      kind,
      cadence: cadenceFromKey(cadence, time),
      enabled: true,
      createdAt: now.toISOString(),
      nextDueAt: nextDueAt(cadenceFromKey(cadence, time), now).toISOString(),
    };
    if (kind === "consistency") record.onStale = onStale;
    else if (connector) {
      record.connectorId = connector.id;
      record.connectorName = connector.name;
      record.query = query.trim();
      record.limit = DEFAULT_SERVICE_ROUND_LIMIT;
    }
    const saved = await onSave(record);
    setSaving(false);
    if (saved) onClose();
    else setFailure(t("sheet.saveFailed", { reason: "write" }));
  };

  const may: string[] = [t("sheet.mayReadVault")];
  if (kind === "service") {
    may.push(t("sheet.mayCallConnector", { service: serviceLabel || t("sheet.service") }));
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

  return (
    <Dialog open={open} onClose={onClose} size="md" labelledBy={titleId} testId="library-rounds-sheet" className="flex flex-col gap-5">
      <h2 id={titleId} className="text-title leading-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        {t("sheet.title")}
      </h2>

      <div className="flex flex-col gap-2">
        <p id={whatId} className={fieldLabel()}>{t("sheet.what")}</p>
        <SegmentedControl<RoundKind>
          labelledBy={whatId}
          value={kind}
          onChange={setKind}
          variant="chips"
          fill
          testId="library-rounds-kind"
          options={[
            { value: "consistency", label: t("kind.consistency") },
            { value: "service", label: t("kind.service") },
          ]}
        />
        <p className="text-label leading-label text-[color:var(--color-text-quaternary)]">
          {kind === "consistency" ? t("kind.consistencyBody") : t("kind.serviceBody")}
        </p>
        {kind === "service" ? (
          enabledConnectors.length === 0 ? (
            <p className="text-body leading-body text-[color:var(--color-amber-source-a90)]">{t("sheet.noConnectors")}</p>
          ) : (
            <div className="mt-1 flex flex-col gap-2">
              <p id={serviceId} className={fieldLabel()}>{t("sheet.service")}</p>
              <SegmentedControl<string>
                labelledBy={serviceId}
                value={connectorId ?? enabledConnectors[0].id}
                onChange={setConnectorId}
                variant="chips"
                fill
                testId="library-rounds-connector"
                options={enabledConnectors.map((entry) => ({ value: entry.id, label: capitalize(entry.name) }))}
              />
              {!agentReady ? <p className="text-body leading-body text-[color:var(--color-amber-source-a90)]">{t("sheet.noAgent")}</p> : null}
              <Input
                label={t("sheet.query")}
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                placeholder={t("sheet.queryPlaceholder")}
                hint={t("sheet.queryHint")}
                data-testid="library-rounds-query"
              />
            </div>
          )
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <p id={howId} className={fieldLabel()}>{t("sheet.how")}</p>
        {/*
          `fill`, like the two groups above and below it: four cadence chips left ragged
          measured 343 px of a 526 px sheet column (183 px, 35%, empty) while
          "What to check" and "When a page goes stale" filled theirs exactly
          (`docs/DESIGN-SYSTEM.md`, "Control groups fill their column"). The time field
          therefore leaves this row and takes its own, because a field sharing the row
          would eat the share each chip is owed.
        */}
        <SegmentedControl<RoundCadenceKey>
          labelledBy={howId}
          value={cadence}
          onChange={setCadence}
          variant="chips"
          fill
          testId="library-rounds-cadence"
          options={[
            { value: "hour", label: t("cadence.hour") },
            { value: "6h", label: t("cadence.6h") },
            { value: "daily", label: t("cadence.dailyChip") },
            { value: "weekdays", label: t("cadence.weekdaysChip") },
          ]}
        />
        {cadence === "daily" || cadence === "weekdays" ? (
          <Input
            label={t("sheet.time")}
            type="time"
            value={time}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setTime(event.target.value)}
            className="w-32"
            data-testid="library-rounds-time"
            error={timeValid ? undefined : "HH:MM"}
          />
        ) : null}
      </div>

      {kind === "consistency" ? (
        <div className="flex flex-col gap-2">
          <p id={staleId} className={fieldLabel()}>{t("sheet.onStale")}</p>
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
      ) : null}

      <div className="rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]" data-testid="library-rounds-scope">
        <p className={fieldLabel()}>{t("sheet.may")}</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {may.map((line) => (
            <li key={line} className="flex items-start gap-2 text-body leading-body text-[color:var(--color-text-primary)]">
              <Check size={ICON_SIZE.sm} className="mt-0.5 flex-none text-[color:var(--color-indigo-text-soft)]" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-label leading-label text-[color:var(--color-text-tertiary)]" data-testid="library-rounds-cost">{cost}</p>
      </div>

      <Input
        label={t("sheet.name")}
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setNameEdited(event.target.value)}
        data-testid="library-rounds-name"
      />

      {failure ? <p role="alert" className="text-body leading-body text-[color:var(--color-danger-text)]">{failure}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose} className="atlas-touch-floor atlas-touch-floor-wide">{t("sheet.cancel")}</Button>
        <Button onClick={() => void save()} disabled={!canSave} data-testid="library-rounds-allow" className="atlas-touch-floor atlas-touch-floor-wide">
          {t("sheet.allowAndSave")}
        </Button>
      </div>
    </Dialog>
  );
}
