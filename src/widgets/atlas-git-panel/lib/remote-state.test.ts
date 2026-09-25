import { describe, expect, it } from "vitest";

import { describeRemoteState } from "./remote-state";

describe("describeRemoteState", () => {
  it("an upstream means the branch is tracked, whatever else is known", () => {
    expect(describeRemoteState({ upstream: "origin/main", hasOrigin: true, detached: false })).toBe("tracking");
  });

  it("no upstream and no origin: the one state where connecting a remote is the next step", () => {
    expect(describeRemoteState({ upstream: null, hasOrigin: false, detached: false })).toBe("no-remote");
  });

  it("no upstream but origin exists: the branch was never sent there", () => {
    expect(describeRemoteState({ upstream: null, hasOrigin: true, detached: false })).toBe("never-sent");
  });

  it("a detached HEAD wins over whether origin exists: there is no branch to send", () => {
    expect(describeRemoteState({ upstream: null, hasOrigin: true, detached: true })).toBe("detached");
    expect(describeRemoteState({ upstream: null, hasOrigin: false, detached: true })).toBe("detached");
  });

  it("an older bridge that does not report origin is unknown, never 'no remote'", () => {
    expect(describeRemoteState({ upstream: null })).toBe("unknown");
    expect(describeRemoteState(null)).toBe("unknown");
  });
});
