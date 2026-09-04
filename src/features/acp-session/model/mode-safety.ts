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
 * Requires the bare minimum for the verdict. So the caller's wider type (`AcpChoice`) can go in and
 * come back out unchanged.
 */
export interface AcpModeChoice {
  id: string;
  /**
   * The adapter's own `_meta.kind` for this mode, or null/absent when it states none.
   *
   * ⚠️ **This is the second axis, and it outranks the id** (2026-09-05). The id was the only thing
   * to go on until the adapters started declaring what class a mode belongs to; now they say it
   * outright, and the class travels on the kind rather than the name — `claude-agent-acp` calls its
   * self-approving mode `auto` while `codex-acp` calls the same class `agent`.
   */
  metaKind?: string | null;
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
   * all**. `Read-only` is safer for direct files but does not guard MCP writes, so mode
   * classification alone never makes Codex eligible for in-app chat (`runtime-gate.ts`).
   *
   * ⚠️ *"This adapter offers only two modes (`Read-only`, `Agent`)"* stood here until 2026-09-05 and
   * was never true. Read from the pinned distribution, `codex-acp` 1.6.2 builds **three**
   * (`read-only`, `agent`, `agent-full-access`), and 1.9.0 builds the same three while renaming them
   * (`Ask for approval`, `Approve for me`, `Full access`) and adding the kinds below.
   */
  'agent',

  /*
   * `auto` — claude's, and it is advertised to **every** session (`claude-agent-acp` 0.74.0
   * `buildAvailableModes()`, read 2026-09-05: *"Auto" / "Claude handles permission decisions"*).
   * The adapter's own source records that a mode-level auto-approval never reaches the ACP client as
   * `session/request_permission`, so Atlas would draw no card at all — the gate-removing class
   * exactly. It also carries `_meta.kind: "auto_review"`, so the rule below would catch it anyway;
   * the id is listed because a measured name belongs in the measured list.
   *
   * Its neighbour is worth knowing: `AUTO_MODE_FALLBACK = "acceptEdits"`. Selecting `auto` on a model
   * without `supportsAutoMode` silently moves the session to `acceptEdits` — already on this list —
   * and announces it only through a `current_mode_update` notification (`use-acp-session.ts`).
   */
  'auto',
]);

/**
 * Kinds **measured to remove the gate**, whatever the mode is called.
 *
 * Where they come from (read from the shipped distributions, 2026-09-05):
 * `claude-agent-acp` 0.74.0 `dist/session-mode.js` attaches `standard` / `plan` / `auto_review`
 * (`auto`) / `full_access` (`bypassPermissions`), and `codex-acp` 1.9.0 `dist/index.js` attaches
 * `standard` (`read-only`) / `auto_review` (`agent`) / `full_access` (`agent-full-access`).
 *
 * `auto_review` says the adapter approves in the person's place; `full_access` says it stops asking.
 * Either way the request never arrives and the screen has nothing to show, so **the kind is decisive
 * even when the id is on the safe list below** — a future `read-only` that reviews for you is not
 * read-only in the sense this screen promises.
 */
const GATE_REMOVING_KINDS = new Set(['auto_review', 'full_access']);

/** Modes measured not to widen direct adapter access inside an already guarded runtime. */
const VERIFIED_SAFE = new Set(['default', 'read-only', 'readonly', 'plan', 'ask']);

/**
 * Kinds measured to leave the gate standing. A mode whose kind is **not** here is unverified even
 * when its id is — the same stance as the ids, applied to the axis the adapters added.
 */
const VERIFIED_SAFE_KINDS = new Set(['standard', 'plan']);

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

/**
 * Re-runs the verdict for **one** mode id — the shape `current_mode_update` arrives in.
 *
 * ⚠️ The notification carries the id and nothing else: no name, no description, no `_meta`. So this
 * is the id-only half of `partitionModes`, and it answers the question the screen actually has when
 * the adapter moves a session by itself — *may this screen still say it asks first?* An id nobody
 * measured answers yes, the same as in the list: unknown is unverified, not forbidden.
 */
export function modeKeepsGate(modeId: string): boolean {
  return partitionModes([{ id: modeId }]).offered.length > 0;
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
    const kind = normalize(mode?.metaKind);
    if (GATE_REMOVING.has(key) || GATE_REMOVING_KINDS.has(kind)) continue;
    offered.push(mode);
    // A stated kind is judged too: an unmeasured one makes an otherwise measured id unverified.
    const measured = VERIFIED_SAFE.has(key) && (kind.length === 0 || VERIFIED_SAFE_KINDS.has(kind));
    if (!measured) unverified.push(mode.id);
  }
  return { offered, unverified, dropped };
}
