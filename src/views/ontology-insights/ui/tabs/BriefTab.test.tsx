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
    undoSeen: vi.fn(),
    canUndoSeen: false,
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
          { name: "Payments", slug: "capabilities/pay", path: "src/pay.ts", at: "2026-09-18T02:00:00Z", docAt: "2026-09-10T00:00:00Z", href: "/topology/?p=capabilities%2Fpay" },
          { name: "Shipping", slug: "capabilities/ship", path: "src/ship.ts", at: "2026-09-17T02:00:00Z", docAt: "2026-09-09T00:00:00Z", href: "/topology/?p=capabilities%2Fship" },
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
    fireEvent.click(screen.getByTestId("brief-line-open-ontology-evidence-moved"));
    // The stale line names what it counts: concept, the file, and both dates — never a bare number.
    const rows = ontology.querySelectorAll('[data-testid="brief-line-rows-ontology-evidence-moved"] li');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Payments");
    expect(rows[0]).toHaveTextContent("src/pay.ts");
    expect(ontology.querySelector('a[href="/topology/?p=capabilities%2Fpay"]')).not.toBeNull();
    expect(screen.getByTestId("brief-core-wiki").querySelectorAll("[data-brief-line]")).toHaveLength(0);
  });

  it("makes exiting evidence inert and reopens the same rows on interruption", () => {
    mount(brief());
    const toggle = screen.getByTestId("brief-line-open-ontology-evidence-moved");
    expect(screen.queryByTestId("brief-line-rows-ontology-evidence-moved")).toBeNull();
    toggle.focus();
    fireEvent.click(toggle);
    const rows = screen.getByTestId("brief-line-rows-ontology-evidence-moved");
    const body = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(body).toContainElement(rows);
    fireEvent.click(toggle);
    expect(body).toHaveAttribute("inert");
    expect(body).toHaveAttribute("aria-hidden", "true");
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(body).not.toHaveAttribute("inert");
    expect(screen.getByTestId("brief-line-rows-ontology-evidence-moved")).toBe(rows);
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

  it("gives every card the same three bands, so a core nobody could count still starts where its siblings do", () => {
    /*
     * The row is four cards wide and the harness cannot be counted in a browser. While that card
     * printed no magnitude row its state columns and its sentence rose into the number's line —
     * 48/79 against the siblings' 49/80 at 1512x900 and 1920x1080 (design-audit 2026-09-20). The
     * structural invariant behind that geometry: label, magnitude, columns, lines — four children,
     * in that order, on every card.
     */
    mount(brief());
    for (const key of ["ontology", "wiki", "harness", "agent"]) {
      const card = screen.getByTestId(`brief-core-${key}`);
      expect([...card.children].map((child) => child.tagName)).toEqual(["DIV", "P", "DIV", "UL"]);
    }
    const absent = screen.getByTestId("brief-core-headline-absent");
    expect(screen.getByTestId("brief-core-harness")).toContainElement(absent);
    // The dash is the columns' own mark for a value this session cannot state, and it is alignment
    // rather than a fact, so it stays out of the accessibility tree.
    expect(absent).toHaveAttribute("aria-hidden");
  });

  it("keeps the four bands when a measured core has no magnitude to print", () => {
    // The other way into an empty magnitude row: the input was read and still yields no size.
    mount(brief({ agent: core({ core: "agent", headline: null, lines: [] }) }));
    const card = screen.getByTestId("brief-core-agent");
    expect([...card.children].map((child) => child.tagName)).toEqual(["DIV", "P", "DIV", "UL"]);
    expect(card).toContainElement(screen.getByTestId("brief-core-unmeasured"));
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
    fireEvent.click(screen.getByTestId("brief-line-open-ontology-evidence-moved"));
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
    fireEvent.click(screen.getByTestId("brief-line-open-ontology-evidence-moved"));
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

describe("a line that opens another question on this same board", () => {
  /*
   * The board keeps its tab in component state and writes the address itself, so a plain link to
   * `?tab=do-next` changed the address and left the reader on the brief: the landing's only "go
   * fix it" action did nothing (walkthrough, 2026-09-20). The link stays a link — the address is
   * right, middle-click still opens a tab — and the plain click is answered in place.
   */
  it("answers the click in place instead of navigating", () => {
    const onOpenTab = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <BriefTab brief={brief()} onOpenTab={onOpenTab} />
      </NextIntlClientProvider>,
    );
    const repair = screen.getByTestId("brief-tab").querySelector('[data-brief-destination="do-next"]');
    expect(repair, "the repair line has no destination on this board").not.toBeNull();

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(repair as Element, click);
    expect(onOpenTab).toHaveBeenCalledWith("do-next");
    expect(click.defaultPrevented, "the browser would navigate and the screen would not follow").toBe(true);
  });

  it("leaves a destination on another screen alone", () => {
    const onOpenTab = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <BriefTab brief={brief()} onOpenTab={onOpenTab} />
      </NextIntlClientProvider>,
    );
    const away = screen.getByTestId("brief-tab").querySelector('[data-brief-destination="away"]');
    expect(away, "every card links somewhere; this test is watching nothing").not.toBeNull();

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(away as Element, click);
    expect(onOpenTab).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(false);
  });

  it("lets a modified click open a second window", () => {
    const onOpenTab = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <BriefTab brief={brief()} onOpenTab={onOpenTab} />
      </NextIntlClientProvider>,
    );
    const repair = screen.getByTestId("brief-tab").querySelector('[data-brief-destination="do-next"]');
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    fireEvent(repair as Element, click);
    expect(onOpenTab).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(false);
  });
});

describe("marking the visit", () => {
  it("says so, in a live region, and keeps the button usable", () => {
    const markSeen = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <BriefTab brief={brief({ markSeen })} />
      </NextIntlClientProvider>,
    );
    const status = screen.getByTestId("brief-mark-seen-done");
    // Before the press the region exists and is empty, so the announcement is a change.
    expect(status.textContent).toBe("");
    expect(status.getAttribute("role")).toBe("status");

    fireEvent.click(screen.getByTestId("brief-mark-seen"));
    expect(markSeen).toHaveBeenCalledTimes(1);
    expect(status.textContent?.trim().length, "누른 뒤에도 화면이 아무 말을 하지 않는다").toBeGreaterThan(0);

    // Pressing again re-anchors to now; the control must not become a dead end.
    fireEvent.click(screen.getByTestId("brief-mark-seen"));
    expect(markSeen).toHaveBeenCalledTimes(2);
  });
});

