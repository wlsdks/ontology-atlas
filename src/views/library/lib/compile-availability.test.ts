import { describe, expect, it } from "vitest";

import { libraryBrainLabel, libraryCompileBlockedReason } from "./compile-availability";
import type { LibraryLocalModel } from "./use-library-agent";

/**
 * Two surfaces ask "why can Compile not run" — the shelf's step two and a source with no
 * write-up — and the whole point of this module is that they cannot answer it differently.
 * What is pinned here is the **order**, because that is what a person can act on: a reason
 * they cannot change (this is a browser) must be reached before one they can, and "nothing
 * is waiting" must never stand in for "no writer exists".
 *
 * The catalogue key is the assertion. A message file owns the sentence, and pinning prose
 * here would be the pattern `.claude/rules/documentation.md` refuses.
 */

type Translator = Parameters<typeof libraryCompileBlockedReason>[1];

/** Returns the key it was asked for, so the test names a decision rather than a sentence. */
const t = ((key: string) => key) as unknown as Translator;

const LOCAL: LibraryLocalModel = {
  model: "llama3.1:8b",
  host: "localhost:11434",
  onThisComputer: true,
};

const READY = {
  route: "agent",
  inApp: true,
  sourceCount: 3,
  needsCompileCount: 2,
  localModel: null,
} as const;

describe("why Compile cannot run — one answer, in the order a person can act", () => {
  it("says nothing when a coding agent, a folder and waiting sources are all there", () => {
    expect(libraryCompileBlockedReason(READY, t)).toBeNull();
  });

  it("names the web limit first, because nothing else on that surface can be changed", () => {
    // Sources waiting and a runtime reported would both be reasons; neither is the one a
    // browser reader can act on.
    expect(libraryCompileBlockedReason({ ...READY, inApp: false }, t)).toBe("stage.blockedWeb");
  });

  it("does not guess while the runtime check is still running", () => {
    expect(libraryCompileBlockedReason({ ...READY, route: "checking" }, t)).toBe(
      "stage.blockedChecking",
    );
  });

  it("names the local model's own limit rather than reporting no writer at all", () => {
    expect(
      libraryCompileBlockedReason({ ...READY, route: "local", localModel: LOCAL }, t),
    ).toBe("stage.blockedLocal");
  });

  it("says no writer is set up when neither route resolved", () => {
    expect(libraryCompileBlockedReason({ ...READY, route: "unavailable" }, t)).toBe(
      "stage.blockedNoAgent",
    );
  });

  it("sends an empty folder to step one instead of to a missing agent", () => {
    expect(
      libraryCompileBlockedReason({ ...READY, sourceCount: 0, needsCompileCount: 0 }, t),
    ).toBe("stage.blockedNoSources");
  });

  it("distinguishes a finished folder from a blocked one", () => {
    expect(libraryCompileBlockedReason({ ...READY, needsCompileCount: 0 }, t)).toBe(
      "stage.blockedNothingWaiting",
    );
  });
});

describe("which brain the shelf names", () => {
  it("names the coding agent when that is what will run", () => {
    expect(libraryBrainLabel({ route: "agent", agentLabel: "Claude Agent", localModel: null }, t)).toBe(
      "stage.brainAgent",
    );
  });

  it("names the configured runner when no coding agent is there", () => {
    expect(libraryBrainLabel({ route: "local", agentLabel: null, localModel: LOCAL }, t)).toBe(
      "stage.brainLocal",
    );
  });

  /**
   * A verified coding agent outranks the runner because it is the only one of the two that
   * can finish Compile — naming the runner while the agent is what runs would be a label
   * pointing at the wrong machine.
   */
  it("keeps naming the coding agent even when a runner is also configured", () => {
    expect(
      libraryBrainLabel({ route: "agent", agentLabel: "Claude Agent", localModel: LOCAL }, t),
    ).toBe("stage.brainAgent");
  });

  it("says so plainly when nothing is set up", () => {
    expect(libraryBrainLabel({ route: "unavailable", agentLabel: null, localModel: null }, t)).toBe(
      "stage.brainNone",
    );
  });
});
