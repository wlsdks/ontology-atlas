import { describe, expect, it } from "vitest";

import { WIKI_PAGE_TEMPLATE } from "@/shared/lib/wiki-page-schema";
import { judgePageWrite, proposedPageText, wikiPagePathOf } from "./judge-page-write";

const ROOT = "/Users/probe/Ontology Atlas/launch";
const GOOD = WIKI_PAGE_TEMPLATE.replace(/sources\/<file>/g, "sources/plan.pdf");
const KNOWN = ["sources/plan.pdf"];

function request(filePath: string | null, rawInput: Record<string, unknown>, toolKind = "edit") {
  return { filePath, rawInput, toolKind };
}

describe("which writes are judged", () => {
  it("names a Markdown file under wiki/ and nothing else", () => {
    expect(wikiPagePathOf(`${ROOT}/wiki/plan.md`, ROOT)).toBe("wiki/plan.md");
    expect(wikiPagePathOf(`${ROOT}/wiki/deep/plan.md`, ROOT)).toBe("wiki/deep/plan.md");
    expect(wikiPagePathOf(`${ROOT}/sources/plan.pdf`, ROOT)).toBeNull();
    expect(wikiPagePathOf(`${ROOT}/capabilities/x.md`, ROOT)).toBeNull();
    expect(wikiPagePathOf(`/elsewhere/wiki/plan.md`, ROOT)).toBeNull();
    expect(wikiPagePathOf(null, ROOT)).toBeNull();
  });

  it("gives no verdict for a read, or for a file it cannot see the text of", () => {
    expect(judgePageWrite({ request: request(`${ROOT}/wiki/plan.md`, { content: GOOD }, "read"), vaultRoot: ROOT, currentText: () => null, knownSources: KNOWN })).toBeNull();
    expect(judgePageWrite({ request: request(`${ROOT}/wiki/plan.md`, { old_string: "a", new_string: "b" }), vaultRoot: ROOT, currentText: () => null, knownSources: KNOWN })).toBeNull();
  });
});

describe("the text that is judged is the text that would land", () => {
  it("a whole-file write is judged as given", () => {
    const verdict = judgePageWrite({ request: request(`${ROOT}/wiki/plan.md`, { content: GOOD }), vaultRoot: ROOT, currentText: () => null, knownSources: KNOWN });
    expect(verdict).toMatchObject({ path: "wiki/plan.md", ok: true, problems: [], text: GOOD });
  });

  it("an edit is applied to the page on disk before judging", () => {
    const broken = judgePageWrite({
      request: request(`${ROOT}/wiki/plan.md`, { old_string: " [[src:sources/plan.pdf#p1]]", new_string: "." }),
      vaultRoot: ROOT,
      currentText: () => GOOD,
      knownSources: KNOWN,
    });
    expect(broken?.ok).toBe(false);
    expect(broken?.problems.map((p) => p.code)).toContain("uncited-fact");
  });

  it("an edit whose anchor is not in the page yields no verdict rather than a wrong one", () => {
    expect(proposedPageText({ old_string: "not there", new_string: "x" }, GOOD)).toBeNull();
  });

  it("replace_all replaces every occurrence, and a single edit needs its anchor exactly once, as the edit tool does", () => {
    expect(proposedPageText({ old_string: "a", new_string: "b", replace_all: true }, "a-a")).toBe("b-b");
    expect(proposedPageText({ old_string: "a", new_string: "b" }, "a-a")).toBeNull();
    expect(proposedPageText({ old_string: "a", new_string: "b" }, "x-a")).toBe("x-b");
  });

  it("applies the new text literally, so replacement patterns such as $& and $' are never expanded", () => {
    expect(proposedPageText({ old_string: "a", new_string: "$&$'$`$$" }, "xay")).toBe("x$&$'$`$$y");
    expect(proposedPageText({ old_string: "a", new_string: "[$&]", replace_all: true }, "a-a")).toBe("[$&]-[$&]");
    const verdict = judgePageWrite({
      request: request(`${ROOT}/wiki/plan.md`, { old_string: "status: draft", new_string: "status: reviewed\n$&" }),
      vaultRoot: ROOT,
      currentText: () => GOOD,
      knownSources: KNOWN,
    });
    expect(verdict?.text).toContain("status: reviewed\n$&");
  });

  it("an empty new_string also takes the newline after old_string, as the edit tool does", () => {
    expect(proposedPageText({ old_string: " JOIN", new_string: "" }, "a JOIN\nb\n")).toBe("ab\n");
    expect(proposedPageText({ old_string: "x", new_string: "", replace_all: true }, "x\nyx\n x")).toBe("y x");
    expect(proposedPageText({ old_string: "a\n", new_string: "" }, "a\n\nb")).toBe("\nb");
    expect(proposedPageText({ old_string: "a", new_string: "" }, "xay")).toBe("xy");
    expect(proposedPageText({ old_string: " JOIN", new_string: "X" }, "a JOIN\nb")).toBe("aX\nb");
  });

  it("a page carrying kind: is refused at the gate, which is the one problem that changes what the file is", () => {
    const verdict = judgePageWrite({ request: request(`${ROOT}/wiki/plan.md`, { content: GOOD.replace("---\ntitle:", "---\nkind: capability\ntitle:") }), vaultRoot: ROOT, currentText: () => null, knownSources: KNOWN });
    expect(verdict?.problems.map((p) => p.code)).toContain("kind-present");
  });
});
