/**
 * Project source inference — the pure half.
 *
 * Canonical implementation shared by the MCP server, the CLI, and the browser
 * bridge (`src/shared/lib/project-source-inference.mjs`). Nothing here touches
 * the filesystem: callers collect candidates however their runtime can (node
 * `fs` + `git rev-parse` in `project-source-discovery.mjs`; a single Tauri
 * `inspect_project_source` call in the app, which already climbs to the git
 * root) and hand them to `inferProjectSourceProposal` for the ranking, the
 * confidence, and the reason.
 *
 * Why the rules are what they are:
 *
 *   1. `enclosing_git_repository` outranks everything. A repository root is a
 *      declared, machine-verifiable boundary that the person already drew —
 *      not a guess — and the bounded source probe (`inspectProjectSource`,
 *      `src-tauri/src/lib.rs`) normalizes to it anyway, so proposing anything
 *      *inside* a repo would be measured as the repo regardless.
 *   2. `ancestor_project_manifest` is the fallback for vaults that live in a
 *      plain folder. The **nearest** manifest-bearing ancestor wins, never the
 *      outermost: over-reaching proposes a parent directory holding unrelated
 *      projects, and a too-narrow root is visible in the witness count while a
 *      too-wide one silently passes.
 *   3. Nothing nominates a root by node `path:` values. They are repo-relative,
 *      so they cannot identify an absolute root; they are used to *score* the
 *      nominee instead (`witnessSummary`), by the same function that mints the
 *      receipt. Nomination and scoring stay separate on purpose — one bad
 *      `path:` must not move the root.
 *
 * The proposal is never self-confirming. It names a candidate and how well the
 * declared implementation paths land in it; a human or an explicit `confirm`
 * writes the binding.
 */

export const PROJECT_SOURCE_INFERENCE_CONTRACT = 'projectSourceInference:v1';

/** Directory levels walked up from the vault root before giving up. */
export const PROJECT_SOURCE_MAX_ANCESTOR_DEPTH = 12;

/** Marker files that make a directory a plausible project root without git. */
export const PROJECT_SOURCE_MANIFEST_FILES = Object.freeze([
  'Cargo.toml',
  'CMakeLists.txt',
  'Gemfile',
  'Package.swift',
  'build.gradle',
  'build.gradle.kts',
  'composer.json',
  'go.mod',
  'mix.exs',
  'package.json',
  'pnpm-workspace.yaml',
  'pom.xml',
  'pyproject.toml',
]);

export const PROJECT_SOURCE_CANDIDATE_MARKERS = Object.freeze([
  'enclosing_git_repository',
  'ancestor_project_manifest',
]);

export const PROJECT_SOURCE_PROPOSAL_REASONS = Object.freeze([
  'enclosing_git_repository',
  'ancestor_project_manifest',
  'no_enclosing_source',
]);

export const PROJECT_SOURCE_CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low']);

const MARKER_RANK = new Map([
  ['enclosing_git_repository', 0],
  ['ancestor_project_manifest', 1],
]);

function isCandidate(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof value.rootPath === 'string'
    && value.rootPath.length > 0
    && (value.kind === 'git' || value.kind === 'folder')
    && MARKER_RANK.has(value.marker)
    && Number.isInteger(value.ancestorDepth)
    && value.ancestorDepth >= 0,
  );
}

function normalizeCandidate(value) {
  return {
    rootPath: value.rootPath,
    kind: value.kind,
    marker: value.marker,
    ancestorDepth: value.ancestorDepth,
    evidence: Array.isArray(value.evidence)
      ? value.evidence.filter((entry) => typeof entry === 'string' && entry.length > 0)
      : [],
  };
}

/**
 * Deterministic candidate order: marker rank, then nearest to the vault, then
 * path. Exported so the CLI/UI can list alternatives in the same order the
 * chooser used — "why not that one" has to be answerable.
 */
export function rankProjectSourceCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .filter(isCandidate)
    .map(normalizeCandidate)
    .sort((left, right) => (
      MARKER_RANK.get(left.marker) - MARKER_RANK.get(right.marker)
      || left.ancestorDepth - right.ancestorDepth
      || left.rootPath.localeCompare(right.rootPath)
    ));
}

function supportRatio(witnessSummary) {
  if (
    !witnessSummary
    || !Number.isInteger(witnessSummary.total)
    || !Number.isInteger(witnessSummary.supported)
    || witnessSummary.total <= 0
  ) return null;
  return witnessSummary.supported / witnessSummary.total;
}

/**
 * Confidence is a statement about the *evidence*, never about the model's
 * feelings. A git root whose declared paths land is `high`; a git root nobody
 * can check yet is `medium`; anything a manifest nominated needs the paths to
 * land before it is better than `low`.
 */
export function rateProjectSourceCandidate(candidate, witnessSummary) {
  if (!candidate) return 'low';
  const ratio = supportRatio(witnessSummary);
  if (candidate.marker === 'enclosing_git_repository') {
    if (ratio === null) return 'medium';
    if (ratio >= 0.8) return 'high';
    if (ratio >= 0.5) return 'medium';
    return 'low';
  }
  if (ratio !== null && ratio >= 0.8) return 'medium';
  return 'low';
}

/**
 * @param {{vaultRootPath?: string, candidates?: unknown, witnessSummary?: unknown}} input
 */
export function inferProjectSourceProposal(input = {}) {
  const ranked = rankProjectSourceCandidates(input.candidates);
  const candidate = ranked[0] ?? null;
  const witnessSummary = supportRatio(input.witnessSummary) === null && !input.witnessSummary
    ? null
    : input.witnessSummary ?? null;
  if (!candidate) {
    return {
      contract: PROJECT_SOURCE_INFERENCE_CONTRACT,
      status: 'none',
      candidate: null,
      alternatives: [],
      confidence: 'low',
      reason: 'no_enclosing_source',
      supportRatio: null,
      witnessSummary: witnessSummary ?? null,
      vaultIsSourceRoot: false,
    };
  }
  return {
    contract: PROJECT_SOURCE_INFERENCE_CONTRACT,
    status: 'proposed',
    candidate,
    alternatives: ranked.slice(1),
    confidence: rateProjectSourceCandidate(candidate, witnessSummary),
    reason: candidate.marker,
    supportRatio: supportRatio(witnessSummary),
    witnessSummary: witnessSummary ?? null,
    vaultIsSourceRoot: typeof input.vaultRootPath === 'string'
      && input.vaultRootPath.length > 0
      && candidate.rootPath === input.vaultRootPath,
  };
}
