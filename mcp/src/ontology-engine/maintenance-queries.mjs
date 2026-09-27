import { normalizeLimit, normalizeOptionalBoolean, summarizeNode } from './query-primitives.mjs';
import { folderForKind } from '../schema.mjs';
import {
  boundaryFindings,
  definitionFinding,
  epistemicExclusionFinding,
  starterExampleFindings,
  uncertaintyFinding,
} from '../meaning-findings.mjs';
import { slugOutsideKindFolderMessage } from '../construction-rules.mjs';

const MEANING_GAP_KIND_BY_CODE = Object.freeze({
  'definition-missing': 'definition_missing',
  'boundary-missing': 'boundary_missing',
  'epistemic-exclusion': 'epistemic_exclusion',
  'folder-only-evidence': 'folder_only_evidence',
  'slug-outside-kind-folder': 'slug_outside_kind_folder',
  'uncertainty-missing': 'uncertainty_missing',
  'starter-example-node': 'retire_starter_example',
});
const MEANING_GAP_SCORE_BY_CODE = Object.freeze({
  'definition-missing': 0.6,
  'boundary-missing': 0.55,
  'epistemic-exclusion': 0.7,
  'folder-only-evidence': 0.5,
  'slug-outside-kind-folder': 0.35,
  'uncertainty-missing': 0.55,
  // Ranked just under `epistemic-exclusion`: both put a claim on the map that is not
  // true of the codebase. This one is seen before anything is opened, but its repair
  // is a single delete.
  'starter-example-node': 0.65,
});

