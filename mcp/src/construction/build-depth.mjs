/**
 * How far a first map reaches and how deep it read. Breadth is measured against the
 * abilities the survey lists (entry points, dispatched operations, library
 * exports): each has a node, is named inside one, or is excluded with a reason.
 * Depth is measured against the lines this server process served, never against a
 * body's wording: which capabilities' entry files were read, and whether each
 * stated rule cites read lines that hold its condition. Ability-to-ability edges
 * are counted so impact does not end at shared roles, and the roles several
 * capabilities' reads pass through are measured against the elements, the same
 * floor abilities have. The findings name what a
 * newcomer would trip over (a relation note about a node nobody read, a rule with
 * no read lines, a dependency both ways, an entry file with no code, one file for
 * many nodes). Writes and validate_vault report the line,
 * finalize_project_meaning refuses an `answered` it does not support and a
 * project that does not keep the measured Not mapped yet line, and every message
 * names the next call.
 */

import { cachedSurvey } from '../analyze/survey/breadth-map.mjs';
import { measureAbilities, abilityLabel } from './build-depth/ability-placement.mjs';
import { citeRepair, measureReads, measureRules, readCall } from './build-depth/read-depth.mjs';
import { dependencyEdges, kindOf } from './build-depth/node-fields.mjs';
import { measureRoles, roleLabel, ROLE_REPAIR } from './build-depth/role-placement.mjs';
import {
  areaCoverage,
  mappingBatch,
  notMappedLineGap,
  notMappedLines,
} from './build-depth/unmapped-areas.mjs';

export { buildDepthFindings } from './build-depth/findings.mjs';
export { saysOutlinedOnly } from './build-depth/node-fields.mjs';
export { coverageChange, coverageReport, finalizeGate } from './build-depth/coverage-report.mjs';

/**
 * The survey of a grounded repository (`cachedSurvey`: every unit with its main
 * files and importers, and the entry points) or null when it has no product units.
 */
export function repositorySurvey(repoRoot, vaultRoot) {
  if (!repoRoot) return null;
  try {
    const { collection, survey } = cachedSurvey(repoRoot, { vaultRoot });
    return collection.units.length > 0 ? { repoRoot, collection, survey } : null;
  } catch {
    return null;
  }
}

const LISTED = 12;

/** Every row, none cut: finalize names each ability it holds the map to. */
function listedAll(rows, render) {
  return rows.map(render).join('; ');
}

/** Capability -> capability `depends_on` edges, and the capabilities in none. */
function measureAbilityEdges(docs) {
  const capability = new Set(docs.filter((doc) => kindOf(doc) === 'capability').map((doc) => doc.slug));
  const edges = dependencyEdges(docs).filter(([from, to]) => capability.has(from) && capability.has(to));
  const linked = new Set(edges.flat());
  return { edges: edges.length, alone: [...capability].filter((slug) => !linked.has(slug)).sort() };
}

