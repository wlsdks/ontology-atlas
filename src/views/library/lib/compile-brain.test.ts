import { describe, expect, it } from "vitest";

import {
  clearStoredCompileBrain,
  COMPILE_BRAIN_STORAGE_KEY,
  readStoredCompileBrain,
  resolveCompileBrain,
  writeStoredCompileBrain,
} from "./compile-brain";

/**
 * The table this file exists for is the one where the three facts disagree: a stored
 * answer naming a brain the machine no longer offers. Honouring it would run the wrong
 * brain; ignoring it silently would leave the preference pointing at nothing for the next
 * folder, and the next machine, through a synced profile.
 */

function storage(initial?: string): Storage {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(COMPILE_BRAIN_STORAGE_KEY, initial);
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

describe("resolveCompileBrain — both available", () => {
  it("runs the coding agent when nobody has chosen", () => {
    // The default, not a precedence: the agent opens formats the runner cannot, so an
    // unanswered folder gets the brain that finishes more of the job.
    expect(resolveCompileBrain({ agentAvailable: true, localAvailable: true, stored: null })).toEqual({
      brain: "agent",
      choosable: true,
      staleChoice: false,
    });
  });

  it("runs the stored choice, including the local one", () => {
    // The whole reason the picker exists: a sensitive folder is sent to the runner on this
    // machine deliberately, and a precedence rule would take that choice away.
    expect(resolveCompileBrain({ agentAvailable: true, localAvailable: true, stored: "local" })).toEqual({
      brain: "local",
      choosable: true,
      staleChoice: false,
    });
    expect(resolveCompileBrain({ agentAvailable: true, localAvailable: true, stored: "agent" })).toEqual({
      brain: "agent",
      choosable: true,
      staleChoice: false,
    });
  });
});

describe("resolveCompileBrain — one available", () => {
  it("runs the only one there and draws no picker", () => {
    expect(resolveCompileBrain({ agentAvailable: true, localAvailable: false, stored: null })).toEqual({
      brain: "agent",
      choosable: false,
      staleChoice: false,
    });
    expect(resolveCompileBrain({ agentAvailable: false, localAvailable: true, stored: null })).toEqual({
      brain: "local",
      choosable: false,
      staleChoice: false,
    });
  });

  it("falls back and reports the stored choice stale when it names the missing one", () => {
    expect(resolveCompileBrain({ agentAvailable: true, localAvailable: false, stored: "local" })).toEqual({
      brain: "agent",
      choosable: false,
      staleChoice: true,
    });
    expect(resolveCompileBrain({ agentAvailable: false, localAvailable: true, stored: "agent" })).toEqual({
      brain: "local",
      choosable: false,
      staleChoice: true,
    });
  });

  it("leaves a stored choice alone when it names the one that is there", () => {
    expect(
      resolveCompileBrain({ agentAvailable: true, localAvailable: false, stored: "agent" }).staleChoice,
    ).toBe(false);
    expect(
      resolveCompileBrain({ agentAvailable: false, localAvailable: true, stored: "local" }).staleChoice,
    ).toBe(false);
  });
});

describe("resolveCompileBrain — neither available", () => {
  it("names no brain and clears whatever was stored", () => {
    expect(resolveCompileBrain({ agentAvailable: false, localAvailable: false, stored: null })).toEqual({
      brain: null,
      choosable: false,
      staleChoice: false,
    });
    expect(resolveCompileBrain({ agentAvailable: false, localAvailable: false, stored: "agent" })).toEqual({
      brain: null,
      choosable: false,
      staleChoice: true,
    });
  });
});

describe("the stored value", () => {
  it("round-trips both brains", () => {
    const store = storage();
    writeStoredCompileBrain(store, "local");
    expect(readStoredCompileBrain(store)).toBe("local");
    writeStoredCompileBrain(store, "agent");
    expect(readStoredCompileBrain(store)).toBe("agent");
    clearStoredCompileBrain(store);
    expect(readStoredCompileBrain(store)).toBeNull();
  });

  it("reads anything else as no choice at all", () => {
    // A hand-edited or older value must not resolve to a brain by accident.
    expect(readStoredCompileBrain(storage("claude"))).toBeNull();
    expect(readStoredCompileBrain(storage(""))).toBeNull();
  });

  it("survives storage that refuses to answer", () => {
    const blocked = {
      getItem: () => {
        throw new Error("site data blocked");
      },
      setItem: () => {
        throw new Error("site data blocked");
      },
      removeItem: () => {
        throw new Error("site data blocked");
      },
    } as unknown as Storage;
    expect(readStoredCompileBrain(blocked)).toBeNull();
    expect(() => writeStoredCompileBrain(blocked, "local")).not.toThrow();
    expect(() => clearStoredCompileBrain(blocked)).not.toThrow();
  });
});
