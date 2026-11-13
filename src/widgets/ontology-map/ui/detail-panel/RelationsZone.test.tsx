import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../../../messages/en.json";
import type { ConceptReach, ReachRow } from "../../model/concept-reach";
import { buildV2ConnectionGroups, type V2DatasheetConnection } from "./map-datasheet";
import { RelationsZone } from "./RelationsZone";
import type { OntologyMapDetailPanelLabels } from "./types";

const labels = {
  noConnections: "no relations recorded yet · relations are declared in frontmatter",
  domainLinks: (count: number) => `${count} links with this domain`,
} as OntologyMapDetailPanelLabels;

const reachRow = (id: string, line: ReachRow["line"], extra: Partial<ReachRow> = {}): ReachRow => ({
  id, label: id.split(":")[1]!, kind: id.split(":")[0]!, line, links: null, neededBy: 0, ...extra,
});
const conn = (id: string, relationType: string, direction: "incoming" | "outgoing", extra: Partial<V2DatasheetConnection> = {}): V2DatasheetConnection => ({
  id, title: id.split(":")[1]!, kind: id.split(":")[0]!, relationType, direction, ...extra,
});
const noReach: ConceptReach = { needs: [], neededBy: [], other: [] };

function renderZone(props: Partial<React.ComponentProps<typeof RelationsZone>> & { onPanelKeyDown?: () => void } = {}) {
  const onSelectConnection = props.onSelectConnection ?? vi.fn();
  const onHoverConnection = props.onHoverConnection ?? vi.fn();
  const view = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div data-testid="map-detail-panel" onKeyDown={props.onPanelKeyDown}>
        <RelationsZone
          kind={props.kind ?? "capability"}
          reach={props.reach === undefined ? noReach : props.reach}
          groups={props.groups ?? buildV2ConnectionGroups([])}
          labels={labels}
          onSelectConnection={onSelectConnection}
          onHoverConnection={onHoverConnection}
        />
      </div>
    </NextIntlClientProvider>,
  );
  return { ...view, onSelectConnection, onHoverConnection };
}

const group = (container: HTMLElement, key: string) => container.querySelector<HTMLElement>(`[data-datasheet-group="${key}"]`)!;
const rowIds = (scope: HTMLElement) => [...scope.querySelectorAll("[data-datasheet-connection]")].map((row) => row.getAttribute("data-datasheet-connection"));
const listLines = (scope: HTMLElement) => scope.querySelectorAll("ul > li > button").length;

afterEach(() => vi.useRealTimers());