describe("taking the visit mark back", () => {
  it("offers one press back, inside the region that announced the mark", () => {
    const undoSeen = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <BriefTab brief={brief({ undoSeen })} />
      </NextIntlClientProvider>,
    );
    // Nothing to take back before the press.
    expect(screen.queryByTestId("brief-mark-seen-undo")).toBeNull();

    fireEvent.click(screen.getByTestId("brief-mark-seen"));
    const undo = screen.getByTestId("brief-mark-seen-undo");
    // It lives inside the live region, so the reversal is announced with the thing it reverses.
    expect(screen.getByTestId("brief-mark-seen-done").contains(undo)).toBe(true);

    fireEvent.click(undo);
    expect(undoSeen).toHaveBeenCalledTimes(1);
    // One press back is the whole of it; the offer goes with it.
    expect(screen.queryByTestId("brief-mark-seen-undo")).toBeNull();
  });

  /*
   * The offer used to live only in this component's own state, so switching to another tab and
   * back unmounted it and the way back vanished although the anchor was still recoverable —
   * `canUndoBriefSeenAt` said so the whole time. What can be undone is a fact about the folder,
   * not about this mount.
   */
  it("still offers the way back after the tab is left and reopened", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <BriefTab brief={brief({ canUndoSeen: true })} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("brief-mark-seen-undo")).toBeInTheDocument();
  });
});

describe("a line that cannot be checked", () => {
  it.each(["measured", "reading", "unreadable", "no-source"] as const)("offers the app in a browser and never inside it: %s", (availability) => {
    /*
     * Measured in the installed app at 1040x720 on this repository's own vault: "50 concepts
     * whose code could not be checked · Get the app", inside the app. In a browser the same line
     * is honest, because a browser cannot read the code beside a folder at all.
     */
    const line = { id: "ontology-evidence-unchecked", count: 4, state: "unknown" } as const;

    const browser = render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <BriefTab brief={brief({ ontology: core({ core: "ontology", availability: "app-only", headline: 9, lines: [line] }) })} />
      </NextIntlClientProvider>,
    );
    const inBrowser = browser.container.querySelector('[data-brief-line="ontology-evidence-unchecked"] a');
    expect(inBrowser?.getAttribute("href")).toContain("/download/");
    browser.unmount();

    const app = render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <BriefTab brief={brief({ ontology: core({ core: "ontology", availability, headline: 9, lines: [line] }) })} />
      </NextIntlClientProvider>,
    );
    const inApp = app.container.querySelector('[data-brief-line="ontology-evidence-unchecked"] a');
    expect(app.container.querySelector('[data-testid="brief-core-ontology"] a[href="/download/"]')).toBeNull();
    expect(inApp?.getAttribute("href"), "앱 안에서 앱을 받으라고 한다").not.toContain("/download/");
    expect(inApp?.getAttribute("href")).toContain("/topology/");
  });
});
