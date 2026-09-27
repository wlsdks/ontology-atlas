import { describe, expect, it } from "vitest";
import { resolveVaultChipIdentity } from "./vault-chip-identity";

describe("vault chip identity names the chosen source", () => {
  it("names the folder and doc count for an opened local folder", () => {
    expect(
      resolveVaultChipIdentity({
        source: "local",
        isLocalSourceLoaded: true,
        localFolderName: "my-notes",
      }),
    ).toEqual({ kind: "local", label: "my-notes", showDocCount: true });
  });

  /** The sample's count on a local screen would read as "my folder has 31 documents". */
  it("hides the count for local without a folder and is not the sample", () => {
    const pending = resolveVaultChipIdentity({
      source: "local",
      isLocalSourceLoaded: false,
      localFolderName: null,
    });
    expect(pending.kind).toBe("local-pending");
    expect(pending.showDocCount).toBe(false);
  });

  it("stays local when the folder name is empty", () => {
    expect(
      resolveVaultChipIdentity({
        source: "local",
        isLocalSourceLoaded: true,
        localFolderName: "",
      }).kind,
    ).toBe("local-pending");
  });

  it("names the sample and shows its doc count", () => {
    expect(
      resolveVaultChipIdentity({
        source: "server",
        isLocalSourceLoaded: false,
        localFolderName: null,
      }),
    ).toEqual({ kind: "sample", label: null, showDocCount: true });
  });
});
