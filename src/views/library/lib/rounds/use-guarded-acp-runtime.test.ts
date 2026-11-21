import { describe, expect, it } from "vitest";

import { pickGuardedRuntime } from "./use-guarded-acp-runtime";

const runtime = (id: string, over: Record<string, unknown> = {}) => ({ id, label: id.toUpperCase(), state: "ready", verified: true, isolated: true, ...over });

describe("pickGuardedRuntime", () => {
  it("takes the first runtime that is ready, verified and guarded", () => {
    const detected = [
      runtime("a", { state: "login-unknown" }),
      runtime("b", { verified: false }),
      runtime("c", { isolated: false }),
      runtime("d"),
      runtime("e"),
    ] as never;
    expect(pickGuardedRuntime(detected)).toEqual({ id: "d", label: "D" });
  });

  it("picks nothing when no runtime qualifies or the scan found none", () => {
    expect(pickGuardedRuntime([runtime("a", { state: "missing" })] as never)).toBeNull();
    expect(pickGuardedRuntime(null as never)).toBeNull();
  });
});
