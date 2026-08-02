/**
 * Project source receipt — the versioned fact shared by the Topology inspector
 * and agent handoff. The private absolute root belongs to the local binding
 * envelope; it is deliberately absent from `ProjectSourceReceipt`.
 */

export const PROJECT_SOURCE_RECEIPT_VERSION = 1 as const;

export type ProjectSourceStatus =
  | "not_measured"
  | "needs_evidence"
  | "review_required"
  | "invalid"
  | "verified_current";

export type ProjectSourceCurrentness = "current" | "stale" | "unavailable";

export interface ProjectSourceProbe {
  sourceId: string;
  kind: "git" | "folder";
  revision: string;
  fingerprint: string;
  dirty: boolean | null;
  truncated: boolean;
  /** Canonical source-relative paths only. Never absolute paths. */
  files: readonly string[];
}

export interface ProjectSourceWitnessInput {
  id: string;
  nodeSlug: string;
  role: string;
  path: string;
}

export interface ProjectSourceWitness extends ProjectSourceWitnessInput {
  supported: boolean;
}

export interface ProjectSourceGap {
  id:
    | "source_unbound"
    | "multiple_active_sources"
    | "receipt_missing"
    | "receipt_malformed"
    | "source_role_evidence_missing"
    | "declared_source_path_missing"
    | "source_inventory_truncated"
    | "ontology_changed"
    | "source_changed";
  nodeSlug?: string;
}

export interface ProjectSourceNextAction {
  id:
    | "connect_source"
    | "repair_source_binding"
    | "measure_source"
    | "record_source_role"
    | "repair_source_path"
    | "review_inventory_limit"
    | "remeasure_source"
    | "use_current_evidence";
  target?: string;
}

export interface ProjectSourceReceipt {
  contractVersion: typeof PROJECT_SOURCE_RECEIPT_VERSION;
  projectSlug: string;
  sourceId: string;
  sourceKind: "git" | "folder";
  sourceRevision: string;
  sourceFingerprint: string;
  graphHash: string;
  measuredAt: string;
  status: Exclude<ProjectSourceStatus, "not_measured" | "invalid">;
  currentness: "current";
  topGap: ProjectSourceGap | null;
  nextAction: ProjectSourceNextAction;
  witnessSummary: { total: number; supported: number; missing: number };
  witnesses: ProjectSourceWitness[];
  diagnostics: { dirty: boolean | null; truncated: boolean };
}

export interface ProjectSourceBinding {
  projectSlug: string;
  sourceId: string;
  /** Private local-only field. Never copy this into a receipt or handoff. */
  rootPath: string;
  kind: "git" | "folder";
  boundAt: string;
  receipt?: ProjectSourceReceipt;
}

export interface ProjectSourceState {
  contractVersion?: typeof PROJECT_SOURCE_RECEIPT_VERSION;
  bindings: ProjectSourceBinding[];
  malformed?: boolean;
}

export interface ProjectSourceView {
  contractVersion: typeof PROJECT_SOURCE_RECEIPT_VERSION;
  projectSlug: string;
  status: ProjectSourceStatus;
  currentness: ProjectSourceCurrentness;
  measuredAt: string | null;
  topGap: ProjectSourceGap | null;
  nextAction: ProjectSourceNextAction;
  bindingCardinality: number;
  receipt: ProjectSourceReceipt | null;
}

interface ProjectGraphHashInput {
  projectSlug: string;
  nodes: ReadonlyArray<{
    id: string;
    kind: string;
    title: string;
    projectIds?: readonly string[];
  }>;
  edges: ReadonlyArray<{
    from: string;
    to: string;
    type: string;
    projectIds?: readonly string[];
  }>;
}

/**
 * UI-side project graph fingerprint. It is a change detector, not a quality
 * score: the digest deliberately exposes no node/file denominator.
 */
