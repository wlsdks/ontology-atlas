/** A bounded activity trace; targets come only from structured tool input, never model prose. */

type LibraryWorkEventKind = "read" | "proposal" | "waiting" | "write" | "error";
type LibraryWorkEventPhase = "active" | "complete";

export interface LibraryWorkTarget {
  kind: "source" | "wiki";
  /** Vault-relative address: `sources/<file>` or `wiki/<slug>` (without `.md`). */
  ref: string;
}

export interface LibraryWorkEvent {
  id: string;
  /** The in-flight operation this event belongs to; terminal receipts only end this exact work. */
  workId?: string;
  kind: LibraryWorkEventKind;
  phase: LibraryWorkEventPhase;
  target: LibraryWorkTarget | null;
  /** `Date.now()` when Atlas observed this event. */
  at: number;
}

export interface LibraryWorkActivity {
  /** True only while `current` names an actual in-flight tool or permission wait. */
  isActive: boolean;
  current: LibraryWorkEvent | null;
  /** Completed receipts, newest first, capped so an idle graph remains still. */
  recent: readonly LibraryWorkEvent[];
}

export function showLibraryWorkStrip(activity: LibraryWorkActivity, questionDeskVisible: boolean): boolean {
  if (!questionDeskVisible) return true;
  if (activity.isActive || activity.current !== null) return true;
  return activity.recent[0]?.kind === 'waiting' || activity.recent[0]?.kind === 'error';
}

export interface LibraryAcpToolSnapshot {
  id: string;
  toolKind: string | null;
  status: string;
  rawInput: unknown;
  pendingPermission: boolean;
}

export interface LibraryLocalToolSnapshot {
  id: string;
  name: string;
  args: unknown;
  phase: LibraryWorkEventPhase;
  outcome: "ok" | "error" | "blocked-write" | "unknown-tool" | "args-invalid" | null;
}

export const LIBRARY_WORK_EVENT_LIMIT = 8;

export const EMPTY_LIBRARY_WORK_ACTIVITY: LibraryWorkActivity = {
  isActive: false,
  current: null,
  recent: [],
};

const PATH_KEYS = ["filePath", "file_path", "path", "targetPath"] as const;

function relativePath(value: string, vaultRoot: string | null): string | null {
  const trimmed = value.trim().replaceAll("\\", "/");
  if (!trimmed) return null;
  const root = vaultRoot?.replace(/\/+$/, "") ?? null;
  const relative = root && trimmed.startsWith(`${root}/`) ? trimmed.slice(root.length + 1) : trimmed;
  if (relative.startsWith("/") || relative.split("/").some((part) => part === ".." || part === "")) return null;
  if (relative.startsWith("sources/")) return relative;
  if (relative.startsWith("wiki/") && relative.endsWith(".md")) return relative.slice(0, -3);
  if (relative.startsWith("wiki/") && !relative.includes(".")) return relative;
  return null;
}

function targetFromPath(value: string, vaultRoot: string | null): LibraryWorkTarget | null {
  const relative = relativePath(value, vaultRoot);
  if (!relative) return null;
  return relative.startsWith("sources/")
    ? { kind: "source", ref: relative }
    : { kind: "wiki", ref: relative };
}

/** Resolves only a path-shaped value supplied in a real tool call. */
export function libraryWorkTargetFromToolInput(
  rawInput: unknown,
  vaultRoot: string | null,
): LibraryWorkTarget | null {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) return null;
  const envelope = rawInput as Record<string, unknown>;
  // ACP MCP calls use the parser's structured server/tool/arguments envelope.
  // Never search nested document text or arbitrary output for a path.
  const input = typeof envelope.server === "string" && typeof envelope.tool === "string"
    && envelope.arguments && typeof envelope.arguments === "object" && !Array.isArray(envelope.arguments)
    ? envelope.arguments as Record<string, unknown> : envelope;
  for (const key of PATH_KEYS) {
    const value = input[key];
    if (typeof value !== "string") continue;
    const target = targetFromPath(value, vaultRoot);
    if (target) return target;
  }
  return null;
}

