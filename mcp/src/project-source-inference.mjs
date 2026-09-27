/**
 * Project source inference, the pure half shared by the MCP server, the CLI and
 * the browser bridge (`src/shared/lib/project-source-inference.mjs`). Callers
 * collect candidates (`project-source-discovery.mjs`, or the
 * app's `inspect_project_source`); this ranks them. An enclosing git repository wins
 * (a boundary the person drew, and the probe normalizes to it anyway); else the
 * nearest manifest-bearing ancestor, never the outermost, since a too-wide root
 * passes silently. Node `path:` values only score the nominee, so one bad path
 * cannot move the root. Never self-confirming: a person or `confirm` writes it.
 */

const PROJECT_SOURCE_INFERENCE_CONTRACT = 'projectSourceInference:v1';

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
 * Marker rank, then nearest to the vault, then path; exported so the CLI and UI
 * list alternatives in the chooser's order.
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
 * Confidence describes the evidence: a git root whose declared paths land
 * is `high`, an uncheckable git root `medium`, a manifest nominee `low` until
 * its paths land.
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
