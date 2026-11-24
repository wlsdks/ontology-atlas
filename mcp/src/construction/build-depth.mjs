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
  areaLabel,
  batchAbilityRows,
  batchFilesLabel,
  keepsNotMappedLines,
  mappedPercent,
  mappingBatch,
  notMappedLineGap,
  notMappedLines,
  openAreaCall,
} from './build-depth/unmapped-areas.mjs';

export { buildDepthFindings } from './build-depth/findings.mjs';
export { saysOutlinedOnly } from './build-depth/node-fields.mjs';

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
 * The abilities on the map by evidence, the areas not mapped yet largest gap
 * first, the files with no node one request maps with the calls that open their
 * areas, and the exact lines the project keeps under `## Uncertainty`, so the
 * share the project holds is the server's.
 */
function areasSentence(docs, repoRoot, coverage, batch, { abilityRows = false } = {}) {
  const { notMapped, counted, abilities, uncovered } = coverage;
  if (notMapped.length === 0) {
    return keepsNotMappedLines(docs)
      ? `Areas: all ${counted} areas are mapped. Remove the Not mapped yet lines from the project's ## Uncertainty; finalize_project_meaning refuses while they stay (not-mapped-line-mismatch).`
      : null;
  }
  const lead = abilities === 0
    ? `Areas: ${notMapped.length} of ${counted} areas are not mapped yet and hold no abilities, so the project keeps no Not mapped yet line. `
    : `Areas: ${abilities - uncovered} of ${abilities} abilities the survey found, ${mappedPercent(coverage)} percent, are on the map (a node's path: or cited lines point at their file); ${notMapped.length} of ${counted} areas are not mapped yet, largest gap first in the lines to keep below. `;
  const keep = abilities === 0
    ? ''
    : `Keep exactly these lines under the project's ## Uncertainty, replacing any earlier Not mapped yet lines:\n${notMappedLines(coverage).join('\n')}\n`;
  const files = batch.reduce((sum, area) => sum + area.batchFiles.length, 0);
  const rows = abilityRows ? batchAbilityRows(batch) : [];
  const openCalls = batch.map((area) => openAreaCall(repoRoot, area)).join('; ');
  const next = files > 0
    ? `Map next, in one request, the ${files} ${files === 1 ? 'file' : 'files'} with no node, ${batch.map(batchFilesLabel).join('; ')}. `
      + (rows.length > 0
        ? `What the survey lists in them, kind name evidence symbol: ${rows.join('; ')}. Outline a file before reading it by symbol; open an area only when these rows do not show what its file holds: ${openCalls}. `
        : `Open their areas: ${openCalls}. `)
    : `Map next, in one request: ${batch.map(areaLabel).join(', ')}. Open it: ${openCalls}. `;
  const project = docs.find((doc) => kindOf(doc) === 'project');
  const gap = project ? notMappedLineGap(project.body, coverage) : null;
  return `${lead}${next}`
    + 'Then write one capability per thing a user, an operator or another system gets there, with its entry file in path: and its rule\'s cited lines; one capability may stand for several files when it cites lines in each. '
    + 'What is not product (generated code, test tooling, samples) goes on one line of the project\'s ## Excludes with its path and why.'
    + (gap ? ` The project ${gap} (not-mapped-line-mismatch); finalize_project_meaning refuses until that line matches.` : '')
    + (keep ? ` ${keep}` : '');
}

/**
 * Which capabilities still need a read. A process that served nothing cannot tell
 * an earlier session's cite from none, so it lists only bodies citing no lines
 * that exist and counts the rest as recorded earlier.
 */
function depthSentence(depth) {
  const fresh = depth.served === 0;
  const pending = fresh ? depth.uncited : depth.unread;
  if (pending.length === 0 && !(fresh && depth.citedEarlier > 0)) return null;
  const lead = fresh
    ? `Depth: this server process has served no reads (a restarted server keeps none); ${depth.citedEarlier} of ${depth.capabilities} capabilities cite lines an earlier session recorded that this process has not re-read.`
    : `Depth: ${depth.read} of ${depth.capabilities} capabilities cite lines this session read that hold a condition.`;
  if (pending.length === 0) return lead;
  return `${lead} Not yet${fresh ? ', citing no lines' : ''}: ${listed(pending, (row) => `${row.slug} (${row.path})`)}. Read next, then cite the lines that decide each; a symbol read returns the guards, defaults and callees that decide it: ${readCall(pending)}.`;
}