/** Local wiki tools have a structured slug rather than a file-path argument. */
function targetFromProposalInput(rawInput: unknown): LibraryWorkTarget | null {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) return null;
  const slug = (rawInput as Record<string, unknown>).slug;
  if (typeof slug !== "string") return null;
  const value = slug.trim();
  if (!value) return null;
  if (value.startsWith("wiki/")) {
    const clean = value.replace(/\.md$/, "");
    if (clean.startsWith("wiki/_")) return null;
    return targetFromPath(clean, null);
  }
  // Bare local Wiki slugs are names, not paths. Keep the extension and traversal
  // boundaries explicit while allowing the nested wiki form above.
  if (value.endsWith(".md") || value.includes("/") || value.includes("\\") || value === "." || value === "..") {
    return null;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 80) return null;
  return { kind: "wiki", ref: `wiki/${value}` };
}

/**
 * An ACP snapshot is active work only. `write` is deliberately a proposal until a folder
 * delta proves the write landed; an unknown tool kind makes no visual claim.
 */
export function libraryWorkEventFromAcpSnapshot(
  snapshot: LibraryAcpToolSnapshot,
  vaultRoot: string | null,
  at: number,
): LibraryWorkEvent | null {
  if (["completed", "failed", "cancelled"].includes(snapshot.status)) return null;
  const toolKind = snapshot.toolKind?.trim().toLowerCase() ?? "";
  const writing = toolKind === "write" || toolKind === "edit";
  const workId = `acp:${snapshot.id}`;
  if (snapshot.pendingPermission && writing) {
    return {
      id: `acp:${snapshot.id}:waiting`,
      workId,
      kind: "waiting",
      phase: "active",
      target: libraryWorkTargetFromToolInput(snapshot.rawInput, vaultRoot),
      at,
    };
  }
  if (toolKind !== "read" && !writing) return null;
  return {
    id: `acp:${snapshot.id}:${toolKind === "read" ? "read" : "write"}`,
    workId,
    kind: toolKind === "read" ? "read" : "proposal",
    phase: "active",
    target: libraryWorkTargetFromToolInput(snapshot.rawInput, vaultRoot),
    at,
  };
}

/** A local executor identifies the three tools this route exposes by exact name. */
export function libraryWorkEventFromLocalSnapshot(
  snapshot: LibraryLocalToolSnapshot,
  vaultRoot: string | null,
  at: number,
): LibraryWorkEvent | null {
  const kind = snapshot.name === "read_source_text" || snapshot.name === "read_wiki_page"
    ? "read"
    : snapshot.name === "propose_wiki_page"
      ? "proposal"
      : null;
  if (!kind) return null;
  const target = kind === "proposal" || snapshot.name === "read_wiki_page"
    ? targetFromProposalInput(snapshot.args)
    : libraryWorkTargetFromToolInput(snapshot.args, vaultRoot);
  if (snapshot.phase === "complete" && snapshot.outcome !== "ok") {
    return { id: `local:${snapshot.id}:error`, workId: `local:${snapshot.id}`, kind: "error", phase: "complete", target: null, at };
  }
  return {
    id: `local:${snapshot.id}:${snapshot.phase}`,
    workId: `local:${snapshot.id}`,
    kind,
    phase: snapshot.phase,
    target,
    at,
  };
}

/** Only a source read that ACP reports complete becomes a receipt. */
export function completedAcpReadEvent(
  event: { id: string; kind: string; toolKind?: string; status?: string; rawInput?: unknown },
  vaultRoot: string | null,
  at: number,
): LibraryWorkEvent | null {
  if (event.kind !== "tool" || event.toolKind?.trim().toLowerCase() !== "read" || event.status !== "completed") {
    return null;
  }
  return {
    id: `acp:${event.id}:read-complete`,
    workId: `acp:${event.id}`,
    kind: "read",
    phase: "complete",
    target: libraryWorkTargetFromToolInput(event.rawInput, vaultRoot),
    at,
  };
}

