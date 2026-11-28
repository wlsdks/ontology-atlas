import type { useTranslations } from "use-intl";

import type { RoundOnStale, RoundRecord } from "@/entities/library-round";

import { capitalize } from "../../lib/rounds/round-presentation";
import type { ServiceDraft } from "./round-draft";

export type RoundsTranslator = ReturnType<typeof useTranslations<"library.rounds">>;

/**
 * From this many agent turns a day the cost line changes ink, not words (spec §2.3: "every 30
 * minutes or faster"). Thirty minutes is exactly 48, and it is the first cadence the spec names
 * as too much, so the comparison includes it.
 */
export const COST_ALARM_TURNS_PER_DAY = 48;

/** Everything the round may do, one line each: it reads the folder, calls each place, writes only what its kind needs. */
export function mayLines(
  { kind, onStale, services }: { kind: RoundRecord["kind"]; onStale: RoundOnStale; services: readonly ServiceDraft[] },
  t: RoundsTranslator,
): string[] {
  const lines: string[] = [t("sheet.mayReadVault")];
  for (const draft of services) {
    const service = capitalize(draft.connectorName);
    lines.push(
      draft.location.trim()
        ? t("sheet.mayCallPlace", { service, location: draft.location.trim() })
        : t("sheet.mayCallConnector", { service }),
    );
  }
  if (kind === "service") {
    lines.push(t("sheet.mayWriteSources"));
    lines.push(t("sheet.mayWritePages"));
  } else if (onStale === "redraft") {
    lines.push(t("sheet.mayWritePages"));
  }
  lines.push(t("sheet.mayNothingElse"));
  return lines;
}

/** The cost line under the grants and whether its ink should warn. */
export function costLine(
  { kind, onStale, turnsPerDay }: { kind: RoundRecord["kind"]; onStale: RoundOnStale; turnsPerDay: number },
  t: RoundsTranslator,
): { text: string; alarming: boolean } {
  const text =
    kind === "service"
      ? t("sheet.costPerPass", { count: turnsPerDay })
      : onStale === "redraft"
        ? t("sheet.costOnStale")
        : t("sheet.costNone");
  return { text, alarming: kind === "service" && turnsPerDay >= COST_ALARM_TURNS_PER_DAY };
}

/** The cadence as the readback sentence says it. */
export function cadenceWords(
  { unit, minutes, time, weekdaysOnly }: { unit: "minutes" | "hours" | "day"; minutes: number; time: string; weekdaysOnly: boolean },
  t: RoundsTranslator,
): string {
  if (unit === "day") return weekdaysOnly ? t("sheet.readbackWeekdays", { time }) : t("sheet.readbackDaily", { time });
  if (minutes === 60) return t("sheet.readbackHour");
  if (minutes === 360) return t("sheet.readback6h");
  return minutes < 60 ? t("cadence.everyMinutes", { count: minutes }) : t("cadence.everyHours", { count: minutes / 60 });
}
