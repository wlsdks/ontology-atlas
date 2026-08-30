/**
 * Project source receipt — the versioned fact shared by the Topology inspector
 * and agent handoff. The private absolute root belongs to the local binding
 * envelope; it is deliberately absent from `ProjectSourceReceipt`.
 */

import { buildProjectSourceGraphHash } from "./project-source-graph-hash.mjs";
import { buildProjectSourceReceipt as mintProjectSourceReceipt } from "./project-source-mint.mjs";

export const PROJECT_SOURCE_RECEIPT_VERSION = 1 as const;

export type ProjectSourceStatus =
  | "not_measured"
  | "needs_evidence"
  | "review_required"
  | "invalid"
  | "verified_current";

type ProjectSourceCurrentness = "current" | "stale" | "unavailable";

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

interface ProjectSourceWitness extends ProjectSourceWitnessInput {
  supported: boolean;
}

interface ProjectSourceGap {
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

interface ProjectSourceNextAction {
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
    projectIds?: readonly string[];
    agentSlug?: string | null;
  }>;
  docs: ReadonlyArray<{
    slug: string;
    title?: string;
    frontmatter?: Record<string, unknown>;
  }>;
}

/**
 * UI-side project graph fingerprint. It is a change detector, not a quality
 * score: the digest deliberately exposes no node/file denominator.
 */
export function buildProjectGraphHash(input: ProjectGraphHashInput): string {
  const relevantNodes = input.nodes.filter((node) => (
      node.projectIds?.includes(input.projectSlug)
      || (node.kind === "project" && (
        node.id === input.projectSlug
        || node.id.endsWith(`:${input.projectSlug}`)
        || node.agentSlug === input.projectSlug
      ))
    ));
  const scopedDocSlugs = new Set(
    relevantNodes
      .map((node) => node.agentSlug)
      .filter((slug): slug is string => Boolean(slug)),
  );
  // A hand-authored project root can predate agentSlug derivation. Include an
  // exact frontmatter/filename match without guessing by title.
  for (const doc of input.docs) {
    if (
      doc.frontmatter?.kind === "project"
      && (doc.slug === input.projectSlug || doc.frontmatter.slug === input.projectSlug)
    ) {
      scopedDocSlugs.add(doc.slug);
    }
  }
  return buildProjectSourceGraphHash(
    input.projectSlug,
    input.docs.filter((doc) => scopedDocSlugs.has(doc.slug)),
  );
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

/**
 * Mint a receipt. The implementation lives in
 * `mcp/src/project-source-mint.mjs` and is shared verbatim: the app, the
 * CLI, and every MCP agent can now all mint one, and a receipt that means
 * different things depending on who wrote it is worse than no receipt.
 */
export function buildProjectSourceReceipt(input: {
  projectSlug: string;
  graphHash: string;
  probe: ProjectSourceProbe;
  witnesses: readonly ProjectSourceWitnessInput[];
  measuredAt?: string;
}): ProjectSourceReceipt {
  return mintProjectSourceReceipt(input) as ProjectSourceReceipt;
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

/** Copy-safe receipt summary. Field order matches CLI and the inspector. */
export function formatProjectSourceHandoff(view: ProjectSourceView): string {
  return [
    "PROJECT SOURCE",
    `contractVersion: ${view.contractVersion}`,
    `projectSlug: ${view.projectSlug}`,
    `sourceKind: ${view.receipt?.sourceKind ?? "unavailable"}`,
    `status: ${view.status}`,
    `currentness: ${view.currentness}`,
    `measuredAt: ${view.measuredAt ?? "unmeasured"}`,
    `topGap: ${view.topGap?.id ?? "none"}`,
    `nextAction: ${view.nextAction.id}`,
    `bindingCardinality: ${view.bindingCardinality}`,
  ].join("\n");
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
    typeof binding.boundAt === "string" &&
    (
      binding.receipt === undefined
      || (
        isReceipt(binding.receipt)
        && binding.receipt.projectSlug === binding.projectSlug
        && binding.receipt.sourceId === binding.sourceId
        && binding.receipt.sourceKind === binding.kind
      )
    )
  );
}

const RECEIPT_STATUSES = new Set<ProjectSourceReceipt["status"]>([
  "needs_evidence",
  "review_required",
  "verified_current",
]);
const GAP_IDS = new Set<ProjectSourceGap["id"]>([
  "source_unbound",
  "multiple_active_sources",
  "receipt_missing",
  "receipt_malformed",
  "source_role_evidence_missing",
  "declared_source_path_missing",
  "source_inventory_truncated",
  "ontology_changed",
  "source_changed",
]);
const ACTION_IDS = new Set<ProjectSourceNextAction["id"]>([
  "connect_source",
  "repair_source_binding",
  "measure_source",
  "record_source_role",
  "repair_source_path",
  "review_inventory_limit",
  "remeasure_source",
  "use_current_evidence",
]);

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeRelativePath(value: unknown): value is string {
  if (!nonBlank(value)) return false;
  const normalized = value.replaceAll("\\", "/");
  return (
    !normalized.startsWith("/")
    && !/^[A-Za-z]:\//.test(normalized)
    && !normalized.split("/").includes("..")
  );
}

function isReceipt(value: unknown): value is ProjectSourceReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<ProjectSourceReceipt>;
  if (
    receipt.contractVersion !== PROJECT_SOURCE_RECEIPT_VERSION
    || !nonBlank(receipt.projectSlug)
    || !nonBlank(receipt.sourceId)
    || (receipt.sourceKind !== "git" && receipt.sourceKind !== "folder")
    || !nonBlank(receipt.sourceRevision)
    || !nonBlank(receipt.sourceFingerprint)
    || !nonBlank(receipt.graphHash)
    || !nonBlank(receipt.measuredAt)
    || !receipt.status
    || !RECEIPT_STATUSES.has(receipt.status)
    || receipt.currentness !== "current"
    || !receipt.nextAction
    || !ACTION_IDS.has(receipt.nextAction.id)
    || (receipt.topGap !== null && (!receipt.topGap || !GAP_IDS.has(receipt.topGap.id)))
    || !receipt.witnessSummary
    || !Number.isInteger(receipt.witnessSummary.total)
    || !Number.isInteger(receipt.witnessSummary.supported)
    || !Number.isInteger(receipt.witnessSummary.missing)
    || receipt.witnessSummary.total < 0
    || receipt.witnessSummary.supported < 0
    || receipt.witnessSummary.missing < 0
    || receipt.witnessSummary.total
      !== receipt.witnessSummary.supported + receipt.witnessSummary.missing
    || !Array.isArray(receipt.witnesses)
    || receipt.witnesses.length !== receipt.witnessSummary.total
    || !receipt.diagnostics
    || !(
      typeof receipt.diagnostics.dirty === "boolean"
      || receipt.diagnostics.dirty === null
    )
    || typeof receipt.diagnostics.truncated !== "boolean"
  ) return false;
  let supported = 0;
  for (const witness of receipt.witnesses) {
    if (
      !nonBlank(witness.id)
      || !nonBlank(witness.nodeSlug)
      || !nonBlank(witness.role)
      || !safeRelativePath(witness.path)
      || typeof witness.supported !== "boolean"
    ) return false;
    if (witness.supported) supported += 1;
  }
  return supported === receipt.witnessSummary.supported;
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
