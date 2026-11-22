import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { LibraryUiModel } from "@/features/library";

import en from "../../../../../messages/en.json";
import { libraryStageLines } from "./library-stage-lines";

const t = createTranslator({ locale: "en", messages: en, namespace: "library" }) as unknown as Parameters<typeof libraryStageLines>[0]["t"];

const folder = (states: readonly string[], pages = 0, needsCompileCount = 0, partialCount = 0) =>
  ({
    sources: states.map((state, index) => ({ state, path: `sources/${index}.md`, format: "md", name: `${index}.md` })),
    wikiPages: Array.from({ length: pages }, (_, index) => ({ slug: `wiki/p${index}`, title: `P${index}` })),
    needsCompileCount,
    partialCount,
  }) as unknown as LibraryUiModel;

const lines = (model: LibraryUiModel, over: Partial<Parameters<typeof libraryStageLines>[0]> = {}) =>
  libraryStageLines({
    model, route: "agent", inApp: true, localModel: null, canCheck: true,
    lintBlockedReason: null, lintBlockedReasonId: null, answerSlugs: undefined, t, ...over,
  });

describe("libraryStageLines", () => {
  it("prints the checking sentence once while hashes are being taken, and leaves Compile's reason out of the paragraph", () => {
    const result = lines(folder(Array(3).fill("checking"), 3));
    expect(result.compileCaption).toBe(t("stage.compile.checkingLine", { count: 3 }));
    expect(result.blockedBelow).toBeNull();
  });

  it("says nothing is waiting only once every source is measured", () => {
    const result = lines(folder(["compiled", "compiled"], 2));
    expect(result.compileCaption).toBe(t("stage.blockedNothingWaiting"));
    expect(result.blockedBelow).toBeNull();
  });

  it("names a partial read's cure without a number only when one exists", () => {
    expect(lines(folder(["partial"], 1, 0, 1)).partialNote).toBe(t("stage.compile.partialLine"));
    expect(lines(folder(["compiled"], 1)).partialNote).toBeNull();
  });

  it("takes no check reason while the check can run", () => {
    const result = lines(folder(["compiled"], 2), { canCheck: true, lintBlockedReason: "Needs an agent." });
    expect(result.lintBlocked).toBeNull();
    expect(result.lintReasonBelow).toBeNull();
  });

  it("prints the check's reason itself when no other surface owns it, and points the button at it", () => {
    const result = lines(folder(["compiled"], 2), { canCheck: false, lintBlockedReason: "Needs an agent." });
    expect(result.lintReasonBelow).toBe("Needs an agent.");
    expect(result.lintReasonId).toBe("library-stage-lint-blocked");
  });

  it("does not print the check's reason again when another surface owns it, and points at that surface", () => {
    const result = lines(folder(["compiled"], 2), { canCheck: false, lintBlockedReason: "Needs an agent.", lintBlockedReasonId: "landing-reason" });
    expect(result.lintReasonBelow).toBeNull();
    expect(result.lintReasonId).toBe("landing-reason");
  });
});