describe("RelationsZone reach groups", () => {
  it("heads both groups with the map's line sample, the words and the number, in the map's order", () => {
    const { container } = renderZone({
      reach: { needs: [reachRow("capability:pay", "needs"), reachRow("capability:tax", "needs")], neededBy: [reachRow("capability:order", "neededBy")], other: [] },
    });
    const groups = [...container.querySelectorAll("[data-datasheet-group]")].map((g) => g.getAttribute("data-datasheet-group"));
    expect(groups).toEqual(["needs", "neededBy"]);
    expect(group(container, "needs").querySelector("[data-datasheet-group-total]")?.textContent).toBe("2");
    expect(group(container, "neededBy").querySelector("[data-datasheet-group-total]")?.textContent).toBe("1");
    expect(group(container, "needs")).toHaveTextContent(/^Needs2/);
    expect(group(container, "needs").querySelector('[data-reach-sample="needs"] path')?.getAttribute("fill")).toBe("var(--map-graph-arc)");
    expect(group(container, "neededBy").querySelector('[data-reach-sample="neededBy"] path')?.getAttribute("fill")).toBe("var(--map-graph-reach)");
  });

  it("keeps a zero group's heading only while the other group has rows", () => {
    const { container } = renderZone({ reach: { needs: [reachRow("capability:pay", "needs")], neededBy: [], other: [] } });
    expect(group(container, "neededBy").querySelector("[data-datasheet-group-total]")?.textContent).toBe("0");
    expect(rowIds(group(container, "neededBy"))).toEqual([]);
  });

  it("says no relations are recorded when nothing at all is linked", () => {
    const { container } = renderZone({ kind: "element" });
    expect(screen.getByText(labels.noConnections)).toBeInTheDocument();
    expect(container.querySelector("[data-datasheet-group]")).toBeNull();
  });

  it("drops both headings when only other links exist, and folds those into one line", () => {
    const { container } = renderZone({ reach: { needs: [], neededBy: [], other: [reachRow("capability:search", "relates")] } });
    expect(container.querySelector('[data-datasheet-group="needs"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Other links 1" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(labels.noConnections)).toBeNull();
  });

  it("shows six rows whole and folds a longer list to five rows and a show-more row it opens in place", () => {
    const needs = Array.from({ length: 20 }, (_, i) => reachRow(`capability:need-${String(i).padStart(2, "0")}`, "needs"));
    const neededBy = Array.from({ length: 6 }, (_, i) => reachRow(`capability:user-${i}`, "neededBy"));
    const { container } = renderZone({ reach: { needs, neededBy, other: [] } });
    expect(listLines(group(container, "needs"))).toBe(6);
    expect(rowIds(group(container, "needs"))).toHaveLength(5);
    expect(rowIds(group(container, "neededBy"))).toHaveLength(6);
    expect(container.querySelector('[data-datasheet-group-overflow="neededBy"]')).toBeNull();

    const more = screen.getByTestId("map-group-more-needs");
    expect(more).toHaveTextContent("Show 15 more");
    fireEvent.click(more);
    expect(rowIds(group(container, "needs"))).toHaveLength(20);
    expect(screen.getByTestId("map-group-more-needs")).toHaveTextContent("Show fewer");
    fireEvent.click(screen.getByTestId("map-group-more-needs"));
    expect(rowIds(group(container, "needs"))).toHaveLength(5);
  });

  it("lists a domain's partners with their link counts and selects one on press", () => {
    const { container, onSelectConnection } = renderZone({
      kind: "domain",
      reach: {
        needs: [reachRow("domain:catalog", "needs", { links: 2 })],
        neededBy: [reachRow("domain:returns", "neededBy", { links: 4 }), reachRow("domain:billing", "neededBy", { links: 3 })],
        other: [],
      },
    });
    expect([...group(container, "neededBy").querySelectorAll("[data-datasheet-domain-row]")].map((row) => row.textContent)).toEqual([
      "returns4, 4 links with this domain",
      "billing3, 3 links with this domain",
    ]);
    expect(group(container, "neededBy")).not.toHaveTextContent("No reason");
    fireEvent.click(container.querySelector('[data-datasheet-domain-row="domain:billing"]')!);
    expect(onSelectConnection).toHaveBeenCalledWith("domain:billing");
  });

  it("draws no line sample for an element, whose own lines the map does not draw", () => {
    const { container } = renderZone({ kind: "element", reach: { needs: [reachRow("element:store", "needs")], neededBy: [], other: [] } });
    expect(container.querySelector("[data-reach-sample]")).toBeNull();
  });
});

describe("RelationsZone reasons", () => {
  const reach: ConceptReach = {
    needs: [reachRow("capability:pay", "needs"), reachRow("capability:tax", "needs")],
    neededBy: [],
    other: [],
  };
  const reason = "Payment must clear before an order exists, because a failed charge would leave a shipped order nobody paid for.";
  const groups = buildV2ConnectionGroups([conn("capability:pay", "depends_on", "outgoing", { reason }), conn("capability:tax", "depends_on", "outgoing")]);

  it("keeps the reason out of the list: the row describes itself with it, and a row without one reads no reason", () => {
    const { container } = renderZone({ reach, groups });
    const pay = container.querySelector<HTMLElement>('[data-datasheet-connection="capability:pay"]')!;
    const tax = container.querySelector<HTMLElement>('[data-datasheet-connection="capability:tax"]')!;
    expect(pay).toHaveAccessibleDescription(reason);
    expect(pay).toHaveTextContent(/^pay$/);
    expect(pay.className).toContain("min-h-7");
    expect(tax).toHaveTextContent("No reason");
    expect(tax).not.toHaveAttribute("aria-describedby");
  });

  it("shows the reason beside the panel once the pointer rests on the row, and hides it when the pointer leaves", () => {
    vi.useFakeTimers();
    const { container, onHoverConnection } = renderZone({ reach, groups });
    const pay = container.querySelector<HTMLElement>('[data-datasheet-connection="capability:pay"]')!;
    fireEvent.pointerEnter(pay);
    expect(onHoverConnection).toHaveBeenLastCalledWith("capability:pay");
    expect(screen.queryByTestId("map-edge-hover-card")).toBeNull();
    act(() => vi.advanceTimersByTime(150));
    const card = screen.getByTestId("map-edge-hover-card");
    expect(within(card).getByTestId("map-edge-hover-why")).toHaveTextContent(reason);
    expect(card).toHaveTextContent("Needs");
    expect(container.contains(card)).toBe(false);
    fireEvent.pointerLeave(pay);
    expect(screen.queryByTestId("map-edge-hover-card")).toBeNull();
    expect(onHoverConnection).toHaveBeenLastCalledWith(null);
  });

  it("shows no card for a pass that does not rest", () => {
    vi.useFakeTimers();
    const { container } = renderZone({ reach, groups });
    const pay = container.querySelector<HTMLElement>('[data-datasheet-connection="capability:pay"]')!;
    fireEvent.pointerEnter(pay);
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerLeave(pay);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByTestId("map-edge-hover-card")).toBeNull();
  });

  it("shows the reason on keyboard focus, and Escape hides it before it reaches the panel", () => {
    const onPanelKey = vi.fn();
    const { container } = renderZone({ reach, groups, onPanelKeyDown: onPanelKey });
    const pay = container.querySelector<HTMLElement>('[data-datasheet-connection="capability:pay"]')!;
    act(() => pay.focus());
    expect(screen.getByTestId("map-edge-hover-why")).toHaveTextContent(reason);
    fireEvent.keyDown(pay, { key: "Escape" });
    expect(screen.queryByTestId("map-edge-hover-card")).toBeNull();
    expect(onPanelKey).not.toHaveBeenCalled();
    fireEvent.keyDown(pay, { key: "Escape" });
    expect(onPanelKey).toHaveBeenCalledTimes(1);
  });
});

describe("RelationsZone keyboard", () => {
  it("takes one Tab stop and moves across both groups with the arrow keys, Home and End", () => {
    const { container } = renderZone({
      reach: { needs: [reachRow("capability:a", "needs"), reachRow("capability:b", "needs")], neededBy: [reachRow("capability:c", "neededBy")], other: [] },
    });
    const rows = [...container.querySelectorAll<HTMLElement>("[data-reach-row]")];
    expect(rows.map((row) => row.tabIndex)).toEqual([0, -1, -1]);
    act(() => rows[0]!.focus());
    fireEvent.keyDown(rows[0]!, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(rows[2]!, { key: "Home" });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0]!, { key: "End" });
    expect(document.activeElement).toBe(rows[2]);
    expect(rows.map((row) => row.tabIndex)).toEqual([-1, -1, 0]);
  });
});

