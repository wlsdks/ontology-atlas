import { createTranslator } from "use-intl";
import { describe, expect, it } from "vitest";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import en from "../../../../../messages/en.json";
import type { CitedPassageState } from "../../lib/sources/use-cited-passage";
import type { SourceOutlineState } from "../../lib/sources/use-source-outline";
import { citationKey, openedSentenceKey, sourceFacts } from "./source-summary-facts";

const t = createTranslator({ locale: "en", messages: en, namespace: "library" }) as unknown as Parameters<typeof sourceFacts>[1];
const row = (over: Partial<LibrarySourceRow> = {}) =>
  ({ path: "sources/a.csv", name: "a.csv", format: "csv", bytes: 2048, state: "new", ...over }) as unknown as LibrarySourceRow;
const HASH = "a".repeat(64);
const keys = (facts: ReturnType<typeof sourceFacts>) => facts.map((fact) => fact.key);

describe("sourceFacts", () => {
  it("leaves the format out when the name already ends in it, and keeps it for a file with no extension", () => {
    expect(keys(sourceFacts({ row: row(), hash: null, passageHash: undefined, indexShowsState: false }, t))).toEqual(["path", "size", "state", "hash"]);
    expect(keys(sourceFacts({ row: row({ name: "README", format: "" }), hash: null, passageHash: undefined, indexShowsState: false }, t))).toEqual(["path", "format", "size", "state", "hash"]);
  });

  it("hides the state fact at lg only when the index beside the pane shows it", () => {
    const state = (indexShowsState: boolean) => sourceFacts({ row: row(), hash: null, passageHash: undefined, indexShowsState }, t).find((fact) => fact.key === "state");
    expect(state(true)?.wideHidden).toBe(true);
    expect(state(false)?.wideHidden).toBe(false);
  });

  it("says an unmeasured hash is unmeasured, never an empty cell", () => {
    const hash = sourceFacts({ row: row(), hash: null, passageHash: undefined, indexShowsState: false }, t).find((fact) => fact.key === "hash");
    expect(hash).toMatchObject({ value: t("source.hashUnmeasured"), title: undefined, mono: false, oneLine: false });
  });

  it("says a hash a citation's read measured was just read, keeping the whole value on the title", () => {
    const hash = sourceFacts({ row: row(), hash: null, passageHash: HASH, indexShowsState: false }, t).find((fact) => fact.key === "hash");
    expect(hash?.value).toContain(t("source.hashJustRead", { hash: "" }).trim().split(" ")[0]);
    expect(hash).toMatchObject({ title: HASH, mono: false, oneLine: true });
  });

  it("prefers the measured hash and sets it in mono on one line", () => {
    const hash = sourceFacts({ row: row(), hash: HASH, passageHash: "b".repeat(64), indexShowsState: false }, t).find((fact) => fact.key === "hash");
    expect(hash).toMatchObject({ title: HASH, mono: true, oneLine: true });
  });
});

describe("openedSentenceKey", () => {
  const passage = { path: "a", anchor: "L1", phase: "reading" } as unknown as CitedPassageState;
  const outline = (phase: SourceOutlineState["phase"]) => ({ path: "a", phase, outline: null }) as SourceOutlineState;

  it("names the citation when one was pressed, even if the outline was read too", () => {
    expect(openedSentenceKey(passage, outline("ready"))).toBe("source.openedForCitation");
  });

  it("names the outline once it is answered, and claims never opened only before that", () => {
    expect(openedSentenceKey(null, outline("ready"))).toBe("source.openedForOutline");
    expect(openedSentenceKey(null, outline("failed"))).toBe("source.openedForOutline");
    expect(openedSentenceKey(null, outline("reading"))).toBe("source.neverOpened");
    expect(openedSentenceKey(null, null)).toBe("source.neverOpened");
  });
});

describe("citationKey", () => {
  it("is the address of the citation: the same press keeps its key, another address has another", () => {
    expect(citationKey({ path: "sources/a.md", anchor: "L11" })).toBe(citationKey({ path: "sources/a.md", anchor: "L11" }));
    expect(citationKey({ path: "sources/a.md", anchor: "L11" })).not.toBe(citationKey({ path: "sources/a.md", anchor: "L12" }));
  });
});
