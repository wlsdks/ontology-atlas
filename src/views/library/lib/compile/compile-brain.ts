import { useCallback, useSyncExternalStore } from "react";

/**
 * Which brain Compile runs on when this computer has two: a default, not a precedence. Both
 * available draws one picker; the stored answer wins and the coding agent is the default. A stored
 * choice for a brain no longer offered falls back and stops being stored.
 */

export type CompileBrain = "agent" | "local";

/**
 * Per machine, beside the chat width and the local endpoint. `.claude/rules/surfaces.md`
 * splits storage three ways and a preference is the localStorage third: it is not a fact
 * about the folder (that would be a second canonical store), and it is not a secret.
 */
export const COMPILE_BRAIN_STORAGE_KEY = "ontology-atlas:compile-brain";

export interface CompileBrainInput {
  /** A verified coding agent, a folder path, and its MCP server are all ready. */
  agentAvailable: boolean;
  /** A connect-by-address runner is saved and the chat bridge exists. */
  localAvailable: boolean;
  /** What this machine last chose, or null when nobody has chosen. */
  stored: CompileBrain | null;
}

export interface CompileBrainResolution {
  /** What will actually run. Null when this computer offers neither. */
  brain: CompileBrain | null;
  /** True only when both are available — the one case that draws a picker. */
  choosable: boolean;
  /**
   * True when a stored answer names a brain this computer cannot offer right now.
   *
   * The caller clears it rather than quietly honouring it, so that a person who
   * uninstalled their coding agent is not left with a preference pointing at nothing.
   */
  staleChoice: boolean;
}

export function resolveCompileBrain({
  agentAvailable,
  localAvailable,
  stored,
}: CompileBrainInput): CompileBrainResolution {
  if (agentAvailable && localAvailable) {
    // The default is the coding agent: it opens the formats the runner cannot, so an
    // unanswered folder gets the brain that can finish more of the job.
    return { brain: stored ?? "agent", choosable: true, staleChoice: false };
  }
  if (agentAvailable) return { brain: "agent", choosable: false, staleChoice: stored === "local" };
  if (localAvailable) return { brain: "local", choosable: false, staleChoice: stored === "agent" };
  return { brain: null, choosable: false, staleChoice: stored !== null };
}

export function readStoredCompileBrain(storage: Storage): CompileBrain | null {
  try {
    const raw = storage.getItem(COMPILE_BRAIN_STORAGE_KEY);
    return raw === "agent" || raw === "local" ? raw : null;
  } catch {
    // A browser with site data blocked has no preference, which is a real answer.
    return null;
  }
}

export function writeStoredCompileBrain(storage: Storage, brain: CompileBrain): void {
  try {
    storage.setItem(COMPILE_BRAIN_STORAGE_KEY, brain);
  } catch {
    // Failing to remember is not failing to run.
  }
}

export function clearStoredCompileBrain(storage: Storage): void {
  try {
    storage.removeItem(COMPILE_BRAIN_STORAGE_KEY);
  } catch {
    // As above.
  }
}

/** Where a choice made on this screen is announced to the others reading it. */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another window of the same app changing the choice is the `storage` event.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function snapshot(): CompileBrain | null {
  return readStoredCompileBrain(window.localStorage);
}

/** The server has no storage; nobody has chosen there. */
function serverSnapshot(): CompileBrain | null {
  return null;
}

function announce(): void {
  for (const listener of listeners) listener();
}

/**
 * The stored choice as an external value.
 *
 * `useSyncExternalStore` for the same reason `use-chat-width.ts` gives: reading disk into
 * `setState` after mount paints the default first and then corrects itself, and it
 * disagrees with static export's first HTML.
 */
export function useCompileBrainChoice(): {
  stored: CompileBrain | null;
  choose: (brain: CompileBrain) => void;
  forget: () => void;
} {
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  const choose = useCallback((brain: CompileBrain) => {
    writeStoredCompileBrain(window.localStorage, brain);
    announce();
  }, []);

  const forget = useCallback(() => {
    clearStoredCompileBrain(window.localStorage);
    announce();
  }, []);

  return { stored, choose, forget };
}
