import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import type { MapAnalysisChipModel } from "../../lib/map-analysis/map-analysis-chip";
import { MapAnalysisChip } from "./MapAnalysisChip";

const model = (offMap: number): MapAnalysisChipModel => ({
  pill: { kind: "full", percent: 100 - offMap, number: 3, when: { kind: "days", days: 4 } },
  share: { mapped: 100 - offMap, total: 100, percent: 100 - offMap },
  counted: { number: 3, when: { kind: "days", days: 4 } },
  offMap,
  rows: [],
  earlier: 0,
  record: "read",
  runningUntilMs: null,
});

const view = (offMap: number, onMapTheRest = () => {}) => (
  <IntlProvider locale="en" messages={en} timeZone="UTC">
    <MapAnalysisChip model={model(offMap)} onMapTheRest={onMapTheRest} />
  </IntlProvider>
);

describe("the map analysis chip in the app", () => {
  it("offers to map the rest, which opens the map conversation and closes the panel", () => {
    const onMapTheRest = vi.fn();
    render(view(38, onMapTheRest));
    fireEvent.click(screen.getByTestId("map-analysis-chip-trigger"));
    fireEvent.click(screen.getByTestId("map-analysis-map-rest"));
    expect(onMapTheRest).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("map-analysis-chip-trigger")).toHaveAttribute("aria-expanded", "false");
  });

  it("names each analysis's agent as a person knows it, never by its id", () => {
    const row = (number: number, agent: string) => ({
      id: `a${number}`, number, at: "2026-11-20T10:00:00.000Z", agent, before: null, after: 62, added: 1, changed: 0,
    });
    render(
      <IntlProvider locale="en" messages={en} timeZone="UTC">
        <MapAnalysisChip
          model={{ ...model(38), rows: [row(3, "claude-code"), row(2, "codex-acp"), row(1, "my-review-bot")] }}
          onMapTheRest={() => {}}
        />
      </IntlProvider>,
    );
    fireEvent.click(screen.getByTestId("map-analysis-chip-trigger"));
    const rows = screen.getAllByTestId("map-analysis-row").map((item) => item.textContent ?? "");
    expect(rows[0]).toContain("Claude Code");
    expect(rows[1]).toContain("Codex");
    expect(rows[2]).toContain(en.navRail.usage.agentFallback);
    for (const id of ["claude-code", "codex-acp", "my-review-bot"]) {
      expect(rows.join("\n"), `the id ${id} reached the panel`).not.toContain(id);
    }
  });

  it("offers nothing to map when nothing is off the map", () => {
    render(view(0));
    fireEvent.click(screen.getByTestId("map-analysis-chip-trigger"));
    expect(screen.queryByTestId("map-analysis-map-rest")).not.toBeInTheDocument();
  });

  it("closes on a press outside and keeps the map's Escape out", () => {
    const outerEscape = vi.fn();
    document.addEventListener("keydown", outerEscape);
    render(view(38));
    const trigger = screen.getByTestId("map-analysis-chip-trigger");
    fireEvent.click(trigger);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(outerEscape).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", outerEscape);
  });
});