export function createMaintenanceQueries({
  artifact,
  nodes,
  nodeBySlug,
  sourceDocBySlug,
  nodeEligibilityFindings,
  staleSummaries,
  maintenancePhases,
  maintenanceSeverities,
  maintenanceKinds,
  capabilityWithoutEvidenceCandidates,
  compareMaintenanceActions,
  countBy,
  cycles,
  danglingReferenceCandidates,
  emptyDomainCandidates,
  externalElementCandidates,
  normalizeStringSet,
  recommendRelations,
  unassignedNodeCandidates,
  unearnedNodeCandidates,
  annotateMaintenanceAction,
}) {
  function limitedCandidateGroup(rows, limit) {
    return { total: rows.length, limited: rows.length > limit, rows: rows.slice(0, limit) };
  }

  function meaningGapCandidates(limit) {
    const rows = [];
    for (const node of [...nodes].sort((a, b) => a.slug.localeCompare(b.slug))) {
      const doc = sourceDocBySlug.get(node.slug);
      if (!doc || typeof doc.body !== 'string') continue;
      const input = { kind: node.kind, slug: node.slug, title: node.title, body: doc.body };
      const found = [
        definitionFinding(input),
        ...boundaryFindings(input),
        uncertaintyFinding(input),
        epistemicExclusionFinding(input),
      ].filter(Boolean);
      for (const finding of found) {
        rows.push({
          kind: MEANING_GAP_KIND_BY_CODE[finding.code],
          score: MEANING_GAP_SCORE_BY_CODE[finding.code],
          slug: node.slug,
          reason: finding.message,
          node: summarizeNode(node),
        });
      }
    }
    return { ...limitedCandidateGroup(rows, limit), keys: rows.map((row) => `${row.kind}\0${row.slug}`) };
  }

  function slugOutsideKindFolderCandidates(limit) {
    const rows = [];
    for (const node of [...nodes].sort((a, b) => a.slug.localeCompare(b.slug))) {
      if (typeof node.kind !== 'string' || typeof node.slug !== 'string') continue;
      const folder = folderForKind(node.kind);
      if (!folder || node.slug.startsWith(folder)) continue;
      rows.push({
        kind: 'slug_outside_kind_folder',
        score: MEANING_GAP_SCORE_BY_CODE['slug-outside-kind-folder'],
        slug: node.slug,
        reason: slugOutsideKindFolderMessage({ slug: node.slug, kind: node.kind, canonicalSlug: `${folder}${node.slug}` }),
        node: summarizeNode(node),
      });
    }
    return { ...limitedCandidateGroup(rows, limit), keys: rows.map((row) => `${row.kind}\0${row.slug}`) };
  }

  /**
   * `init` starter examples the vault has outgrown. Needs only slug, kind and title
   * from the compiled artifact, so it answers on every `maintenance_plan` call,
   * with or without bodies.
   */
  function starterExampleCandidates(limit) {
    const rows = starterExampleFindings(
      [...nodes].sort((a, b) => String(a.slug).localeCompare(String(b.slug))),
    ).map((finding) => ({
      kind: 'retire_starter_example',
      score: MEANING_GAP_SCORE_BY_CODE['starter-example-node'],
      slug: finding.slug,
      reason: finding.message,
      node: summarizeNode(nodeBySlug.get(finding.slug)),
    }));
    return {
      ...limitedCandidateGroup(rows, limit),
      keys: rows.map((row) => `${row.kind}\0${row.slug}`),
    };
  }

  // Review rows only: no proposedAction, or an agent following it literally creates one node per unresolved string; danglingReferenceCandidates already reports plain unresolved refs, and no row states a count.
  function nodeEligibilityActions() {
    const shape = {
      'path-shaped-title': { kind: 'separate_evidence_from_concept', phase: 'repair', severity: 'warn', score: 0.9 },
      'path-shaped-reference': { kind: 'separate_evidence_from_concept', phase: 'repair', severity: 'warn', score: 0.92 },
      'bulk-provenance': { kind: 'fold_bulk_siblings', phase: 'review', severity: 'info', score: 0.45 },
      // Shares `fold_bulk_siblings` rather than adding a kind: `dense-parent` always
      // arrives with a broken-references or machine-filled fact and asks the same
      // question, and a new enum value would grow the public contract to repeat it.
      'dense-parent': { kind: 'fold_bulk_siblings', phase: 'review', severity: 'info', score: 0.5 },
      // The write-path half of `capability_without_evidence`: it fires once, while the
      // author has the file in hand; the vault-wide half below keeps asking. Same kind on
      // purpose — one question asked at two times.
      'capability-without-evidence': { kind: 'capability_without_evidence', phase: 'review', severity: 'info', score: 0.5 },
      ...Object.fromEntries(
        Object.entries(MEANING_GAP_KIND_BY_CODE).map(([code, kind]) => [
          code,
          { kind, phase: 'review', severity: 'info', score: MEANING_GAP_SCORE_BY_CODE[code] },
        ]),
      ),
    };
    const rows = [];
    for (const finding of nodeEligibilityFindings) {
      const mapped = shape[finding?.code];
      if (!mapped) continue;
      rows.push({
        phase: mapped.phase,
        kind: mapped.kind,
        severity: mapped.severity,
        score: mapped.score,
        reason: finding.message,
        node: summarizeNode(nodeBySlug.get(finding.slug)),
      });
    }
    // `review`, never `repair`: the fix is a person reading the domain against its
    // members and deciding, and no tool call can stand in for that. `info` for the
    // same reason — nothing here is broken, something here is owed.
    for (const row of staleSummaries) {
      if (!row?.slug) continue;
      rows.push({
        phase: 'review',
        kind: 'rejudge_summary_membership',
        severity: 'info',
        score: typeof row.score === 'number' ? row.score : 0.5,
        reason: row.hint || `"${row.slug}" declares a membership that changed after its description was last written.`,
        node: summarizeNode(nodeBySlug.get(row.slug)),
      });
    }
    return rows;
  }

  function maintenancePlan(options = {}) {
    const limit = normalizeLimit(options.limit, 25);
    const phaseFilter = normalizeStringSet(options.phases, 'phases', maintenancePhases);
    const severityFilter = normalizeStringSet(options.severities, 'severities', maintenanceSeverities);
    const kindFilter = normalizeStringSet(options.kinds, 'kinds', maintenanceKinds);
    const cycleResult = cycles({ limit, types: options.dependencyTypes ?? ['dependencies'] });
    const relationRecommendations = recommendRelations({ limit });
    const externalElementRefs = externalElementCandidates(limit);
    const danglingReferences = danglingReferenceCandidates(limit);
    const unassignedNodes = unassignedNodeCandidates(limit);
    const emptyDomains = emptyDomainCandidates(limit);
    const unearnedNodes = unearnedNodeCandidates(limit);
    const capabilitiesWithoutEvidence = capabilityWithoutEvidenceCandidates(limit);
    const meaningGaps = meaningGapCandidates(limit);
    const flatSlugs = slugOutsideKindFolderCandidates(limit);
    const starterExamples = starterExampleCandidates(limit);
    const canonicalizationActions = Array.isArray(artifact?.canonicalizationActions)
      ? artifact.canonicalizationActions
      : [];
    const actions = [];

    for (const issue of Array.isArray(artifact?.issues) ? artifact.issues : []) {
      actions.push({
        phase: 'validate',
        kind: 'inspect_compile_issue',
        severity: 'warn',
        score: 1,
        reason: issue.message || issue.code || 'Compiled ontology issue requires inspection.',
        issue,
      });
    }
    for (const cycle of cycleResult.cycles) {
      actions.push({
        phase: 'repair',
        kind: 'break_dependency_cycle',
        severity: 'fail',
        score: 1,
        reason: `Dependency cycle detected across ${cycle.length} nodes.`,
        cycle,
      });
    }
    for (const row of canonicalizationActions) {
      actions.push({
        phase: 'repair',
        kind: 'canonicalize_graph_arrays',
        severity: 'warn',
        score: 0.95,
        reason: `${row.slug} has non-canonical graph arrays: ${row.keys.join(', ')}.`,
        proposedAction: {
          tool: 'patch_concept',
          args: {
            slug: row.slug,
            frontmatter: row.frontmatter,
            expected_mtime: row.expected_mtime,
          },
        },
        node: summarizeNode(nodeBySlug.get(row.slug)),
      });
    }
    for (const row of danglingReferences.rows) {
      actions.push({
        phase: 'repair',
        kind: row.kind,
        severity: 'warn',
        score: row.score,
        reason: row.reason,
        proposedAction: row.proposedAction,
        node: row.node,
      });
    }
    for (const row of relationRecommendations.recommendations) {
      actions.push({
        phase: 'link',
        kind: 'add_missing_relation',
        severity: 'warn',
        score: row.score,
        reason: row.reason,
        proposedAction: row.proposedAction,
        nodes: row.nodes,
      });
    }
    for (const row of externalElementRefs.rows) {
      actions.push({
        phase: 'materialize',
        kind: row.kind,
        severity: 'info',
        score: row.score,
        reason: row.reason,
        proposedAction: row.proposedAction,
        node: row.node,
      });
    }
    for (const row of unassignedNodes.rows) {
      actions.push({
        phase: 'review',
        kind: row.kind,
        severity: 'info',
        score: row.score,
        reason: row.reason,
        node: row.node,
      });
    }
    for (const row of unearnedNodes.rows) {
      actions.push({
        phase: 'review',
        kind: row.kind,
        severity: 'info',
        score: row.score,
        reason: row.reason,
        node: row.node,
      });
    }
    for (const row of emptyDomains.rows) {
      actions.push({
        phase: 'review',
        kind: row.kind,
        severity: 'info',
        score: row.score,
        reason: row.reason,
        node: row.node,
      });
    }
    for (const row of capabilitiesWithoutEvidence.rows) {
      actions.push({
        phase: 'review',
        kind: row.kind,
        severity: 'info',
        score: row.score,
        reason: row.reason,
        node: row.node,
      });
    }
    for (const row of [...meaningGaps.rows, ...flatSlugs.rows, ...starterExamples.rows]) {
      actions.push({ phase: 'review', kind: row.kind, severity: 'info', score: row.score, reason: row.reason, node: row.node });
    }

    // A fresh node is caught by both the write gate and the full scan; drop what the
    // full scan already said so the queue does not repeat itself.
    const capabilitiesWithoutEvidenceSlugs = new Set(capabilitiesWithoutEvidence.slugs ?? []);
    const meaningGapKeys = new Set([
      ...(meaningGaps.keys ?? []),
      ...(flatSlugs.keys ?? []),
      ...(starterExamples.keys ?? []),
    ]);
    for (const action of nodeEligibilityActions()) {
      if (
        action.kind === 'capability_without_evidence' &&
        capabilitiesWithoutEvidenceSlugs.has(action.node?.slug)
      ) {
        continue;
      }
      if (meaningGapKeys.has(`${action.kind}\0${action.node?.slug}`)) continue;
      actions.push(action);
    }

    actions.sort(compareMaintenanceActions);
    const annotatedActions = actions.map(annotateMaintenanceAction);
    const executableOnly = normalizeOptionalBoolean(options.executableOnly, 'executableOnly', false);
    const filteredActions = annotatedActions.filter((action) => {
      if (executableOnly && !action.executable) return false;
      if (phaseFilter && !phaseFilter.has(action.phase)) return false;
      if (severityFilter && !severityFilter.has(action.severity)) return false;
      if (kindFilter && !kindFilter.has(action.kind)) return false;
      return true;
    });
    const afterActionId = typeof options.afterActionId === 'string' && options.afterActionId.trim()
      ? options.afterActionId.trim()
      : null;
    const afterIndex = afterActionId
      ? filteredActions.findIndex((action) => action.id === afterActionId)
      : -1;
    const cursorFound = afterActionId ? afterIndex >= 0 : true;
    const cursorActions = afterActionId
      ? (cursorFound ? filteredActions.slice(afterIndex + 1) : [])
      : filteredActions;
    const pageActions = cursorActions.slice(0, limit);

    return {
      operation: 'maintenance_plan',
      sideEffect: false,
      graphHash: artifact?.graphHash,
      summary: {
        totalActions: actions.length,
        filteredActions: filteredActions.length,
        remainingActions: cursorActions.length,
        executableActions: annotatedActions.filter((action) => action.executable).length,
        reviewActions: annotatedActions.filter((action) => !action.executable).length,
        compileIssues: Array.isArray(artifact?.issues) ? artifact.issues.length : 0,
        dependencyCycles: cycleResult.totalCycles,
        canonicalizationActions: canonicalizationActions.length,
        danglingReferences: danglingReferences.total,
        relationRecommendations: relationRecommendations.totalRecommendations,
        externalElementRefs: externalElementRefs.total,
        externalElementRefsIgnored: externalElementRefs.ignored ?? 0,
        unassignedNodes: unassignedNodes.total,
        emptyDomains: emptyDomains.total,
        capabilitiesWithoutEvidence: capabilitiesWithoutEvidence.total,
      },
      filters: {
        executableOnly,
        phases: phaseFilter ? [...phaseFilter].sort() : [],
        severities: severityFilter ? [...severityFilter].sort() : [],
        kinds: kindFilter ? [...kindFilter].sort() : [],
      },
      cursor: {
        afterActionId,
        found: cursorFound,
        reason: cursorFound ? null : 'afterActionId not found in filtered maintenance actions',
        startIndex: afterActionId ? (cursorFound ? afterIndex + 1 : null) : 0,
        nextAfterActionId: pageActions.length > 0 ? pageActions[pageActions.length - 1].id : null,
        hasMore: cursorActions.length > limit,
      },
      byPhase: countBy(cursorActions, 'phase'),
      bySeverity: countBy(cursorActions, 'severity'),
      byKind: countBy(cursorActions, 'kind'),
      limited: cursorActions.length > limit,
      nextExecutableAction: pageActions.find((action) => action.executable) ?? null,
      nextReviewAction: pageActions.find((action) => !action.executable) ?? null,
      actions: pageActions,
    };
  }

  return { maintenancePlan };
}
