/**
 * The safety verdict for the "working mode" list — **it separates the known from the unknown.**
 *
 * Why (2026-08-17). The old verdict was a one-line denylist:
 *
 * ```
 * modes.filter((m) => !GATE_REMOVING_MODES.has(m.id))
 * ```
 *
 * It hides only what is written down. So **when the adapter adds a new mode it becomes visible and
 * selectable without our knowing.** If that mode removes the permission gate, one choice undoes this
 * screen's promise and the screen says nothing. **A safety device that treats what it does not know
 * as safe is not a device.**
 *
 * It is an immediate problem too: the adapter versions are being bumped
 * (`claude-agent-acp` 0.68→0.69, `codex-acp` 1.3→1.4) and our gate measurements were taken on the
 * **old versions**.
 *
 * **Three categories:**
 *
 * - **Measured to remove the gate** → never shown (as before).
 * - **Measured to be fine** → shown normally.
 * - **Not yet measured** → shown, but **stated as unknown.** It is not hidden because blocking a
 *   perfectly good new mode is a lie too. The permission card already uses the same discipline
 *   (say unknown when unknown, and recommend the safe side).
 */

/**
 * Requires the bare minimum for the verdict — it discriminates on `id` alone. So the caller's wider
 * type (`AcpChoice`) can go in and come back out unchanged.
 */
export interface AcpModeChoice {
  id: string;
}

/**
 * Modes **measured to remove the gate**. The dividing line is not "is it strict" but **"does it let
 * things through without asking"** — a mode that closes with a rejection (`dontAsk`) fails toward
 * safety and is therefore not here.
 */
const GATE_REMOVING = new Set([
  'bypasspermissions',
  'acceptedits',
  'agent-full-access',
  /*
   * `agent` belongs here. By name it sounds like "the normal mode", but the measurement
   * (2026-08-16) is recorded in `src-tauri/src/acp.rs`: launching codex on its default (`agent`)
   * gave *"files written outside the working folder with zero permission requests"*.
   *
   * **Re-measured 2026-08-17 — unchanged on `codex-acp` 1.4.** This closes the worry the block above
   * left open ("our gate measurements were taken on the old versions"). In the installed app this
   * line was briefly removed, a session opened on `agent`, and it was asked to *"write hello to
   * /tmp/atlas-gate-probe.txt"* — the file appeared (contents `hello`) with **no permission card at
   * all**. This adapter offers only two modes (`Read-only`, `Agent`), so the consequence is that
   * **codex only reads in this app** — an uncomfortable conclusion, but better than offering
   * ungated writes by default.
   */
  'agent',
]);

/** Modes **measured to keep the gate**. Not on this list means "unknown". */
const VERIFIED_SAFE = new Set(['default', 'read-only', 'readonly', 'plan', 'ask']);

const normalize = (id: unknown): string =>
  typeof id === 'string' ? id.trim().toLowerCase() : '';

export interface ModePartition<T extends AcpModeChoice = AcpModeChoice> {
  /** What is offered to the screen — the measured and the unmeasured together. */
  offered: T[];
  /** The ids among them that are **not yet measured**. The screen must state this fact. */
  unverified: string[];
  /** Entries dropped for a malformed shape — counted so they do not disappear silently. */
  dropped: number;
}

export function partitionModes<T extends AcpModeChoice>(
  modes: readonly T[],
): ModePartition<T> {
  const offered: T[] = [];
  const unverified: string[] = [];
  let dropped = 0;
  for (const mode of Array.isArray(modes) ? modes : []) {
    const key = normalize(mode?.id);
    if (key.length === 0) {
      dropped += 1;
      continue;
    }
    if (GATE_REMOVING.has(key)) continue;
    offered.push(mode);
    if (!VERIFIED_SAFE.has(key)) unverified.push(mode.id);
  }
  return { offered, unverified, dropped };
}
