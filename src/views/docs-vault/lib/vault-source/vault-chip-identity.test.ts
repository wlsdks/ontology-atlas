import { describe, expect, it } from "vitest";
import { resolveVaultChipIdentity } from "./vault-chip-identity";

describe("vault chip identity names the open folder", () => {
  it("names the folder and doc count for an opened local folder", () => {
    expect(
      resolveVaultChipIdentity({
        isLocalSourceLoaded: true,
        localFolderName: "my-notes",
      }),
    ).toEqual({ kind: "local", label: "my-notes", showDocCount: true });
  });

  /** A count read before the folder arrives would read as "my folder has no documents". */
  it("hides the count while no folder is read", () => {
    const pending = resolveVaultChipIdentity({
      isLocalSourceLoaded: false,
      localFolderName: null,
    });
    expect(pending.kind).toBe("local-pending");
    expect(pending.showDocCount).toBe(false);
  });

  it("stays pending when the folder name is empty", () => {
    expect(
      resolveVaultChipIdentity({
        isLocalSourceLoaded: true,
        localFolderName: "",
      }).kind,
    ).toBe("local-pending");
  });
});
