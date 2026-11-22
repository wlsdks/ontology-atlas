import { describe, expect, it } from "vitest";

import { requestFromBrowserDrop, requestFromNativeOffer } from "./source-drop";

const root = {} as FileSystemDirectoryHandle;
const droppedFile = (name: string) => Promise.resolve({ kind: "file" as const, name, getFile: async () => new File(["x".repeat(100)], name) });

describe("a drop becomes a copy request", () => {
  it("skips a single dropped file named like a key, since agents read the sources folder", async () => {
    const request = await requestFromBrowserDrop(root, [droppedFile("id_rsa"), droppedFile("plan.pdf")]);
    expect(request.files).toBe(1);
    expect(request.plan.skipped).toEqual([{ name: "id_rsa", reason: "secretName" }]);
  });

  it("refuses a dropped folder that holds the open folder and walks nothing in it", async () => {
    const folder = Promise.resolve({
      kind: "directory" as const,
      name: "home",
      holds: async () => true,
      children: () => { throw new Error("walked a folder holding the open folder"); },
    });
    const request = await requestFromBrowserDrop(root, [folder]);
    expect(request).toMatchObject({ files: 0, holdsOpenFolder: ["home"] });
  });

  it("counts the skipped files Rust counted but did not name", () => {
    const request = requestFromNativeOffer("/vault", {
      files: [],
      skipped: [{ relativePath: "keys/a.pem", reason: "secretName" }],
      skippedCounts: { secretName: 1_200, licence: 0, notDocument: 3 },
      totalBytes: 0,
      truncated: false,
      holdsOpenFolder: [],
    });
    expect(request.plan.skippedUnlisted).toEqual({ secretName: 1_199, notDocument: 3 });
  });
});
