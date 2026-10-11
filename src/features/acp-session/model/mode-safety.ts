/**
 * The safety decision for the working-mode list separates the known from the unknown.
 * Measured to remove the gate: never shown. Measured fine: shown. Not yet measured: shown,
 * stated as unknown.
 */

export interface AcpModeChoice {
  id: string;
  /**
   * The adapter's own `_meta.kind`, or null when none; it outranks the id because the class
   * travels on the kind, not the name.
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
  // Codex's workspace sandbox permits in-folder edits without an approval request.
  'workspace-write',
  /*
   * `agent` belongs here: by name it sounds normal, but launching codex on it wrote outside
   * the folder with no permission card (`docs/DECISIONS.md`). `Read-only` does not guard MCP
   * writes, so mode alone never makes Codex eligible for in-app chat (`runtime-gate.ts`).
   */
  'agent',

  /*
   * `auto` is advertised to every claude session and its auto-approval never reaches the ACP
   * client as `session/request_permission`. `AUTO_MODE_FALLBACK = "acceptEdits"` moves the
   * session silently.
   */
  'auto',
]);

/**
 * Kinds that remove the gate, whatever the mode is called: `auto_review` approves for the
 * person and `full_access` stops asking, so the request never arrives. The kind is decisive
 * even for a safe id.
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
 * Re-runs the decision for one mode id, the shape `current_mode_update` arrives in (id only,
 * no `_meta`). An unmeasured id keeps the gate, the same as in the list.
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
