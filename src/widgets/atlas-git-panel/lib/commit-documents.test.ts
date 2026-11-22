import { describe, expect, it } from "vitest";
import type { AtlasGitDiffFile } from "@/shared/lib/git/atlas-git-record";
import { changedDocumentLabel, fileCarriesNode, patchOf, statusMark, type CommitConcept } from "./commit-documents";

describe("fileCarriesNode", () => {
  it("matches kind and slug tail together, so a shared tail under another kind does not match", () => {
    const file = { slug: "domains/orders", kind: "domain" };
    expect(fileCarriesNode(file, "domain:orders")).toBe(true);
    expect(fileCarriesNode(file, "capability:orders")).toBe(false);
    expect(fileCarriesNode(file, "domain:payments")).toBe(false);
  });

  it("never matches a file without a kind (config, deleted file)", () => {
    expect(fileCarriesNode({ slug: "orders", kind: null }, "null:orders")).toBe(false);
  });
});

describe("changedDocumentLabel", () => {
  const concepts: CommitConcept[] = [{ id: "domain:orders", label: "Orders", kind: "domain" }];

  it("prefers the concept's label", () => {
    expect(changedDocumentLabel({ path: "domains/orders.md", slug: "domains/orders", kind: "domain" }, concepts)).toBe(
      "Orders",
    );
  });

  it("falls back to the file name, dropping .md only for a node file", () => {
    expect(changedDocumentLabel({ path: "notes/ideas.md", slug: "notes/ideas", kind: "document" }, concepts)).toBe(
      "ideas",
    );
    expect(changedDocumentLabel({ path: "config/theme.md", slug: "config/theme", kind: null }, concepts)).toBe(
      "theme.md",
    );
  });
});

describe("patchOf", () => {
  const patches = [{ path: "vault/domains/orders.md" }, { path: "other.md" }] as AtlasGitDiffFile[];

  it("matches exact first, then by path tail in either direction", () => {
    expect(patchOf(patches, "other.md")).toBe(patches[1]);
    expect(patchOf(patches, "domains/orders.md")).toBe(patches[0]);
    expect(patchOf([{ path: "orders.md" }] as AtlasGitDiffFile[], "domains/orders.md")?.path).toBe("orders.md");
    expect(patchOf(patches, "missing.md")).toBeNull();
    expect(patchOf(patches, null)).toBeNull();
  });
});

describe("statusMark", () => {
  it("names each status by one letter and treats the rest as modified", () => {
    expect(statusMark("added")).toBe("A");
    expect(statusMark("deleted")).toBe("D");
    expect(statusMark("renamed")).toBe("R");
    expect(statusMark("modified")).toBe("M");
    expect(statusMark("typechange")).toBe("M");
  });
});
