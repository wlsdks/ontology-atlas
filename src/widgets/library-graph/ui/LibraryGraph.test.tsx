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
 * tests the part a person operates — the disclosure, the keyboard path, and the two
 * separate places a highlight can come from — without a rendering backend.
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

  it("says what the picture contains, counting the two relations apart", () => {
    renderGraph();
    expect(screen.getByTestId("library-graph-counts").textContent).toBe(
      "원문 1개 · 위키 문서 1개 · 개념 1개 · 인용 1 · 언급 1",
    );
  });

  it("moves through the dots with the arrow keys and opens the one it is on", () => {
    const { onSelect } = renderGraph();
    fireEvent.keyDown(canvas(), { key: "ArrowRight" });
    expect(canvas().getAttribute("data-focused-node-id")).toBe("source:sources/plan.pdf");
    fireEvent.keyDown(canvas(), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ kind: "source", ref: "sources/plan.pdf" });
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
    expect(screen.getByText("원문 plan.pdf, 3개 중 1번째. Enter 를 누르면 여기서 엽니다.")).toBeTruthy();
  });

  it("leaves for the map only on a concept, and says so before the key is pressed", () => {
    const { onSelect } = renderGraph();
    fireEvent.keyDown(canvas(), { key: "ArrowLeft" });
    expect(screen.getByText(/개념 checkout.*지도에서 엽니다\./)).toBeTruthy();
    fireEvent.keyDown(canvas(), { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining("/topology"));
  });

  it("remembers the person's own answer to whether it is open", () => {
    renderGraph();
    expect(screen.getByTestId("library-graph")).toHaveProperty("dataset.open", "true");
    fireEvent.click(screen.getByTestId("library-graph-toggle"));
    expect(screen.queryByTestId("library-graph-canvas")).toBeNull();
    expect(window.localStorage.getItem("library:graph-open:v1")).toBe("0");
  });

  it("draws no canvas at all before there is a page — one sentence about what will appear", () => {
    renderGraph({ wikiPages: [] });
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