/** A changed page revision is the ACP route's observed write receipt, without attributing its author. */
export function observedWikiWriteEvents(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
  at: number,
): LibraryWorkEvent[] {
  const events: LibraryWorkEvent[] = [];
  for (const [slug, mtime] of after) {
    if (
      !slug.startsWith("wiki/") ||
      slug.startsWith("wiki/_") ||
      before.get(slug) === mtime
    ) continue;
    events.push({
      id: `wiki:${slug}:${mtime}:write`,
      workId: `wiki:${slug}:${mtime}`,
      kind: "write",
      phase: "complete",
      target: { kind: "wiki", ref: slug },
      at,
    });
  }
  return events;
}

/** Successful local applier paths are already the write port's confirmed result. */
export function successfulLocalWriteEvents(
  paths: readonly string[],
  receiptId: string,
  at: number,
): LibraryWorkEvent[] {
  return paths
    .map((path) => targetFromPath(path, null))
    .filter((target): target is LibraryWorkTarget => target?.kind === "wiki")
    .map((target) => ({
      id: `local:${receiptId}:${target.ref}:write`,
      workId: `local:${receiptId}`,
      kind: "write" as const,
      phase: "complete" as const,
      target,
      at,
    }));
}

/** A local consent card is a real pause, even though its future page is still only a proposal. */
export function localCompileWaitingEvent(
  turnId: string,
  at: number,
  hasProposal: boolean,
  paths: readonly string[] = [],
): LibraryWorkEvent | null {
  if (!hasProposal) return null;
  return {
    id: `local:${turnId}:waiting`,
    workId: `local:${turnId}`,
    kind: "waiting",
    phase: "active",
    target: paths.length === 1 ? targetFromPath(paths[0], null) : null,
    at,
  };
}

/** A terminal route failure is a receipt, not a claim about a particular file. */
export function libraryWorkErrorEvent(id: string, at: number): LibraryWorkEvent {
  return { id, kind: "error", phase: "complete", target: null, at };
}

function sameLibraryWork(event: LibraryWorkEvent, current: LibraryWorkEvent | null): boolean {
  if (!current) return false;
  return event.workId !== undefined && current.workId !== undefined
    ? event.workId === current.workId
    : event.id === current.id;
}

export function beginLibraryWork(
  activity: LibraryWorkActivity,
  event: LibraryWorkEvent | null,
): LibraryWorkActivity {
  if (!event || event.phase !== "active") return { ...activity, isActive: false, current: null };
  return { ...activity, isActive: true, current: event };
}

export function completeLibraryWork(
  activity: LibraryWorkActivity,
  event: LibraryWorkEvent | null,
): LibraryWorkActivity {
  if (!event || event.phase !== "complete") return activity;
  const appended = appendLibraryWorkReceipt(activity, event);
  if (!sameLibraryWork(event, activity.current)) return appended;
  return { ...appended, isActive: false, current: null };
}

/** Adds a truthful terminal receipt without disturbing another tool still in flight. */
export function appendLibraryWorkReceipt(
  activity: LibraryWorkActivity,
  event: LibraryWorkEvent | null,
): LibraryWorkActivity {
  if (!event || event.phase !== "complete") return activity;
  if (activity.recent.some((existing) => existing.id === event.id)) return activity;
  const recent = [event, ...activity.recent.filter((existing) => existing.id !== event.id)]
    .slice(0, LIBRARY_WORK_EVENT_LIMIT);
  return { ...activity, recent };
}

/** Clears a hanging active indicator without throwing away truthful, bounded receipts. */
export function clearLibraryWork(activity: LibraryWorkActivity): LibraryWorkActivity {
  return activity.isActive || activity.current ? { ...activity, isActive: false, current: null } : activity;
}
