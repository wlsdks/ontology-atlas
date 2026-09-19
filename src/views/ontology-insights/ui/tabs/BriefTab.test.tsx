import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ko from "../../../../../messages/ko.json";
import { BriefTab } from "./BriefTab";
import type { InsightsBrief } from "../../lib/brief/use-insights-brief";
import type { BriefCore } from "../../lib/brief/brief-model";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const core = (partial: Partial<BriefCore> & Pick<BriefCore, "core">): BriefCore => ({
  availability: "measured",
  headline: 0,
  current: 0,
  stale: 0,
  unknown: 0,
  lines: [],
  ...partial,
});

function brief(overrides: Partial<InsightsBrief> = {}): InsightsBrief {
  return {
    anchor: { anchorMs: Date.parse("2026-09-17T00:00:00Z"), isDefaultWindow: false },
    sinceDays: 2,
    nowMs: Date.parse("2026-09-19T00:00:00Z"),
    markSeen: vi.fn(),
    ontology: core({
      core: "ontology",
      headline: 106,
      current: 37,
      stale: 69,
      unknown: 0,
      lines: [
        { id: "ontology-evidence-moved", count: 69, state: "stale" },
        { id: "ontology-agent-unreviewed", count: 3, state: "unknown" },
        { id: "ontology-repair", count: 8, state: "current" },
      ],
    }),
    wiki: core({ core: "wiki", availability: "no-data", headline: 0, lines: [{ id: "wiki-stale-pages", count: 0, state: "stale" }] }),
    harness: core({ core: "harness", availability: "app-only", headline: null, current: null, stale: null, unknown: null, lines: [{ id: "harness-app-only", count: 0, state: "unknown" }] }),
    agent: core({ core: "agent", headline: 12, current: 10, stale: 2, unknown: 1, lines: [{ id: "agent-calls-since", count: 12, state: "current" }] }),
    since: [
      { core: "ontology", at: "2026-09-18T03:00:00Z", kind: "concept-doc", label: "Payments", href: "/topology/?p=capabilities%2Fpay" },
      { core: "agent", at: "2026-09-18T06:00:00Z", kind: "agent-call", label: "add_concept · capabilities/refund", href: "/agents/" },
    ],
    sinceTotal: 5,
    library: {
      availability: "no-data",
      pageCount: 0,
      sourceCount: 0,
      stalePages: [],
      unwrittenSources: [],
      findings: [],
      unmeasured: 0,
      passes: [],
    },
    harnessDetail: {
      availability: "app-only",
      areas: [],
      everywhere: { told: 0, gated: 0, watched: 0 },
      drift: [],
      guideFiles: 0,
      checks: 0,
    },
    details: new Map([
      [
        "ontology-evidence-moved",
        [
          { name: "Payments", path: "src/pay.ts", at: "2026-09-18T02:00:00Z", docAt: "2026-09-10T00:00:00Z", href: "/topology/?p=capabilities%2Fpay" },
          { name: "Shipping", path: "src/ship.ts", at: "2026-09-17T02:00:00Z", docAt: "2026-09-09T00:00:00Z", href: "/topology/?p=capabilities%2Fship" },
        ],
      ],
    ]),
    ...overrides,
  };
}

const mount = (value: InsightsBrief) =>
  render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <BriefTab brief={value} />
    </NextIntlClientProvider>,
  );

describe("BriefTab", () => {
  it("heads with the two sums of stale and unknown lines, never a score", () => {
    mount(brief());
    // stale: evidence-moved 69; unknown: agent-unreviewed 3. The repair queue (current) and agent calls do not join either sum.
    expect(screen.getByTestId("brief-headline")).toHaveTextContent("새로 알아야 할 것 69개 · 확인 못 한 것 3개");
    expect(screen.getByText("2 일 전 본 뒤로")).toBeInTheDocument();
  });

  it("draws only nonzero lines, each with its state mark and a way to open it", () => {
    mount(brief());
    const ontology = screen.getByTestId("brief-core-ontology");
    const lines = ontology.querySelectorAll("[data-brief-line]");
    expect([...lines].map((line) => line.getAttribute("data-brief-line"))).toEqual([
      "ontology-evidence-moved",
      "ontology-agent-unreviewed",
      "ontology-repair",
    ]);
    expect(lines[0]).toHaveAttribute("data-brief-state", "stale");
    expect(ontology.querySelector('a[href="/ontology/insights/?tab=do-next"]')).not.toBeNull();
    // The stale line names what it counts: concept, the file, and both dates — never a bare number.
    const rows = ontology.querySelectorAll('[data-testid="brief-line-rows-ontology-evidence-moved"] li');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Payments");
    expect(rows[0]).toHaveTextContent("src/pay.ts");
    expect(ontology.querySelector('a[href="/topology/?p=capabilities%2Fpay"]')).not.toBeNull();
    expect(screen.getByTestId("brief-core-wiki").querySelectorAll("[data-brief-line]")).toHaveLength(0);
  });

  it("says where a core cannot be measured instead of showing zeros as fine", () => {
    mount(brief());
    const harness = screen.getByTestId("brief-core-harness");
    expect(harness).toHaveTextContent("앱에서만 잴 수 있어요");
    expect(harness.querySelectorAll("[data-brief-line]")).toHaveLength(0);
    const wiki = screen.getByTestId("brief-core-wiki");
    expect(wiki).toHaveTextContent("이 폴더엔 아직 위키 페이지가 없어요");
    // A core with nothing to count still owes a next step rather than a dead end.
    expect(wiki.querySelector('a[href="/library/"]')).not.toBeNull();
    expect(harness.querySelector('a[href="/download/"]')).not.toBeNull();
  });

  it("names what changed since, newest first, and counts the rest", () => {
    mount(brief());
    const since = screen.getByTestId("brief-since");
    expect(since).toHaveTextContent("그 뒤로 바뀐 것 5건");
    expect(since.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByTestId("hidden-count-line")).toHaveAttribute("data-hidden-count", "3");
  });

  it("hands the drifted concepts to the agent as one bounded request, and never asks for a write", () => {
    const onAskAgent = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <BriefTab brief={brief()} onAskAgent={onAskAgent} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("brief-ask-agent"));
    expect(onAskAgent).toHaveBeenCalledTimes(1);
    const request = onAskAgent.mock.calls[0]![0] as string;
    expect(request).toContain("Payments");
    expect(request).toContain("src/pay.ts");
    expect(request).toContain("볼트를 직접 바꾸지 말고");
    expect(request).not.toMatch(/patch_concept|add_concept/);
  });

  it("offers the same request to copy when no agent can be launched here", () => {
    mount(brief());
    expect(screen.queryByTestId("brief-ask-agent")).not.toBeInTheDocument();
    expect(screen.getByTestId("brief-line-handoff-ontology-evidence-moved")).toBeInTheDocument();
  });

  it("marks the visit only on the explicit action", () => {
    const value = brief();
    mount(value);
    expect(value.markSeen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("brief-mark-seen"));
    expect(value.markSeen).toHaveBeenCalledTimes(1);
  });
});
