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

export interface AgentActivityReviewTarget {
  kind: "none" | "ontology" | "source";
  ontologySlug: string | null;
  files: string[];
  label: string;
}

export interface AgentActivityProofSummary {
  count: number;
  sources: {
    mcp: number;
    codegraph: number;
    verification: number;
  };
  label: string;
}

export interface AgentActivityRefreshRequest {
  required: boolean;
  reason: "stale" | null;
  previousAgent: string | null;
  previousState: AgentActivityState | null;
  previousFocus: string | null;
  previousOntologySlug: string | null;
  previousFiles: string[];
  previousAgeMs: number | null;
  command: string | null;
  message: string | null;
}

export interface AgentActivityStatus {
  sourcePath: typeof AGENT_ACTIVITY_RELATIVE_PATH;
  exists: boolean;
  valid: boolean;
  stale: boolean;
  ageMs: number | null;
  heartbeat: AgentActivityHeartbeat | null;
  reviewMode: AgentActivityReviewMode;
  reviewTarget: AgentActivityReviewTarget;
  proof: AgentActivityProofSummary;
  refreshRequest: AgentActivityRefreshRequest;
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
    reviewTarget: emptyReviewTarget(),
    proof: emptyProofSummary(),
    refreshRequest: emptyRefreshRequest(null),
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
    const reviewTarget = deriveReviewTarget(heartbeat.focus);
    const proof = deriveProofSummary(heartbeat.evidence);
    return {
      sourcePath: AGENT_ACTIVITY_RELATIVE_PATH,
      exists: true,
      valid: true,
      stale: ageMs > AGENT_ACTIVITY_STALE_AFTER_MS,
      ageMs,
      heartbeat,
      reviewMode,
      reviewTarget,
      proof,
      refreshRequest: deriveRefreshRequest({
        ageMs,
        heartbeat,
        stale: ageMs > AGENT_ACTIVITY_STALE_AFTER_MS,
      }),
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
      reviewTarget: emptyReviewTarget(),
      proof: emptyProofSummary(),
      refreshRequest: emptyRefreshRequest(null),
      errorMessage: error instanceof Error ? error.message : "invalid activity heartbeat",
    };
  }
}

function emptyReviewTarget(): AgentActivityReviewTarget {
  return {
    kind: "none",
    ontologySlug: null,
    files: [],
    label: "none",
  };
}

function deriveReviewTarget(focus: AgentActivityFocus): AgentActivityReviewTarget {
  if (focus.ontologySlug) {
    return {
      kind: "ontology",
      ontologySlug: focus.ontologySlug,
      files: focus.files,
      label: `ontology · ${focus.ontologySlug}`,
    };
  }
  if (focus.files.length > 0) {
    const suffix =
      focus.files.length === 1 ? focus.files[0] : `${focus.files[0]} +${focus.files.length - 1}`;
    return {
      kind: "source",
      ontologySlug: null,
      files: focus.files,
      label: `source · ${suffix}`,
    };
  }
  return emptyReviewTarget();
}

function emptyProofSummary(): AgentActivityProofSummary {
  return {
    count: 0,
    sources: {
      mcp: 0,
      codegraph: 0,
      verification: 0,
    },
    label: "",
  };
}

function deriveProofSummary(evidence: AgentActivityHeartbeat["evidence"]): AgentActivityProofSummary {
  const sources = {
    mcp: evidence.mcp.length,
    codegraph: evidence.codegraph.length,
    verification: evidence.verification.length,
  };
  const labelParts = [
    ["MCP", sources.mcp],
    ["CodeGraph", sources.codegraph],
    ["Verify", sources.verification],
  ] as const;
  const visibleLabelParts = labelParts.filter(([, count]) => count > 0);
  return {
    count: sources.mcp + sources.codegraph + sources.verification,
    sources,
    label: visibleLabelParts.map(([label, count]) => `${label} · ${count}`).join(", "),
  };
}

function emptyRefreshRequest(previousAgeMs: number | null): AgentActivityRefreshRequest {
  return {
    required: false,
    reason: null,
    previousAgent: null,
    previousState: null,
    previousFocus: null,
    previousOntologySlug: null,
    previousFiles: [],
    previousAgeMs,
    command: null,
    message: null,
  };
}

function deriveRefreshRequest({
  ageMs,
  heartbeat,
  stale,
}: {
  ageMs: number;
  heartbeat: AgentActivityHeartbeat;
  stale: boolean;
}): AgentActivityRefreshRequest {
  if (!stale) return emptyRefreshRequest(ageMs);

  return {
    required: true,
    reason: "stale",
    previousAgent: heartbeat.agent,
    previousState: heartbeat.state,
    previousFocus: heartbeat.focus.summary,
    previousOntologySlug: heartbeat.focus.ontologySlug,
    previousFiles: heartbeat.focus.files,
    previousAgeMs: ageMs,
    command: formatRefreshCommand(heartbeat),
    message:
      "Do not treat the stale focus as current work until the refreshed heartbeat appears. Run the command, then `ontology-atlas agent-activity <vault> --show --json` and confirm stale: false.",
  };
}

function formatRefreshCommand(heartbeat: AgentActivityHeartbeat): string {
  const evidenceArgs = [
    heartbeat.evidence.mcp[0] ? ["--mcp", heartbeat.evidence.mcp[0]] : null,
    heartbeat.evidence.codegraph[0] ? ["--codegraph", heartbeat.evidence.codegraph[0]] : null,
    heartbeat.evidence.verification[0] ? ["--verify", heartbeat.evidence.verification[0]] : null,
  ]
    .filter((entry): entry is [string, string] => entry !== null)
    .flatMap(([flag, value]) => [flag, shellArg(value)]);

  return [
    "ontology-atlas agent-activity <vault>",
    "--agent",
    shellArg(heartbeat.agent),
    "--state planning",
    "--focus",
    shellArg(heartbeat.focus.summary ?? "Refresh live ontology focus"),
    ...(heartbeat.focus.ontologySlug
      ? ["--ontology-slug", shellArg(heartbeat.focus.ontologySlug)]
      : []),
    ...heartbeat.focus.files.flatMap((file) => ["--file", shellArg(file)]),
    ...evidenceArgs,
    "--json",
  ].join(" ");
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
