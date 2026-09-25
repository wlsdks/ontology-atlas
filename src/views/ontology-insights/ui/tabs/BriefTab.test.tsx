import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ko from "../../../../../messages/ko.json";
import { BriefTab } from "./BriefTab";
import type { InsightsBrief } from "../../lib/brief/use-insights-brief";
import { briefCounting, briefTotals, type BriefCore } from "../../lib/brief/brief-model";
import { SKELETON_DELAY_MS } from "@/shared/lib/use-presence";

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

/**
 * The hook's shape. `counting` and `totals` follow the cores unless a test states them, so a
 * fixture whose cores changed cannot keep a headline computed for other cores.
 */
function brief(overrides: Partial<InsightsBrief> = {}): InsightsBrief {
  const value = briefFixture(overrides);
  const cores = [value.ontology, value.wiki, value.harness, value.agent];
  return {
    ...value,
    counting: overrides.counting ?? briefCounting(cores),
    totals: "totals" in overrides ? (overrides.totals ?? null) : briefTotals(cores),
  };
}

function briefFixture(overrides: Partial<InsightsBrief>): Omit<InsightsBrief, "counting" | "totals"> & Partial<Pick<InsightsBrief, "counting" | "totals">> {
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
    sinceKind: null,
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
      evidence: null,
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

  it("draws only nonzero lines in one list, stale before unknown before what happened", () => {
    mount(brief());
    const list = screen.getByTestId("brief-lines");
    const lines = list.querySelectorAll("[data-brief-line]");
    // "agent-calls-since" is not here: the since card under the list names those calls one by
    // one, so counting them in the list too said one fact twice (review, 2026-09-25, round 4).
    expect([...lines].map((line) => line.getAttribute("data-brief-line"))).toEqual([
      "ontology-evidence-moved",
      "ontology-agent-unreviewed",
      "ontology-repair",
    ]);
    expect(lines[0]).toHaveAttribute("data-brief-state", "stale");
    expect(lines[0]).toHaveAttribute("data-brief-core", "ontology");
    // Every row names its core, the run's later rows too, so the column is one start line.
    for (const line of lines) expect(line).toHaveTextContent("개념");
    expect(list.querySelector('a[href="/ontology/insights/?tab=do-next"]')).not.toBeNull();
    fireEvent.click(screen.getByTestId("brief-line-open-ontology-evidence-moved"));
    // The stale line names what it counts: concept, the file, and both dates — never a bare number.
    const rows = list.querySelectorAll('[data-testid="brief-line-rows-ontology-evidence-moved"] li');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Payments");
    expect(rows[0]).toHaveTextContent("src/pay.ts");
    expect(list.querySelector('a[href="/topology/?p=capabilities%2Fpay"]')).not.toBeNull();
    expect(list.querySelectorAll('[data-brief-line][data-brief-core="wiki"]')).toHaveLength(0);
  });

  it("ends each sentence with its door, and makes each changed name its own door", () => {
    mount(brief());
    // The door is in the sentence's flow, so it follows the last word at every width instead
    // of standing in a column hundreds of pixels away (review, 2026-09-25, round 4).
    const repair = screen.getByTestId("brief-lines").querySelector('[data-brief-line="ontology-repair"] a[href="/ontology/insights/?tab=do-next"]');
    expect(repair?.parentElement).toHaveTextContent(/58|\d+개/);
    expect(repair?.parentElement?.tagName).toBe("SPAN");
    // A changed row is one link carrying its name; there is no separate "open" word per row.
    const since = screen.getByTestId("brief-since");
    for (const row of since.querySelectorAll("li[data-since-core]")) {
      const links = row.querySelectorAll("a");
      if (links.length === 0) continue;
      expect(links).toHaveLength(1);
      expect(links[0]).not.toHaveTextContent(/^열기$/);
    }
    expect(since).not.toHaveTextContent(/열기/);
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
    // The band shows the ring where no magnitude exists, never three dashes; the reason is the
    // list's to say, once.
    expect(screen.getByTestId("brief-core-state-harness")).toHaveTextContent("모름");
    expect(screen.getByTestId("brief-band")).not.toHaveTextContent("앱에서 재요");
    expect(screen.getByTestId("brief-core-wiki")).not.toHaveTextContent("아직 없음");
    // The list says why and where to go, one row per core.
    const wiki = screen.getByTestId("brief-core-empty-wiki");
    expect(wiki).toHaveTextContent("이 폴더엔 아직 위키 페이지가 없어요");
    expect(wiki.querySelector('a[href="/library/"]')).not.toBeNull();
    const appOnly = screen.getByTestId("brief-app-only");
    expect(appOnly).toHaveTextContent("앱에서만 잴 수 있어요");
    expect(appOnly).toHaveTextContent("지침");
    expect(appOnly.querySelector('a[href="/download/"]')).not.toBeNull();
  });

  /*
   * The hosted sample drew eight dashes, the app-only sentence twice and "Get the app" three
   * times on one screen (2026-09-23), against a decision that says nothing is listed twice.
   */
  it("prints no placeholder dash in the band and offers the app exactly once", () => {
    const unchecked = { id: "ontology-evidence-unchecked", count: 125, state: "unknown" } as const;
    mount(brief({ ontology: core({ core: "ontology", availability: "app-only", headline: 125, current: null, stale: null, unknown: 125, lines: [unchecked] }) }));
    expect(screen.getByTestId("brief-band")).not.toHaveTextContent("–");
    expect(document.querySelectorAll('a[href="/download/"]')).toHaveLength(1);
    expect(screen.getAllByText(/앱에서만 잴 수 있어요/)).toHaveLength(1);
    expect(screen.getByTestId("brief-app-only")).toHaveTextContent("개념 · 지침");
  });

  it("gives a measured core with nothing new one quiet row, not an empty card", () => {
    mount(brief({ agent: core({ core: "agent", headline: null, lines: [] }) }));
    expect(screen.getByTestId("brief-core-quiet-agent")).toHaveTextContent("그 뒤로 새로 알아야 할 것이 없어요");
  });

  it("keys the list's two marks in the headline and marks nothing that merely happened", () => {
    const { container } = mount(brief());
    const headline = screen.getByTestId("brief-headline");
    expect(headline.querySelector('[data-brief-headline-part="stale"]')).toHaveTextContent("새로 알아야 할 것 69개");
    expect(headline.querySelector('[data-brief-headline-part="unknown"]')).toHaveTextContent("확인 못 한 것 3개");
    const repair = container.querySelector('[data-brief-line="ontology-repair"] [aria-hidden="true"] > span');
    expect(repair?.className ?? "").toBe("");
  });

  it("says a kind every row shares once, in the title, not on every row", () => {
    mount(brief({ since: [{ core: "ontology", at: "2026-09-18T03:00:00Z", kind: "concept-doc", label: "Payments", href: "/topology/?p=a" }, { core: "ontology", at: "2026-09-18T02:00:00Z", kind: "concept-doc", label: "Refund", href: "/topology/?p=b" }], sinceTotal: 2, sinceKind: "concept-doc" }));
    const since = screen.getByTestId("brief-since");
    expect(since).toHaveTextContent("그 뒤로 바뀐 개념 문서 2건");
    expect(screen.queryAllByTestId("brief-since-kind")).toHaveLength(0);
  });

  it("names what changed since, newest first, and counts the rest", () => {
    mount(brief());
    const since = screen.getByTestId("brief-since");
    expect(since).toHaveTextContent("그 뒤로 바뀐 것 5건");
    expect(since.querySelectorAll("li")).toHaveLength(2);
    // Mixed kinds: each row names its own.
    expect(screen.getAllByTestId("brief-since-kind")).toHaveLength(2);
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

describe("a marked visit folds what it cleared", () => {
  /*
   * Direction C (owner, 2026-09-23): pressing "Seen up to here" re-anchors the list, and the lines
   * counting what happened since leave it. They fold instead of vanishing, so the press has an
   * answer a reader can see; the folding copy is out of the accessibility tree.
   */
  it("keeps a departing line for one fold, hidden from assistive technology, then drops it", async () => {
    vi.useFakeTimers();
    try {
      // Without an agent call in the since card, the list counts the calls itself.
      const first = brief({ since: [{ core: "ontology", at: "2026-09-18T03:00:00Z", kind: "concept-doc", label: "Payments", href: "/topology/?p=capabilities%2Fpay" }] });
      const { rerender } = render(
        <NextIntlClientProvider locale="ko" messages={ko}>
          <BriefTab brief={first} />
        </NextIntlClientProvider>,
      );
      expect(document.querySelector('[data-brief-line="agent-calls-since"]')).not.toBeNull();
      rerender(
        <NextIntlClientProvider locale="ko" messages={ko}>
          <BriefTab brief={{ ...first, agent: core({ core: "agent", headline: 0, lines: [] }) }} />
        </NextIntlClientProvider>,
      );
      expect(document.querySelector('[data-brief-line="agent-calls-since"]')).toBeNull();
      const leaving = document.querySelector("[data-brief-leaving]");
      expect(leaving).not.toBeNull();
      expect(leaving).toHaveAttribute("aria-hidden", "true");
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
      expect(document.querySelector("[data-brief-leaving]")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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
  it.each(["measured", "reading", "unreadable"] as const)("offers the app in a browser and never inside it: %s", (availability) => {
    /*
     * Measured in the installed app at 1040x720 on this repository's own vault: "50 concepts
     * whose code could not be checked · Get the app", inside the app. In a browser the same line
     * is honest, and since 2026-09-23 its door is the one app row at the foot of the list.
     */
    const line = { id: "ontology-evidence-unchecked", count: 4, state: "unknown" } as const;

    const browser = render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <BriefTab brief={brief({ ontology: core({ core: "ontology", availability: "app-only", headline: 9, lines: [line] }) })} />
      </NextIntlClientProvider>,
    );
    expect(browser.container.querySelector('[data-brief-line="ontology-evidence-unchecked"] a')).toBeNull();
    expect(browser.container.querySelectorAll('a[href="/download/"]')).toHaveLength(1);
    browser.unmount();

    const app = render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <BriefTab brief={brief({ ontology: core({ core: "ontology", availability, headline: 9, lines: [line] }), harness: core({ core: "harness", availability: "no-data", headline: 0 }) })} />
      </NextIntlClientProvider>,
    );
    const inApp = app.container.querySelector('[data-brief-line="ontology-evidence-unchecked"] a');
    expect(app.container.querySelector('a[href="/download/"]'), "앱 안에서 앱을 받으라고 한다").toBeNull();
    expect(inApp?.getAttribute("href")).toContain("/topology/");
  });
});

describe("no repository", () => {
  /*
   * Round 4 review, 2026-09-25: with no repository every concept is unchecked, and the unchecked
   * line and the connect row stood one above the other with two doors to the same map.
   */
  it("is one row in the unchecked line's place, with its ring and the one connect door", () => {
    const { container } = render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <BriefTab
          brief={brief({
            ontology: core({ core: "ontology", availability: "no-source", headline: 20, current: null, stale: null, unknown: null, lines: [{ id: "ontology-evidence-unchecked", count: 20, state: "unknown" }, { id: "ontology-repair", count: 5, state: "current" }] }),
            harness: core({ core: "harness", availability: "no-source", headline: null, current: null, stale: null, unknown: null }),
          })}
        />
      </NextIntlClientProvider>,
    );
    expect(container.querySelector('[data-brief-line="ontology-evidence-unchecked"]')).toBeNull();
    const rows = [...container.querySelectorAll('[data-testid="brief-lines"] > li')];
    const connect = screen.getByTestId("brief-core-no-source-ontology");
    expect(rows[0]).toBe(connect);
    expect(connect).toHaveTextContent("개념 · 지침");
    expect(connect.querySelector('a[href="/topology/"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="brief-lines"] a[href="/topology/"]')).toHaveLength(1);
    // The band states no reason at all: the one row above says it once (round 5 review found
    // "no repository" three times, twice in the band and once in this row).
    expect(screen.getByTestId("brief-band")).not.toHaveTextContent("저장소 연결 전");
    expect(screen.getByTestId("brief-core-state-harness")).toHaveTextContent("모름");
    expect(screen.getAllByText(/저장소를 연결하면/)).toHaveLength(1);
  });
});

describe("a count that has not landed", () => {
  /*
   * Real bridge, 2026-09-25: the harness scan lands seconds after the other cores, and the headline
   * painted their sum — "98 to learn · 99 not checked" — as final, then silently became 142 · 101
   * when the scan arrived; the since card said "98 concept documents" and then "228 changes". The
   * line now says it is counting, and the card waits.
   */
  const reading = core({ core: "harness", availability: "reading", headline: null, current: null, stale: null, unknown: null });

  it("says what it is counting, with no number, until every core has reported", () => {
    vi.useFakeTimers();
    try {
      mount(brief({ harness: reading, sinceTotal: null, since: [], sinceKind: null }));
      const headline = screen.getByTestId("brief-headline");
      expect(headline).toHaveAttribute("data-brief-headline-state", "counting");
      expect(headline).toHaveAttribute("aria-busy", "true");
      expect(headline.textContent).not.toMatch(/\d/);
      expect(headline).toHaveTextContent("새로 알아야 할 것과 확인 못 한 것을 세고 있어요");
      // The two marks it keys stay in front of the words they count.
      expect(headline.querySelector('[data-brief-counting-part="stale"]')).toHaveTextContent("새로 알아야 할 것");
      expect(headline.querySelector('[data-brief-counting-part="unknown"]')).toHaveTextContent("확인 못 한 것");
      // Inside the loading beat it is heard, not drawn: a read that lands in time shows nothing.
      const drawn = headline.firstElementChild as HTMLElement;
      expect(drawn).toHaveClass("opacity-0");
      expect(headline.querySelector(".acp-working-shimmer")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(SKELETON_DELAY_MS);
      });
      expect(drawn).not.toHaveClass("opacity-0");
      expect(headline.querySelector(".acp-working-shimmer")).not.toBeNull();
      // The since card is not drawn from a partial read.
      expect(screen.queryByTestId("brief-since")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the happened lines for the since card while it is still counted", () => {
    const withCalls = core({ core: "agent", headline: 12, lines: [{ id: "agent-calls-since", count: 12, state: "current" }] });
    const { container } = mount(brief({ harness: reading, agent: withCalls, sinceTotal: null, since: [], sinceKind: null }));
    // Drawn here now, it would fold away a moment later when the card lands and names the calls.
    expect(container.querySelector('[data-brief-line="agent-calls-since"]')).toBeNull();
  });

  it("keeps the last settled count while a later read runs, and marks it as being recounted", () => {
    vi.useFakeTimers();
    try {
      mount(brief({ harness: reading, totals: { stale: 142, unknown: 101 } }));
      const headline = screen.getByTestId("brief-headline");
      expect(headline).toHaveAttribute("data-brief-headline-state", "recounting");
      expect(headline).toHaveAttribute("aria-busy", "true");
      expect(headline).toHaveTextContent("새로 알아야 할 것 142개 · 확인 못 한 것 101개");
      const since = screen.getByTestId("brief-since");
      expect(since).toHaveAttribute("aria-busy", "true");
      expect(headline.querySelector(".acp-working-shimmer")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(SKELETON_DELAY_MS);
      });
      expect(headline.querySelector(".acp-working-shimmer")).not.toBeNull();
      expect(since.querySelector("h3 .acp-working-shimmer")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("is still and final once every core has reported", () => {
    mount(brief());
    const headline = screen.getByTestId("brief-headline");
    expect(headline).toHaveAttribute("data-brief-headline-state", "settled");
    expect(headline).not.toHaveAttribute("aria-busy");
    expect(headline.querySelector(".acp-working-shimmer")).toBeNull();
    expect(screen.getByTestId("brief-since")).not.toHaveAttribute("aria-busy");
  });
});
