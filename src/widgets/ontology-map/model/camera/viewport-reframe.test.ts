import { describe, expect, it } from "vitest";

import { resolveViewportReframeMode } from "./viewport-reframe";

const overview = {
  userDriven: false,
  domeActive: false,
  focused: false,
  pairFocused: false,
  realmActive: false,
  spotlightActive: false,
};

describe("resolveViewportReframeMode", () => {
  it("preserves a camera the user explicitly panned or zoomed", () => {
    expect(resolveViewportReframeMode({ ...overview, userDriven: true })).toBe("preserve");
  });

  it("keeps pair-focus framing instead of replacing it with an unrelated overview", () => {
    expect(resolveViewportReframeMode({ ...overview, pairFocused: true })).toBe("preserve");
  });

  it("reframes the active 3D dome without resetting its orientation", () => {
    expect(resolveViewportReframeMode({ ...overview, domeActive: true })).toBe("dome-overview");
    expect(resolveViewportReframeMode({ ...overview, domeActive: true, focused: true })).toBe("dome-focus");
  });

  it("keeps a selected node above realm and spotlight framing", () => {
    expect(
      resolveViewportReframeMode({
        ...overview,
        focused: true,
        realmActive: true,
        spotlightActive: true,
      }),
    ).toBe("focus");
  });

  it("fits realm, spotlight, then overview in semantic priority order", () => {
    expect(
      resolveViewportReframeMode({ ...overview, realmActive: true, spotlightActive: true }),
    ).toBe("realm");
    expect(resolveViewportReframeMode({ ...overview, spotlightActive: true })).toBe("spotlight");
    expect(resolveViewportReframeMode(overview)).toBe("overview");
  });
});