export function buildProjectGraphHash(input: ProjectGraphHashInput): string {
  const nodes = input.nodes
    .filter((node) => (
      node.projectIds?.includes(input.projectSlug)
      || (node.kind === "project" && (node.id === input.projectSlug || node.id.endsWith(`:${input.projectSlug}`)))
    ))
    .map(({ id, kind, title }) => ({ id, kind, title }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = input.edges
    .filter((edge) => (
      edge.projectIds?.includes(input.projectSlug)
      || (ids.has(edge.from) && ids.has(edge.to))
    ))
    .map(({ from, to, type }) => ({ from, to, type }))
    .sort((a, b) => `${a.from}:${a.type}:${a.to}`.localeCompare(`${b.from}:${b.type}:${b.to}`));
  const value = JSON.stringify({ version: 1, projectSlug: input.projectSlug, nodes, edges });
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `project-graph-v1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizedRelativePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function view(
  projectSlug: string,
  bindingCardinality: number,
  status: ProjectSourceStatus,
  currentness: ProjectSourceCurrentness,
  topGap: ProjectSourceGap | null,
  nextAction: ProjectSourceNextAction,
  receipt: ProjectSourceReceipt | null = null,
): ProjectSourceView {
  return {
    contractVersion: PROJECT_SOURCE_RECEIPT_VERSION,
    projectSlug,
    status,
    currentness,
    measuredAt: receipt?.measuredAt ?? null,
    topGap,
    nextAction,
    bindingCardinality,
    receipt,
  };
}

export function buildProjectSourceReceipt(input: {
  projectSlug: string;
  graphHash: string;
  probe: ProjectSourceProbe;
  witnesses: readonly ProjectSourceWitnessInput[];
  measuredAt?: string;
}): ProjectSourceReceipt {
  const files = new Set(input.probe.files.map(normalizedRelativePath));
  const witnesses = input.witnesses.map((candidate) => {
    const path = normalizedRelativePath(candidate.path);
    return { ...candidate, path, supported: files.has(path) };
  });
  const missing = witnesses.filter((candidate) => !candidate.supported);

  let status: ProjectSourceReceipt["status"] = "verified_current";
  let topGap: ProjectSourceGap | null = null;
  let nextAction: ProjectSourceNextAction = { id: "use_current_evidence" };
  if (witnesses.length === 0) {
    status = "needs_evidence";
    topGap = { id: "source_role_evidence_missing" };
    nextAction = { id: "record_source_role" };
  } else if (input.probe.truncated) {
    status = "review_required";
    topGap = { id: "source_inventory_truncated" };
    nextAction = { id: "review_inventory_limit" };
  } else if (missing.length > 0) {
    status = "review_required";
    topGap = { id: "declared_source_path_missing", nodeSlug: missing[0]?.nodeSlug };
    nextAction = { id: "repair_source_path", target: missing[0]?.nodeSlug };
  }

  return {
    contractVersion: PROJECT_SOURCE_RECEIPT_VERSION,
    projectSlug: input.projectSlug,
    sourceId: input.probe.sourceId,
    sourceKind: input.probe.kind,
    sourceRevision: input.probe.revision,
    sourceFingerprint: input.probe.fingerprint,
    graphHash: input.graphHash,
    measuredAt: input.measuredAt ?? new Date().toISOString(),
    status,
    currentness: "current",
    topGap,
    nextAction,
    witnessSummary: {
      total: witnesses.length,
      supported: witnesses.length - missing.length,
      missing: missing.length,
    },
    witnesses,
    diagnostics: { dirty: input.probe.dirty, truncated: input.probe.truncated },
  };
}

export function deriveProjectSourceView(input: {
  projectSlug: string;
  bindings: readonly ProjectSourceBinding[];
  graphHash: string;
  probe?: ProjectSourceProbe | null;
}): ProjectSourceView {
  const bindings = input.bindings.filter((candidate) => candidate.projectSlug === input.projectSlug);
  if (bindings.length === 0) {
    return view(
      input.projectSlug,
      0,
      "not_measured",
      "unavailable",
      { id: "source_unbound" },
      { id: "connect_source" },
    );
  }
  if (bindings.length !== 1) {
    return view(
      input.projectSlug,
      bindings.length,
      "invalid",
      "stale",
      { id: "multiple_active_sources" },
      { id: "repair_source_binding" },
    );
  }

  const receipt = bindings[0]?.receipt;
  if (!receipt || receipt.contractVersion !== PROJECT_SOURCE_RECEIPT_VERSION) {
    return view(
      input.projectSlug,
      1,
      receipt ? "invalid" : "needs_evidence",
      "unavailable",
      { id: receipt ? "receipt_malformed" : "receipt_missing" },
      { id: "measure_source" },
    );
  }
  if (receipt.graphHash !== input.graphHash) {
    return view(
      input.projectSlug,
      1,
      "review_required",
      "stale",
      { id: "ontology_changed" },
      { id: "remeasure_source" },
      receipt,
    );
  }
  if (!input.probe) {
    return view(
      input.projectSlug,
      1,
      receipt.status,
      "unavailable",
      receipt.topGap,
      receipt.nextAction,
      receipt,
    );
  }
  if (
    input.probe.sourceId !== receipt.sourceId ||
    input.probe.fingerprint !== receipt.sourceFingerprint ||
    input.probe.revision !== receipt.sourceRevision
  ) {
    return view(
      input.projectSlug,
      1,
      "review_required",
      "stale",
      { id: "source_changed" },
      { id: "remeasure_source" },
      receipt,
    );
  }
  return view(
    input.projectSlug,
    1,
    receipt.status,
    "current",
    receipt.topGap,
    receipt.nextAction,
    receipt,
  );
}

export function serializeProjectSourceState(state: ProjectSourceState): string {
  return `${JSON.stringify({
    contractVersion: PROJECT_SOURCE_RECEIPT_VERSION,
    bindings: state.bindings,
  }, null, 2)}\n`;
}

function isBinding(value: unknown): value is ProjectSourceBinding {
  if (!value || typeof value !== "object") return false;
  const binding = value as Partial<ProjectSourceBinding>;
  return (
    typeof binding.projectSlug === "string" &&
    typeof binding.sourceId === "string" &&
    typeof binding.rootPath === "string" &&
    (binding.kind === "git" || binding.kind === "folder") &&
    typeof binding.boundAt === "string"
  );
}

export function deserializeProjectSourceState(text: string | null | undefined): Required<Pick<ProjectSourceState, "contractVersion" | "bindings">> & Pick<ProjectSourceState, "malformed"> {
  if (!text) return { contractVersion: PROJECT_SOURCE_RECEIPT_VERSION, bindings: [] };
  try {
    const parsed = JSON.parse(text) as { contractVersion?: unknown; bindings?: unknown };
    if (
      parsed.contractVersion !== PROJECT_SOURCE_RECEIPT_VERSION ||
      !Array.isArray(parsed.bindings) ||
      !parsed.bindings.every(isBinding)
    ) {
      return { contractVersion: PROJECT_SOURCE_RECEIPT_VERSION, bindings: [], malformed: true };
    }
    return { contractVersion: PROJECT_SOURCE_RECEIPT_VERSION, bindings: parsed.bindings };
  } catch {
    return { contractVersion: PROJECT_SOURCE_RECEIPT_VERSION, bindings: [], malformed: true };
  }
}
