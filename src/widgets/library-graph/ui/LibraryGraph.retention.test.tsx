import { act, fireEvent, render, screen } from "@testing-library/react";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import koMessages from "../../../../messages/ko.json";
import type { VaultDoc } from "@/entities/docs-vault";
import type { LibraryIslandPick } from "./library-graph-engine/engine-types";
import { LibraryGraph } from "./LibraryGraph";

/**
 * A hash publish re-renders the page with a new `onSelect` and new source rows, and the engine
 * re-renders the graph alone when its islands change. Neither may leave a handler that keeps
 * an earlier render, and with it that render's rows, alive.
 */

const router = vi.hoisted(() => ({ push: () => {} }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => router }));

/** Only the latest arguments are kept: holding every call would itself keep every render. */
const engine = vi.hoisted(() => ({
  islands: [] as readonly LibraryIslandPick[],
  rerender: (() => {}) as () => void,
  onActivate: null as unknown,
  onActivateChanges: 0,
  focusedIslandId: null as string | null,
}));
vi.mock("./use-library-graph-engine", async () => {
  const { useState } = await import("react");
  const idle = () => {};
  const walkOrder: readonly string[] = [];
  return {
    useLibraryGraphEngine: (input: { onActivate: unknown; focusedIslandId: string | null }) => {
      const [, setRound] = useState(0);
      engine.rerender = () => setRound((round) => round + 1);
      if (engine.onActivate !== null && engine.onActivate !== input.onActivate) engine.onActivateChanges += 1;
      engine.onActivate = input.onActivate;
      engine.focusedIslandId = input.focusedIslandId;
      return {
        onPointerDown: idle, onPointerMove: idle, onPointerUp: idle, onPointerCancel: idle,
        onPointerLeave: idle, onDoubleClick: idle, fitToView: idle, placeCard: idle,
        framed: true, pictureAspect: null, picture: "islands", islands: engine.islands, walkOrder,
      };
    },
  };
});

const DOCS: VaultDoc[] = [{
  slug: "wiki/plan", path: "wiki/plan.md", title: "plan", tags: [], frontmatter: {}, headings: [],
  excerpt: "", wordCount: 0, updatedAt: "2026-09-06T00:00:00.000Z", linksOut: [],
}];
const PAGES = [{ slug: "wiki/plan", title: "Quarter plan", sourcePaths: ["sources/plan.pdf"] }];

const sourcesOf = (round: number) => [{ path: "sources/plan.pdf", state: "compiled" as const, round }];
const islandsOf = (round: number): LibraryIslandPick[] => [
  { id: `island-${round}`, kind: "folder", label: `Island ${round}`, conceptId: null, pages: ["wiki/plan"], sources: [] },
];

function graphAt(sources: ReturnType<typeof sourcesOf>) {
  return (
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <LibraryGraph docs={DOCS} wikiPages={PAGES} sources={sources} selection={null} onSelect={() => {}} />
    </NextIntlClientProvider>
  );
}

/** A page render: new `onSelect` and new rows, as a hash publish brings. */
function publish(rerender: (ui: React.ReactNode) => void, round: number) {
  rerender(graphAt(sourcesOf(round)));
}

/** A graph-only render: the engine's islands change and the page's props do not. */
function relayIslands(round: number) {
  act(() => {
    engine.islands = islandsOf(round);
    engine.rerender();
  });
}

beforeEach(() => {
  engine.islands = islandsOf(0);
  engine.onActivate = null;
  engine.onActivateChanges = 0;
});

describe("library graph renders while sources are checked", () => {
  it("hands the engine one activate handler across new onSelect props and new islands", () => {
    const { rerender } = render(graphAt(sourcesOf(1)));
    publish(rerender, 2);
    relayIslands(3);
    publish(rerender, 4);

    expect(engine.onActivateChanges).toBe(0);
  });

  it("steps through the islands of the latest render", () => {
    const { rerender } = render(graphAt(sourcesOf(1)));
    relayIslands(2);
    publish(rerender, 3);

    fireEvent.keyDown(screen.getByTestId("library-graph-canvas"), { key: "ArrowRight" });

    expect(engine.focusedIslandId).toBe("island-2");
  });

  it("lets a superseded render's source rows be collected once later renders replace it", async () => {
    setFlagsFromString("--expose-gc");
    const gc = runInNewContext("gc") as () => void;
    const { rerender } = render(graphAt(sourcesOf(1)));
    const superseded = (() => {
      const rows = sourcesOf(2);
      rerender(graphAt(rows));
      return new WeakRef(rows);
    })();
    relayIslands(3);
    publish(rerender, 4);
    relayIslands(5);
    publish(rerender, 6);

    // A WeakRef keeps its target until the job that made it ends; one turn of the event loop ends it.
    await new Promise((resolve) => setImmediate(resolve));
    gc();

    expect(superseded.deref()).toBeUndefined();
  });
});
