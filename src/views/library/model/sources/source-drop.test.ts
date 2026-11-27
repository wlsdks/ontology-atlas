import { describe, expect, it } from "vitest";

import { requestFromNativeOffer } from "./source-drop";

describe("a drop becomes a copy request", () => {
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
