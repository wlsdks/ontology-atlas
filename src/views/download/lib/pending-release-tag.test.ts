import { describe, expect, it } from "vitest";
import { resolveDisplayReleaseTag } from "./pending-release-tag";

describe("display release tag: the generated file speaks only for a published release", () => {
  it("shows the tag that actually shipped once published", () => {
    expect(
      resolveDisplayReleaseTag({
        published: true,
        publishedTag: "v1.0.0-rc.2",
        releaseVersion: "1.0.0-rc.3",
      }),
    ).toBe("v1.0.0-rc.2");
  });

  it("shows the repository's current version while unpublished", () => {
    expect(
      resolveDisplayReleaseTag({
        published: false,
        publishedTag: "v1.0.0-rc.2",
        releaseVersion: "1.0.0-rc.3",
      }),
    ).toBe("v1.0.0-rc.3");
  });

  it("gives the title and body the same unpublished value", () => {
    const args = { published: false, publishedTag: "v0.0.0", releaseVersion: "1.2.3" } as const;
    expect(resolveDisplayReleaseTag(args)).toBe(resolveDisplayReleaseTag(args));
    expect(resolveDisplayReleaseTag(args)).toBe("v1.2.3");
  });
});