describe("RelationsZone folded lines", () => {
  it("folds relates and broader concepts into one other-links line whose rows keep the map's samples", () => {
    const { container } = renderZone({
      reach: {
        needs: [reachRow("capability:pay", "needs")],
        neededBy: [],
        other: [reachRow("capability:search", "relates"), reachRow("capability:commerce", "broader")],
      },
    });
    expect(rowIds(group(container, "other"))).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Other links 2" }));
    expect(rowIds(group(container, "other"))).toEqual(["capability:search", "capability:commerce"]);
    expect([...group(container, "other").querySelectorAll("[data-reach-sample]")].map((s) => s.getAttribute("data-reach-sample"))).toEqual(["relates", "broader"]);
  });

  it.each([
    ["capability", [conn("element:form", "contains", "outgoing"), conn("element:store", "contains", "outgoing")], "Implementation elements 2"],
    ["domain", [conn("capability:cart", "contains", "outgoing"), conn("element:store", "contains", "outgoing"), conn("element:form", "contains", "outgoing")], "1 capability · 2 elements"],
    ["project", [conn("domain:orders", "contains", "outgoing")], "Domains 1"],
  ])("names what a %s contains in one line that opens in place", (kind, rows, text) => {
    const { container } = renderZone({ kind, groups: buildV2ConnectionGroups(rows) });
    const line = screen.getByRole("button", { name: text });
    fireEvent.click(line);
    expect(rowIds(group(container, "contains"))).toHaveLength(rows.length);
    expect(line).toHaveAttribute("aria-expanded", "true");
  });

  it("holds at most the two folded lines, and never an evidence or code-location group", () => {
    const { container } = renderZone({
      reach: { needs: [reachRow("capability:pay", "needs")], neededBy: [], other: [reachRow("capability:search", "relates")] },
      groups: buildV2ConnectionGroups([conn("element:form", "contains", "outgoing"), conn("domain:orders", "contains", "incoming")]),
    });
    expect([...container.querySelectorAll("[data-reach-line]")].map((line) => line.getAttribute("data-reach-line"))).toEqual(["other", "contains"]);
    expect([...container.querySelectorAll("[data-datasheet-group]")].map((g) => g.getAttribute("data-datasheet-group"))).toEqual(["needs", "neededBy", "other", "contains"]);
  });
});

describe("RelationsZone for a document", () => {
  it("lists the concepts a document describes once each, with no reason slot", () => {
    const { container } = renderZone({
      kind: "document",
      reach: null,
      groups: buildV2ConnectionGroups([
        conn("capability:checkout", "describes", "outgoing"),
        conn("element:guard", "describes", "outgoing"),
        conn("capability:checkout", "related_to", "outgoing"),
      ]),
    });
    expect(group(container, "describes")).toHaveTextContent(/^Describes2/);
    expect(rowIds(group(container, "describes"))).toEqual(["capability:checkout", "element:guard"]);
    expect(container).not.toHaveTextContent("No reason");
  });
});
