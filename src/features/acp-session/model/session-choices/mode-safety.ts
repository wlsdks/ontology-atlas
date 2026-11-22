/** Separates known from unknown working modes: gate-removing modes and local permission profiles are hidden; other unknown modes are labelled. */

export interface AcpModeChoice {
  id: string;
  /** The adapter's `_meta.kind`; it outranks the id because the class travels on the kind, not the name. */
  metaKind?: string | null;
}

/** Measured to remove the gate. The line is "does it let things through without asking", not "is it strict": a mode that closes with a rejection (`dontAsk`) fails toward safety and is not here. */
const GATE_REMOVING = new Set([
  'bypasspermissions',
  'acceptedits',
  'agent-full-access',
  // Codex's workspace sandbox permits in-folder edits without an approval request.
  'workspace-write',
  // `agent` sounds normal, but codex launched on it wrote outside the folder with no permission card. `Read-only` does not
  // guard MCP writes, so mode alone never makes Codex eligible for in-app chat (`runtime-gate.ts`).
  'agent',

  // `auto` is advertised to every claude session and its auto-approval never reaches the client as
  // `session/request_permission`; `AUTO_MODE_FALLBACK = "acceptEdits"` moves the session silently.
  'auto',
]);

/** Remove the gate whatever the mode is called: `auto_review` approves for the person and `full_access` stops asking, so the request never arrives. */
const GATE_REMOVING_KINDS = new Set(['auto_review', 'full_access']);

const VERIFIED_SAFE = new Set(['default', 'read-only', 'readonly', 'plan', 'ask']);

/** A mode whose kind is not here is unverified even when its id is measured. */
const VERIFIED_SAFE_KINDS = new Set(['standard', 'plan']);

const normalize = (id: unknown): string =>
  typeof id === 'string' ? id.trim().toLowerCase() : '';

export function isPermissionProfileMode(modeId: string): boolean {
  return normalize(modeId).startsWith('permission-profile:');
}

export interface ModePartition<T extends AcpModeChoice = AcpModeChoice> {
  offered: T[];
  /** The ids among them that are not yet measured; the screen must state this. */
  unverified: string[];
  dropped: number;
}

/** For `current_mode_update`, which carries an id only; an unmeasured id keeps the gate, as in the list. */
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
    if (isPermissionProfileMode(key) || GATE_REMOVING.has(key) || GATE_REMOVING_KINDS.has(kind)) continue;
    offered.push(mode);
    // A stated kind is judged too: an unmeasured one makes an otherwise measured id unverified.
    const measured = VERIFIED_SAFE.has(key) && (kind.length === 0 || VERIFIED_SAFE_KINDS.has(kind));
    if (!measured) unverified.push(mode.id);
  }
  return { offered, unverified, dropped };
}
