import { describe, expect, it } from "vitest";
import { pickLastEditSubject } from "./last-edit-subject";

describe("pickLastEditSubject", () => {
  it("returns null when no candidate has evidence", () => {
    expect(
      pickLastEditSubject([
        { kind: "agent", atMs: null },
        { kind: "human", atMs: null },
      ]),
    ).toBeNull();
  });

  it("returns the only candidate with evidence", () => {
    expect(
      pickLastEditSubject([
        { kind: "agent", atMs: 100 },
        { kind: "human", atMs: null },
      ]),
    ).toEqual({ kind: "agent", atMs: 100 });
  });

  it("picks the most recent of two real candidates — human newer", () => {
    expect(
      pickLastEditSubject([
        { kind: "agent", atMs: 100 },
        { kind: "human", atMs: 200 },
      ]),
    ).toEqual({ kind: "human", atMs: 200 });
  });

  it("picks the most recent of two real candidates — agent newer", () => {
    expect(
      pickLastEditSubject([
        { kind: "agent", atMs: 300 },
        { kind: "human", atMs: 200 },
      ]),
    ).toEqual({ kind: "agent", atMs: 300 });
  });

  it("ignores non-finite atMs values (defensive — never fabricate)", () => {
    expect(
      pickLastEditSubject([
        { kind: "agent", atMs: Number.NaN },
        { kind: "human", atMs: null },
      ]),
    ).toBeNull();
  });
});
