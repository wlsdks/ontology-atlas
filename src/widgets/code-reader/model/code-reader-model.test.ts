import { describe, expect, it } from "vitest";

import { citeTrust, codeReaderTarget, readerPlacement, type ReaderRoom, refusalState, SAME_WRITE_SLACK_MS, windowAround, windowJoining } from "./code-reader-model";

describe("codeReaderTarget", () => {
  it("opens the declared file with the ranges cited in it only", () => {
    expect(
      codeReaderTarget("src/billing/invoice.ts", "Rounds per line (`src/billing/invoice.ts:L40-L52`); taxes in src/billing/tax.ts:L3."),
    ).toEqual({ path: "src/billing/invoice.ts", ranges: [{ path: "src/billing/invoice.ts", startLine: 40, endLine: 52 }] });
  });

  it("opens the first cited file inside a declared folder", () => {
    expect(codeReaderTarget("src/billing/", "See src/billing/invoice.ts:L4.")?.path).toBe("src/billing/invoice.ts");
  });

  it("opens the first cited file when the document declares no path", () => {
    expect(codeReaderTarget(undefined, "src/a.ts:L2 then src/b.ts:L9")?.path).toBe("src/a.ts");
  });

  it("reads a Windows separator and a decomposed Hangul name as the same file", () => {
    const decomposed = "문서/결제.ts".normalize("NFD");
    expect(codeReaderTarget(".\\문서\\결제.ts", `${decomposed}:L1`)).toEqual({
      path: "문서/결제.ts",
      ranges: [{ path: "문서/결제.ts", startLine: 1, endLine: 1 }],
    });
  });

  it("is null for a document that names no code", () => {
    expect(codeReaderTarget(undefined, "Turns a cart into an invoice.")).toBeNull();
    expect(codeReaderTarget(["", 3], "")).toBeNull();
  });
});

describe("windowAround", () => {
  it("starts above the range so its surroundings are in view", () => {
    expect(windowAround({ path: "a.ts", startLine: 40, endLine: 52 })).toEqual({ firstLine: 28, lineCount: 120 });
  });

  it("starts at the top for a range near it, and reads the top without a range", () => {
    expect(windowAround({ path: "a.ts", startLine: 3, endLine: 3 }).firstLine).toBe(1);
    expect(windowAround(null)).toEqual({ firstLine: 1, lineCount: 120 });
  });

  it("holds a long range whole within the read bound", () => {
    const window = windowAround({ path: "a.ts", startLine: 100, endLine: 398 });
    expect(window.firstLine + window.lineCount - 1).toBeGreaterThanOrEqual(398);
    expect(window.lineCount).toBeLessThanOrEqual(400);
  });
});

describe("citeTrust", () => {
  const range = { path: "a.ts", startLine: 10, endLine: 20 };
  const written = Date.UTC(2026, 10, 1);

  it.each([
    ["no cited range", { range: null, totalLines: 50, fileModifiedMs: written, documentModifiedMs: written }, "none"],
    ["a range past the end", { range, totalLines: 15, fileModifiedMs: written, documentModifiedMs: written }, "beyond"],
    ["a file written after the document", { range, totalLines: 50, fileModifiedMs: written + 60_000, documentModifiedMs: written }, "stale"],
    ["a file written before the document", { range, totalLines: 50, fileModifiedMs: written - 60_000, documentModifiedMs: written }, "current"],
    ["two writes too close to order", { range, totalLines: 50, fileModifiedMs: written + SAME_WRITE_SLACK_MS, documentModifiedMs: written }, "unknown"],
    ["no document time", { range, totalLines: 50, fileModifiedMs: written, documentModifiedMs: null }, "unknown"],
  ] as const)("says %s", (_, input, trust) => {
    expect(citeTrust(input)).toBe(trust);
  });
});

describe("refusalState", () => {
  it("names each refusal and treats an unnamed failure as not read", () => {
    expect(refusalState("code-reader-gone")).toBe("gone");
    expect(refusalState("code-reader-other-system")).toBe("otherSystem");
    expect(refusalState("ipc-closed")).toBe("outside");
    expect(refusalState(null)).toBe("outside");
  });
});

describe("readerPlacement", () => {
  const room = (slotWidthPx: number, more: Partial<ReaderRoom> = {}): ReaderRoom => ({
    slotWidthPx,
    listReachPx: 0,
    conversationWidthPx: 0,
    rightInsetPx: 0,
    panelReachPx: 352,
    ...more,
  });

  it.each([
    ["1040", room(976), { mode: "replace", widthPx: 496, makesRoom: false }],
    ["1512", room(1448), { mode: "beside", widthPx: 616, makesRoom: false }],
    ["1920", room(1856), { mode: "beside", widthPx: 640, makesRoom: false }],
    ["1040 with the conversation", room(976 - 393, { conversationWidthPx: 393 }), { mode: "replace", widthPx: 496, makesRoom: true }],
    ["1512 with the conversation", room(1448 - 393, { conversationWidthPx: 393 }), { mode: "replace", widthPx: 575, makesRoom: false }],
    ["1920 with the conversation", room(1856 - 420, { conversationWidthPx: 420 }), { mode: "beside", widthPx: 604, makesRoom: false }],
  ] as const)("matches the spec's layout at a %s window", (_, measured, placement) => {
    expect(readerPlacement(measured)).toEqual(placement);
  });

  it("keeps the map's 480 px beside a reader that stands at the panel's inset", () => {
    const placement = readerPlacement(room(976, { rightInsetPx: 24, panelReachPx: 364 }));
    expect(placement).toMatchObject({ mode: "replace", widthPx: 472 });
    expect(976 - 24 - placement.widthPx).toBeGreaterThanOrEqual(480);
  });

  it("counts the expanded concept list out of the map, so the reader takes the panel's place", () => {
    const placement = readerPlacement(room(1384, { listReachPx: 324, rightInsetPx: 24, panelReachPx: 364 }));
    expect(placement).toEqual({ mode: "replace", widthPx: 556, makesRoom: false });
    expect(1384 - 324 - 24 - placement.widthPx).toBeGreaterThanOrEqual(480);
  });

  it("asks the concept list to give way when the reader would not fit even in the panel's place", () => {
    expect(readerPlacement(room(976, { listReachPx: 324, rightInsetPx: 24, panelReachPx: 364 }))).toEqual({
      mode: "replace",
      widthPx: 472,
      makesRoom: true,
    });
  });
});

describe("windowJoining", () => {
  it("reads one window spanning the shown lines and a nearby range with its lead-in", () => {
    expect(windowJoining({ firstLine: 28, lineCount: 120 }, { path: "a.ts", startLine: 7, endLine: 7 })).toEqual({ firstLine: 1, lineCount: 147 });
  });

  it("gives up when the two together pass the window's line bound", () => {
    expect(windowJoining({ firstLine: 28, lineCount: 120 }, { path: "a.ts", startLine: 900, endLine: 910 })).toBeNull();
  });
});