function listed(rows, render) {
  const shown = rows.slice(0, LISTED).map(render);
  const more = rows.length - shown.length;
  return `${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
}

/**
 * Placement against the survey's abilities, reads and cites against this session, and
 * ability-to-ability edges, as the measures `coverageReport` counts and the refusals of
 * `finalize_project_meaning` name row by row.
 */
export function measureBuildDepth(docs, repo, reads) {
  const capabilities = docs.filter((doc) => kindOf(doc) === 'capability');
  const dependsOn = dependencyEdges(docs).length;
  const breadth = repo ? measureAbilities(docs, repo.survey) : null;
  const depth = measureReads(docs, reads, repo?.repoRoot ?? null);
  const rules = measureRules(docs, reads, repo?.repoRoot ?? null);
  const abilityEdges = measureAbilityEdges(docs);
  const roles = measureRoles(docs, reads, repo?.repoRoot ?? null);
  const coverage = repo ? areaCoverage(docs, repo.survey, { collection: repo.collection, repoRoot: repo.repoRoot, reads }) : null;
  const unmapped = coverage?.notMapped ?? [];
  return {
    breadth,
    reads: depth,
    rules,
    abilityEdges,
    roles,
    unmappedAreas: unmapped,
    areaCoverage: coverage,
    areaBatch: mappingBatch(unmapped),
    capabilities: capabilities.length,
    dependsOn,
    grounded: Boolean(repo),
    repoRoot: repo?.repoRoot ?? null,
  };
}

/**
 * Why finalize refuses a project whose `## Uncertainty` does not keep the summary
 * line the measure gives, or keeps one after every area is mapped, or null: the
 * app shows the share on the map from that line. Only a repository surveyed by
 * area whose unmapped areas hold abilities needs it.
 */
export function notMappedLinesRefusal(projectSlug, projectBody, depth) {
  const gap = notMappedLineGap(projectBody, depth.areaCoverage);
  if (!gap) return null;
  if (depth.areaCoverage.notMapped.length === 0) {
    return [
      `finalize_project_meaning blocked: ${projectSlug} ${gap}, and the app would keep offering to map the rest from them. Nothing was written.`,
      `Next call: patch_concept({"slug":"${projectSlug}", "body": ...}) without the Not mapped yet lines under ## Uncertainty, then finalize_project_meaning again.`,
    ].join('\n');
  }
  return [
    `finalize_project_meaning blocked: ${projectSlug} ${gap}, and the app shows how much of the code is on the map from that line. Nothing was written.`,
    `Next call: patch_concept({"slug":"${projectSlug}", "body": ...}) so the body's ## Uncertainty holds exactly these lines, replacing any earlier Not mapped yet lines, then finalize_project_meaning again:`,
    ...notMappedLines(depth.areaCoverage),
  ].join('\n');
}

/**
 * Why an `answered` competency row is not supported by the map, one reason per row.
 * Each leads with the call that fixes the map (reading is the cheapest repair for
 * evidence), and only then the partial fallback.
 */
export function competencyDepthRefusals(questions, depth) {
  const status = new Map(questions.map((question) => [question.id, question.status]));
  const reasons = [];
  const fallback = (id, gap) => `Only if that cannot be done, mark ${id} partial with "- Gap: ${gap}".`;
  const reads = depth.reads;
  if (status.get('evidence') === 'answered' && reads && reads.capabilities > 0 && reads.unread.length * 3 > reads.capabilities) {
    reasons.push(`- evidence: ${reads.unread.length} of ${reads.capabilities} capabilities cite no lines this server read that hold a condition${reads.served === 0 ? ' (this server process has served no reads; a restarted server keeps none)' : ''}: ${listed(reads.unread, (row) => `${row.slug} (${row.path})`)}. Next call: ${readCall(reads.unread)}; each read returns the guards, defaults and callees that decide it. Patch each body with that rule and the cite of its lines, and finalize again. ${fallback('evidence', 'these abilities were outlined, not read')}`);
  }
  const rules = depth.rules;
  if (status.get('evidence') === 'answered' && reasons.length === 0 && rules?.judgedAgainstReads && rules.uncited.length > 0) {
    reasons.push(`- evidence: ${rules.uncited.length} capabilities state a rule without citing read lines that hold its condition: ${listed(rules.uncited, (row) => row.slug)}. Next call: ${citeRepair(rules.uncited)}, and finalize again. ${fallback('evidence', 'some rules cite no read lines')}`);
  }
  const breadth = depth.breadth;
  if (breadth && status.get('abilities') === 'answered' && breadth.unplaced.length > 0) {
    reasons.push(`- abilities: ${breadth.unplaced.length} of ${breadth.abilities} abilities the survey lists, the floor under the map, sit on no node by name and no exclusion: ${listedAll(breadth.unplaced, abilityLabel)}. Next call: add_concepts a capability for each thing a user or operator gets there, or patch_concept the node that covers it to name it in its title or in code form (\`name\`, a family or group names its members; a word in passing does not count), or exclude it in the project's ## Uncertainty with one line for it alone that cites its path:Lline or exact name and says why it is not an ability. ${fallback('abilities', 'abilities not yet placed')}`);
  }
  if (status.get('impact') === 'answered' && depth.roles?.unplaced.length > 0) {
    reasons.push(`- impact: ${depth.roles.unplaced.length} implementation roles that two or more capabilities' reads pass through have no element, so "what breaks if I change it" has no node to start from: ${listedAll(depth.roles.unplaced, roleLabel)}. Next call: ${ROLE_REPAIR}. ${fallback('impact', 'shared roles not modelled as elements')}`);
  }
  if (status.get('impact') === 'answered' && depth.capabilities > 0 && !reasons.some((reason) => reason.startsWith('- impact:'))) {
    const edges = depth.abilityEdges;
    if (depth.dependsOn * 2 < depth.capabilities) {
      reasons.push(`- impact: ${depth.dependsOn} depends_on edges for ${depth.capabilities} capabilities, below one per two. Next call: add_relations with the dependencies the code shows, each why naming the call. ${fallback('impact', 'dependencies are recorded for only part of the map')}`);
    } else if (edges && depth.capabilities >= 3 && edges.edges * 3 < depth.capabilities) {
      reasons.push(`- impact: ${edges.edges} depends_on edges run from one capability to another for ${depth.capabilities} capabilities, so "what else stops working" ends at shared roles. Next call: add_relations for each ability that needs another to have run, be configured or be present (none touch ${listed(edges.alone, (slug) => slug)}), each why citing the read lines that show it. ${fallback('impact', 'conditions between abilities are recorded for only part of the map')}`);
    }
  }
  return reasons;
}