/** One sentence of counts, so a write's answer stays short while the build is still legible. */
function buildTally({ breadth, coverage, depth, rules, abilityEdges, repo, capabilities }) {
  const counts = [];
  if (breadth && breadth.abilities > 0) counts.push(`${breadth.abilities - breadth.unplaced.length} of ${breadth.abilities} abilities placed`);
  if (coverage && coverage.counted > 0) counts.push(`${coverage.counted - coverage.notMapped.length} of ${coverage.counted} areas mapped`);
  if (depth && depth.served > 0) counts.push(`${depth.read} of ${depth.capabilities} capabilities cite read lines`);
  if (repo && rules.uncited.length > 0) counts.push(`${rules.uncited.length} rules uncited`);
  if (repo && capabilities > 1) counts.push(`${abilityEdges.alone.length} capabilities with no ability edge`);
  return counts.length > 0 ? `Build so far: ${counts.join('; ')}.` : '';
}

/**
 * Placement against the survey's abilities, reads and cites against this
 * session, and ability-to-ability edges, with the line a write and validate_vault
 * report. Each list names what to do next. `abilityRows` writes the survey's rows
 * for the files the next request maps, so it needs no area survey; validate_vault
 * asks for them, a write's answer does not repeat them.
 */
export function measureBuildDepth(docs, repo, reads, { abilityRows = false } = {}) {
  const capabilities = docs.filter((doc) => kindOf(doc) === 'capability');
  const dependsOn = dependencyEdges(docs).length;
  const breadth = repo ? measureAbilities(docs, repo.survey) : null;
  const depth = measureReads(docs, reads, repo?.repoRoot ?? null);
  const rules = measureRules(docs, reads, repo?.repoRoot ?? null);
  const abilityEdges = measureAbilityEdges(docs);
  const roles = measureRoles(docs, reads, repo?.repoRoot ?? null);
  const coverage = repo ? areaCoverage(docs, repo.survey, { collection: repo.collection, repoRoot: repo.repoRoot, reads }) : null;
  const unmapped = coverage?.notMapped ?? [];
  const batch = mappingBatch(unmapped);
  const parts = [];
  const actions = [];
  const act = (text) => { parts.push(text); actions.push(text); };
  if (breadth && breadth.abilities > 0) {
    parts.push(`Breadth, of ${breadth.abilities} abilities the survey lists: ${breadth.node} with their own node, ${breadth.named} named inside a capability or element, ${breadth.excluded} excluded with a reason, ${breadth.unplaced.length} not placed.`);
    if (breadth.unplaced.length > 0) {
      act(`Not placed: ${listed(breadth.unplaced, abilityLabel)}. Place each: add_concepts a capability for it, name it in the title or in code form (\`name\`) of the node that covers it (a family or group names its members), or exclude it in the project's ## Uncertainty with one line for it alone that cites its path:Lline or exact name and says why.`);
    }
  }
  if (coverage) {
    const areas = areasSentence(docs, repo.repoRoot, coverage, batch, { abilityRows });
    if (areas) act(areas);
  }
  if (depth) {
    const sentence = depthSentence(depth);
    if (sentence) act(sentence);
  }
  // The rule and edge lists name slugs across the vault; they speak only for a grounded build.
  if (repo && rules.uncited.length > 0) {
    act(`Rules: ${rules.uncited.length} of ${rules.capabilities} capabilities state a rule without citing ${rules.judgedAgainstReads ? 'read ' : ''}lines that hold its condition: ${listed(rules.uncited, (row) => row.slug)}. Next: ${citeRepair(rules.uncited)}.`);
  }
  if (repo && roles && roles.unplaced.length > 0) {
    act(`Roles: ${roles.unplaced.length} of the ${roles.candidates} implementation roles that two or more capabilities' reads pass through have no element: ${listedAll(roles.unplaced, roleLabel)}. Next: ${ROLE_REPAIR}.`);
  }
  if (repo && capabilities.length > 1 && abilityEdges.alone.length > 0) {
    act(`Abilities: ${abilityEdges.edges} depends_on edges run from one capability to another; none touch ${listed(abilityEdges.alone, (slug) => slug)}. For each, ask which other ability must have run, be configured or be present first, and add_relations that edge with a why citing the read lines that show it.`);
  }
  return {
    breadth,
    reads: depth,
    rules,
    abilityEdges,
    roles,
    unmappedAreas: unmapped,
    areaCoverage: coverage,
    areaBatch: batch,
    capabilities: capabilities.length,
    dependsOn,
    line: parts.length > 0 ? parts.join(' ') : null,
    nextLine: actions.length > 0
      ? [buildTally({ breadth, coverage, depth, rules, abilityEdges, repo, capabilities: capabilities.length }), actions[0], actions.length > 1 ? `${actions.length - 1} more open ${actions.length === 2 ? 'list' : 'lists'}: validate_vault names them.` : ''].filter(Boolean).join(' ')
      : null,
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
