import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../../../messages/en.json";
import { COST_ALARM_TURNS_PER_DAY, cadenceWords, costLine, mayLines, type RoundsTranslator } from "./round-grants";
import type { ServiceDraft } from "./round-draft";

const t = createTranslator({ locale: "en", messages: en, namespace: "library.rounds" }) as unknown as RoundsTranslator;
const slack = (location = ""): ServiceDraft => ({ key: "k", connectorId: "c1", connectorName: "slack", location, query: "" });

describe("mayLines", () => {
  it("lists reading the folder first and the promise to do nothing else last", () => {
    const lines = mayLines({ kind: "consistency", onStale: "mark", services: [] }, t);
    expect(lines).toEqual([t("sheet.mayReadVault"), t("sheet.mayNothingElse")]);
  });

  it("adds the page write only when stale pages are redrafted", () => {
    const lines = mayLines({ kind: "consistency", onStale: "redraft", services: [] }, t);
    expect(lines).toContain(t("sheet.mayWritePages"));
    expect(lines).not.toContain(t("sheet.mayWriteSources"));
  });

  it("names each service place, with its location when one is set, and lets a service round write sources and pages", () => {
    const lines = mayLines({ kind: "service", onStale: "mark", services: [slack(), slack("#launch")] }, t);
    expect(lines).toContain(t("sheet.mayCallConnector", { service: "Slack" }));
    expect(lines).toContain(t("sheet.mayCallPlace", { service: "Slack", location: "#launch" }));
    expect(lines).toContain(t("sheet.mayWriteSources"));
    expect(lines).toContain(t("sheet.mayWritePages"));
  });
});

describe("costLine", () => {
  it("goes alarming at 48 agent turns a day, the cadence the spec names as too much, and not below", () => {
    expect(costLine({ kind: "service", onStale: "mark", turnsPerDay: COST_ALARM_TURNS_PER_DAY }, t).alarming).toBe(true);
    expect(costLine({ kind: "service", onStale: "mark", turnsPerDay: COST_ALARM_TURNS_PER_DAY - 1 }, t).alarming).toBe(false);
  });

  it("never alarms a consistency round, whose cost is the stale-page redraft or nothing", () => {
    expect(costLine({ kind: "consistency", onStale: "redraft", turnsPerDay: 96 }, t)).toEqual({ text: t("sheet.costOnStale"), alarming: false });
    expect(costLine({ kind: "consistency", onStale: "mark", turnsPerDay: 96 }, t)).toEqual({ text: t("sheet.costNone"), alarming: false });
  });
});

describe("cadenceWords", () => {
  it("says a day's clock time, with weekdays when asked", () => {
    expect(cadenceWords({ unit: "day", minutes: 60, time: "09:00", weekdaysOnly: false }, t)).toBe(t("sheet.readbackDaily", { time: "09:00" }));
    expect(cadenceWords({ unit: "day", minutes: 60, time: "09:00", weekdaysOnly: true }, t)).toBe(t("sheet.readbackWeekdays", { time: "09:00" }));
  });

  it("has its own words for the hour and six hours, and counts the rest", () => {
    expect(cadenceWords({ unit: "hours", minutes: 60, time: "", weekdaysOnly: false }, t)).toBe(t("sheet.readbackHour"));
    expect(cadenceWords({ unit: "hours", minutes: 360, time: "", weekdaysOnly: false }, t)).toBe(t("sheet.readback6h"));
    expect(cadenceWords({ unit: "minutes", minutes: 15, time: "", weekdaysOnly: false }, t)).toBe(t("cadence.everyMinutes", { count: 15 }));
    expect(cadenceWords({ unit: "hours", minutes: 120, time: "", weekdaysOnly: false }, t)).toBe(t("cadence.everyHours", { count: 2 }));
  });
});
