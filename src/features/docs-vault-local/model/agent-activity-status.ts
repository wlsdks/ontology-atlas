export const AGENT_ACTIVITY_RELATIVE_PATH = ".ontology-atlas/agent-activity.json";

export const AGENT_ACTIVITY_STALE_AFTER_MS = 5 * 60 * 1000;

export type AgentActivityState =
  | "planning"
  | "editing"
  | "verifying"
  | "blocked"
  | "complete";

export interface AgentActivityFocus {
  summary: string | null;
  ontologySlug: string | null;
  files: string[];
}

export interface AgentActivityHeartbeat {
  agent: string;
  state: AgentActivityState;
  focus: AgentActivityFocus;
  plan: string[];
  evidence: {
    mcp: string[];
    codegraph: string[];
    verification: string[];
  };
  updatedAt: string;
}

export type AgentActivityReviewMode = "none" | "ontology-focus" | "business-extraction";

export interface AgentActivityStatus {
  sourcePath: typeof AGENT_ACTIVITY_RELATIVE_PATH;
  exists: boolean;
  valid: boolean;
  stale: boolean;
  ageMs: number | null;
  heartbeat: AgentActivityHeartbeat | null;
  reviewMode: AgentActivityReviewMode;
  errorMessage: string | null;
}

const VALID_STATES: ReadonlySet<string> = new Set([
  "planning",
  "editing",
  "verifying",
  "blocked",
  "complete",
]);

export function emptyAgentActivityStatus(): AgentActivityStatus {
  return {
    sourcePath: AGENT_ACTIVITY_RELATIVE_PATH,
    exists: false,
    valid: false,
    stale: false,
    ageMs: null,
    heartbeat: null,
    reviewMode: "none",
    errorMessage: null,
  };
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value.trim() || null : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readStringArrayRecord(
  value: unknown,
  key: "mcp" | "codegraph" | "verification",
): string[] {
  if (!value || typeof value !== "object") return [];
  return stringArray((value as Record<string, unknown>)[key]);
}

export function parseAgentActivityStatus(
  raw: string | null,
  now = Date.now(),
): AgentActivityStatus {
  if (raw === null) return emptyAgentActivityStatus();

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const agent = stringOrNull(parsed.agent);
    const state = stringOrNull(parsed.state);
    const updatedAt = stringOrNull(parsed.updatedAt);
    if (!agent) throw new Error("agent is required");
    if (!state || !VALID_STATES.has(state)) throw new Error("state is invalid");
    if (!updatedAt) throw new Error("updatedAt is required");

    const updatedAtMs = Date.parse(updatedAt);
    if (!Number.isFinite(updatedAtMs)) throw new Error("updatedAt is invalid");

    const focus =
      parsed.focus && typeof parsed.focus === "object"
        ? (parsed.focus as Record<string, unknown>)
        : {};
    const heartbeat: AgentActivityHeartbeat = {
      agent,
      state: state as AgentActivityState,
      focus: {
        summary: stringOrNull(focus.summary),
        ontologySlug: stringOrNull(focus.ontologySlug),
        files: stringArray(focus.files),
      },
      plan: stringArray(parsed.plan),
      evidence: {
        mcp: readStringArrayRecord(parsed.evidence, "mcp"),
        codegraph: readStringArrayRecord(parsed.evidence, "codegraph"),
        verification: readStringArrayRecord(parsed.evidence, "verification"),
      },
      updatedAt,
    };
    const ageMs = Math.max(0, now - updatedAtMs);
    const reviewMode = heartbeat.focus.ontologySlug
      ? "ontology-focus"
      : heartbeat.focus.files.length > 0
        ? "business-extraction"
        : "none";
    return {
      sourcePath: AGENT_ACTIVITY_RELATIVE_PATH,
      exists: true,
      valid: true,
      stale: ageMs > AGENT_ACTIVITY_STALE_AFTER_MS,
      ageMs,
      heartbeat,
      reviewMode,
      errorMessage: null,
    };
  } catch (error) {
    return {
      sourcePath: AGENT_ACTIVITY_RELATIVE_PATH,
      exists: true,
      valid: false,
      stale: false,
      ageMs: null,
      heartbeat: null,
      reviewMode: "none",
      errorMessage: error instanceof Error ? error.message : "invalid activity heartbeat",
    };
  }
}
