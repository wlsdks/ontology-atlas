import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import koMessages from "../../../../messages/ko.json";
import type { VaultDoc } from "@/entities/docs-vault";
import { LibraryGraph } from "./LibraryGraph";

/**
 * The interaction claims, made falsifiable.
 *
 * jsdom has no canvas, and that is exactly why this file can exist: `draw()` returns
 * before it touches a 2D context because the box is never measured, so everything below
 * tests the part a person operates — what is drawn without being asked for, the keyboard
 * path, and the two separate places a highlight can come from — without a rendering
 * backend.
 */

const routerPush = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

function doc(slug: string, frontmatter: Record<string, unknown> = {}, linksOut: string[] = []): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title: slug.split("/").pop() ?? slug,
    tags: [],
    frontmatter,
    headings: [],
    excerpt: "",
    wordCount: 0,
    updatedAt: "2026-09-06T00:00:00.000Z",
    linksOut,
  };
}

const DOCS = [doc("wiki/plan", {}, ["domains/checkout"]), doc("domains/checkout", { kind: "domain" })];
const PAGES = [{ slug: "wiki/plan", title: "Quarter plan", sourcePaths: ["sources/plan.pdf"] }];
const SOURCES = [{ path: "sources/plan.pdf", state: "compiled" as const }];

function renderGraph(overrides: Partial<Parameters<typeof LibraryGraph>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <LibraryGraph
        docs={DOCS}
        wikiPages={PAGES}
        sources={SOURCES}
        selection={null}
        onSelect={onSelect}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onSelect };
}

const canvas = () => screen.getByTestId("library-graph-canvas");

