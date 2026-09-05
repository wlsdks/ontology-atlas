import { beforeEach, describe, expect, it } from "vitest";

import {
  DECLINED_KEY_PREFIX,
  forgetDeclinedCandidates,
  partitionByDeclined,
  readDeclinedCandidates,
  rememberDeclinedCandidates,
} from "./declined-candidates";
import type { SourceCandidate } from "@/entities/docs-vault";

function candidate(relativePath: string, rootPath = "/Users/x/project"): SourceCandidate {
  return {
    rootPath,
    rootLabel: "project",
    relativePath,
    name: relativePath.split("/").pop()!,
    extension: "pdf",
    size: 10,
    mtime: 1,
  };
}

beforeEach(() => window.localStorage.clear());

describe("a refusal is remembered per folder", () => {
  it("hides only what was left unticked", () => {
    const kept = candidate("docs/keep.pdf");
    const passed = candidate("docs/pass.pdf");
    rememberDeclinedCandidates("vault-a", [passed]);
    const { fresh, declinedCount } = partitionByDeclined(
      [kept, passed],
      readDeclinedCandidates("vault-a"),
    );
    expect(fresh.map((row) => row.relativePath)).toEqual(["docs/keep.pdf"]);
    expect(declinedCount).toBe(1);
  });

  it("does not leak between folders — the defect a global key produces", () => {
    rememberDeclinedCandidates("vault-a", [candidate("docs/pass.pdf")]);
    expect(readDeclinedCandidates("vault-b").size).toBe(0);
  });

  it("refuses an empty scope outright rather than falling back to a shared slot", () => {
    rememberDeclinedCandidates("", [candidate("docs/pass.pdf")]);
    // The literal key, so the registry gate can see which slot this test protects.
    expect(window.localStorage.getItem("atlas.library.declined:")).toBeNull();
    expect(DECLINED_KEY_PREFIX).toBe("atlas.library.declined:");
    expect(readDeclinedCandidates("").size).toBe(0);
  });

  it("writes under the vault scope it was given", () => {
    rememberDeclinedCandidates("vault-a", [candidate("docs/pass.pdf")]);
    expect(window.localStorage.getItem("atlas.library.declined:vault-a")).toContain(
      "docs/pass.pdf",
    );
  });

  it("forgetting brings every refusal back", () => {
    rememberDeclinedCandidates("vault-a", [candidate("docs/pass.pdf")]);
    forgetDeclinedCandidates("vault-a");
    expect(readDeclinedCandidates("vault-a").size).toBe(0);
  });

  it("separates the same path under two different roots", () => {
    rememberDeclinedCandidates("vault-a", [candidate("docs/plan.pdf", "/one")]);
    const { fresh } = partitionByDeclined(
      [candidate("docs/plan.pdf", "/two")],
      readDeclinedCandidates("vault-a"),
    );
    expect(fresh).toHaveLength(1);
  });

  it("survives a value somebody hand-edited into nonsense", () => {
    window.localStorage.setItem("atlas.library.declined:vault-a", "{not json");
    expect(readDeclinedCandidates("vault-a").size).toBe(0);
  });
});