describe("the library graph section", () => {
  beforeEach(() => {
    routerPush.mockReset();
    window.localStorage.clear();
  });

  it("does not schedule active-work frames behind the reader, and resumes without remounting", () => {
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      pending.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
    const draw = (visible: boolean) => (
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <LibraryGraph docs={DOCS} wikiPages={PAGES} sources={SOURCES} selection={null}
          onSelect={() => {}} visible={visible}
          activity={{ isActive: true, recent: [], current: {
            id: "read", kind: "read", phase: "active", at: Date.now(),
            target: { kind: "source", ref: "sources/plan.pdf" },
          } }} />
      </NextIntlClientProvider>
    );
    try {
      const view = render(draw(false));
      const original = canvas();
      expect(pending.size).toBe(0);
      view.rerender(draw(true));
      expect(pending.size).toBe(1);
      view.rerender(draw(false));
      expect(pending.size).toBe(0);
      expect(canvas()).toBe(original);
      view.unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("says what the picture contains, counting the two relations apart", () => {
    renderGraph();
    expect(screen.getByTestId("library-graph-counts").textContent).toBe(
      "원문 1개 · 위키 문서 1개 · 개념 1개 · 인용 1 · 언급 1",
    );
  });

  /*
   * ⚠️ **`Enter` used to be the commit** — it called `onSelect` and the Library replaced the
   * picture with the page. Since 2026-09-12 it opens the card beside the mark instead, and
   * `Open` inside the card is the commit. The claim this case keeps is the pair: the
   * keyboard reaches the mark, and the mark answers **without leaving the screen**.
   */
  it("moves through the dots with the arrow keys and opens a card beside the one it is on", () => {
    const { onSelect } = renderGraph();
    fireEvent.keyDown(canvas(), { key: "ArrowRight" });
    expect(canvas().getAttribute("data-focused-node-id")).toBe("source:sources/plan.pdf");
    fireEvent.keyDown(canvas(), { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    const card = screen.getByTestId("library-graph-card");
    expect(card.getAttribute("data-card-node-id")).toBe("source:sources/plan.pdf");
    expect(card.getAttribute("data-transient-surface")).toBe("anchored");
    expect(screen.getByTestId("library-graph-card-title").textContent).toBe("plan.pdf");
    // And the commit is a door inside it, named.
    fireEvent.click(screen.getByTestId("library-graph-card-open"));
    expect(onSelect).toHaveBeenCalledWith({ kind: "source", ref: "sources/plan.pdf" });
    expect(screen.queryByTestId("library-graph-card")).toBeNull();
  });

  it("closes the card on Escape, on its own control, and on a second Enter", () => {
    renderGraph();
    fireEvent.keyDown(canvas(), { key: "ArrowRight" });
    fireEvent.keyDown(canvas(), { key: "Enter" });
    expect(screen.getByTestId("library-graph-card")).toBeTruthy();
    // Escape is answered by the card's own capture listener, so the keyboard's position
    // on the canvas survives one press: one press closes one thing.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("library-graph-card")).toBeNull();
    expect(canvas().getAttribute("data-focused-node-id")).toBe("source:sources/plan.pdf");

    fireEvent.keyDown(canvas(), { key: "Enter" });
    fireEvent.keyDown(canvas(), { key: "Enter" });
    expect(screen.queryByTestId("library-graph-card")).toBeNull();

    fireEvent.keyDown(canvas(), { key: "Enter" });
    fireEvent.click(screen.getByTestId("library-graph-card-close"));
    expect(screen.queryByTestId("library-graph-card")).toBeNull();
  });

  it("says what the folder knows about the mark, and what the lines are doing", () => {
    renderGraph({
      cardFacts: () => ({
        sentence: "정산은 완료된 거래를 돈으로 바꾼다.",
        counts: { sources: 2, cites: 4, mentions: 1, stale: 1 },
        rows: [
          { id: "source:sources/settlement-policy.md", label: "settlement-policy.md", state: "compiled" },
          { id: "source:sources/fee-schedule.csv", label: "fee-schedule.csv", state: "stale" },
        ],
        refresh: { onRequest: null, reason: "연결된 코딩 에이전트가 없습니다" },
      }),
    });
    fireEvent.keyDown(canvas(), { key: "ArrowRight" });
    fireEvent.keyDown(canvas(), { key: "ArrowRight" });
    expect(canvas().getAttribute("data-focused-node-id")).toBe("page:wiki/plan");
    fireEvent.keyDown(canvas(), { key: "Enter" });
    expect(screen.getByTestId("library-graph-card-sentence").textContent).toContain("정산은 완료된");
    // The facts line carries both the counts and the one thing the folder cannot vouch for.
    expect(screen.getByTestId("library-graph-card-facts").textContent).toBe(
      "원문 2 · 인용 문장 4 · 언급 1 · 원문 1개 달라짐",
    );
    expect(screen.getByTestId("library-graph-card-rows").textContent).toContain("fee-schedule.csv");
    // A door that cannot open is the reason instead, never a chip that does nothing.
    expect(screen.queryByTestId("library-graph-card-refresh")).toBeNull();
    expect(screen.getByTestId("library-graph-card-reason").textContent).toContain("코딩 에이전트");
    // The drift has words **in the card**, beside the lines it is about — and the legend
    // below the canvas keeps teaching the marks while the card stands open.
    expect(screen.getByTestId("library-graph-card-flow").textContent).toContain(
      "인용은 원문에서 이 문서로 흐릅니다",
    );
    // The slot below the canvas still belongs to the picture: here the keyboard is on a
    // mark, so it describes that mark, and with nothing pointed at it is the legend.
    expect(screen.getByTestId("library-graph-hint").textContent).toContain("위키 문서");
  });

  it("wraps backwards from the start rather than stopping at nothing", () => {
    renderGraph();
    fireEvent.keyDown(canvas(), { key: "ArrowLeft" });
    expect(canvas().getAttribute("data-focused-node-id")).toBe("concept:domains/checkout");
  });

  it("keeps the keyboard's position when the pointer leaves — they are two states", () => {
    renderGraph();
    fireEvent.keyDown(canvas(), { key: "ArrowRight" });
    fireEvent.pointerLeave(canvas());
    expect(canvas().getAttribute("data-focused-node-id")).toBe("source:sources/plan.pdf");
    fireEvent.blur(canvas());
    expect(canvas().getAttribute("data-focused-node-id")).toBe("");
  });

  it("lets Escape put the keyboard down without leaving the canvas", () => {
    renderGraph();
    fireEvent.keyDown(canvas(), { key: "ArrowRight" });
    fireEvent.keyDown(canvas(), { key: "Escape" });
    expect(canvas().getAttribute("data-focused-node-id")).toBe("");
  });

  it("says the kind, the position and what Enter will do — a bare name says none of it", () => {
    renderGraph();
    fireEvent.keyDown(canvas(), { key: "ArrowRight" });
    expect(screen.getByText("원문 plan.pdf, 3개 중 1번째. Enter를 누르면 무엇인지 보여 줍니다.")).toBeTruthy();
  });

  /*
   * ⚠️ **The concept's label used to carry "open on the map"**, because its press was the one
   * press on this canvas that left the screen. No press does now: the concept's card says
   * what it is and offers the map as a door. So the destination is still named before
   * anything leaves — one control further in, and pressed on purpose.
   */
  it("leaves for the map only from the concept's own door, never from the press", () => {
    const { onSelect } = renderGraph();
    fireEvent.keyDown(canvas(), { key: "ArrowLeft" });
    expect(screen.getByText(/개념 checkout.*무엇인지 보여 줍니다\./)).toBeTruthy();
    fireEvent.keyDown(canvas(), { key: "Enter" });
    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("library-graph-card").getAttribute("data-card-kind")).toBe("concept");
    expect(screen.getByTestId("library-graph-card-sentence").textContent).toBe("지도의 개념입니다.");
    expect(screen.queryByTestId("library-graph-card-open")).toBeNull();
    fireEvent.click(screen.getByTestId("library-graph-card-map"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining("/topology"));
  });

  /*
   * This used to assert the disclosure: a chip that opened and closed the section and
   * remembered the answer in `localStorage`. The owner removed the premise on 2026-09-06
   * — the pane **is** the picture — so what has to be true now is that nothing has to be
   * pressed, and that the screen's own row still reaches the header.
   */
  it("draws itself with nothing pressed, and hangs the screen's own row beside the caption", () => {
    renderGraph({ headerEnd: <span data-testid="probe-header-end">next</span> });
    expect(screen.getByTestId("library-graph-canvas")).toBeTruthy();
    expect(screen.queryByTestId("library-graph-toggle")).toBeNull();
    expect(screen.getByTestId("probe-header-end")).toBeTruthy();
  });

  /*
   * "Nothing to draw" is **no nodes**, not "no pages". A folder of PDFs nobody has
   * compiled draws one square each, and those squares are the whole of what the list's
   * `not compiled` word says, so replacing them with a sentence would hide the state on
   * the one surface that shows every file at once.
   */
  it("draws the sources of a folder nobody has compiled, and a sentence only when there is nothing at all", () => {
    renderGraph({ wikiPages: [], docs: [] });
    expect(screen.getByTestId("library-graph-canvas")).toBeTruthy();
    screen.getByTestId("library-graph-canvas").remove();

    renderGraph({ wikiPages: [], docs: [], sources: [] });
    expect(screen.queryByTestId("library-graph-canvas")).toBeNull();
    expect(screen.getByTestId("library-graph-empty").textContent).toContain("아직 그릴 것이 없습니다");
  });

  it("keeps the keyboard sentence out of the rendered line and inside the description", () => {
    renderGraph();
    expect(screen.getByTestId("library-graph-hint").textContent).not.toContain("화살표");
    expect(canvas().getAttribute("aria-describedby")).toBe("library-graph-hint library-graph-keys");
    expect(document.getElementById("library-graph-keys")?.textContent).toContain("화살표");
  });
});
