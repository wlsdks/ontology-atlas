/**
 * What `validate_vault` and a write report of the build depth, as counts: how many abilities
 * sit on no node, how many areas are not mapped, how many capabilities cite no read lines. The
 * rows behind a count are the first `COVERAGE_UNPLACED_ROWS` unplaced abilities with their own
 * cursor, `unplacedOffset`, which has nothing to do with the cursor over problem files. One
 * `nextAction` sentence names the one call that moves the first count that is not zero.
 */

import { repoText } from '../../analyze/repo-text.mjs';
import { abilityLabel } from './ability-placement.mjs';
import { citeRepair, readCall } from './read-depth.mjs';
import { ROLE_REPAIR } from './role-placement.mjs';
import { batchFilesLabel, mappedPercent, notMappedLineGap, openAreaCall } from './unmapped-areas.mjs';
import { kindOf } from './node-fields.mjs';

const COVERAGE_UNPLACED_ROWS = 10;
const MEMBERS_SHOWN = 6;
const NAMED_IN_ACTION = 3;
/** A dependency count under one edge per two capabilities, or one ability-to-ability edge per three, is what finalize refuses. */
const EDGES_PER_CAPABILITY = 2;
const ABILITY_EDGES_PER_CAPABILITY = 3;

function unplacedRow(row) {
  const members = Array.isArray(row.members) ? row.members : null;
  return {
    kind: row.kind,
    name: row.name,
    path: row.path,
    ...(row.evidence ? { evidence: row.evidence } : {}),
    ...(members ? { members: members.slice(0, MEMBERS_SHOWN), memberCount: members.length } : {}),
  };
}

/** The counts of one measurement, each section only when the repository was surveyed for it. */
function countsOf(depth) {
  const { breadth, areaCoverage: areas, reads, rules, roles, abilityEdges } = depth;
  return {
    ...(breadth && breadth.abilities > 0
      ? { abilities: { surveyed: breadth.abilities, onNode: breadth.node, named: breadth.named, excluded: breadth.excluded, unplaced: breadth.unplaced.length } }
      : {}),
    ...(areas
      ? { areas: { counted: areas.counted, notMapped: areas.notMapped.length, abilities: areas.abilities, uncovered: areas.uncovered, mappedPercent: mappedPercent(areas) } }
      : {}),
    ...(reads && reads.capabilities > 0
      ? { reads: { capabilities: reads.capabilities, read: reads.read, unread: (reads.served === 0 ? reads.uncited : reads.unread).length } }
      : {}),
    ...(depth.grounded && rules && rules.uncited.length > 0 ? { rules: { capabilities: rules.capabilities, uncited: rules.uncited.length } } : {}),
    ...(depth.grounded && roles && roles.unplaced.length > 0 ? { roles: { candidates: roles.candidates, unplaced: roles.unplaced.length } } : {}),
    ...(depth.grounded && abilityEdges && depth.capabilities > 1
      ? { abilityEdges: { edges: abilityEdges.edges, capabilitiesWithoutEdge: abilityEdges.alone.length } }
      : {}),
  };
}

/** The one call that moves the first count that is not zero, or null when none is. */
function nextActionOf(depth, repoRootOverride) {
  const repoRoot = repoRootOverride ?? depth.repoRoot ?? '';
  const { breadth, areaCoverage: areas, reads, rules, roles, abilityEdges } = depth;
  if (breadth && breadth.unplaced.length > 0) {
    const named = breadth.unplaced.slice(0, NAMED_IN_ACTION).map(abilityLabel).join('; ');
    return `Place the ${breadth.unplaced.length} abilities no node covers, first ${named}: add_concepts a capability for each, or name it in the title or in code form (\`name\`) of the node that covers it, or exclude it in the project's ## Uncertainty with one line that cites its path:Lline or exact name and says why. validate_vault({unplacedOffset}) lists the rest.`;
  }
  const batch = depth.areaBatch ?? [];
  if (areas && areas.notMapped.length > 0 && batch.length > 0) {
    const files = batch.reduce((sum, area) => sum + area.batchFiles.length, 0);
    const what = files > 0 ? `the ${files} files with no node, ${batch.map(batchFilesLabel).join('; ')}` : repoText(batch[0].path);
    return `Map next, in one request, ${what}: ${batch.map((area) => openAreaCall(repoRoot, area)).join('; ')}. Then write one capability per thing a user or operator gets there, with its entry file in path: and its rule's cited lines.`;
  }
  const pending = reads ? (reads.served === 0 ? reads.uncited : reads.unread) : [];
  if (pending.length > 0) return `Read next, then cite the lines that decide each capability: ${readCall(pending)}.`;
  if (depth.grounded && rules && rules.uncited.length > 0) return `${citeRepair(rules.uncited)}.`;
  if (depth.grounded && roles && roles.unplaced.length > 0) return `${ROLE_REPAIR}.`;
  if (depth.grounded && abilityEdges && depth.capabilities > 1 && abilityEdges.alone.length > 0) {
    return `add_relations for each ability that needs another to have run, be configured or be present first (none touch ${abilityEdges.alone.slice(0, NAMED_IN_ACTION).join(', ')}), each why citing the read lines that show it.`;
  }
  return null;
}

/**
 * The coverage `validate_vault` reports: the counts, a page of the unplaced abilities from
 * `unplacedOffset`, and the next call. Null when the repository gave nothing to measure.
 */
export function coverageReport(depth, { repoRoot = null, unplacedOffset = 0 } = {}) {
  const counts = countsOf(depth);
  if (Object.keys(counts).length === 0) return null;
  const unplaced = depth.breadth?.unplaced ?? [];
  const start = Math.min(unplacedOffset, unplaced.length);
  const page = unplaced.slice(start, start + COVERAGE_UNPLACED_ROWS);
  const nextOffset = start + page.length < unplaced.length ? start + page.length : null;
  const nextAction = nextActionOf(depth, repoRoot);
  return {
    ...counts,
    ...(page.length > 0
      ? {
          unplaced: page.map(unplacedRow),
          unplacedOffset: { offset: start, returned: page.length, total: unplaced.length, hasMore: nextOffset !== null, nextOffset },
        }
      : {}),
    ...(nextAction ? { nextAction } : {}),
  };
}

/** `before` and `after` of every count that a write moved, as `[before, after]`, and the next call. */
export function coverageChange(before, after, { repoRoot = null } = {}) {
  const now = countsOf(after);
  const was = before ? countsOf(before) : {};
  const changed = {};
  for (const [section, fields] of Object.entries(now)) {
    for (const [field, value] of Object.entries(fields)) {
      const previous = was[section]?.[field];
      if (previous !== undefined && previous !== value && typeof value === 'number') {
        changed[`${section}.${field}`] = [previous, value];
      }
    }
  }
  const nextAction = nextActionOf(after, repoRoot);
  if (Object.keys(changed).length === 0 && !nextAction) return null;
  return { ...(Object.keys(changed).length > 0 ? { changed } : {}), ...(nextAction ? { nextAction } : {}) };
}

/**
 * The gate `finalize_project_meaning` applies to a row it is given as `answered`, and to the
 * project's Not mapped yet lines, as one entry per block with its count. Empty when finalize
 * would let every row through.
 */
export function finalizeGate(docs, depth) {
  const blocks = [];
  const { breadth, reads, rules, roles, abilityEdges, areaCoverage: areas } = depth;
  if (breadth && breadth.unplaced.length > 0) blocks.push({ row: 'abilities', unplaced: breadth.unplaced.length });
  if (reads && reads.capabilities > 0 && reads.unread.length * 3 > reads.capabilities) {
    blocks.push({ row: 'evidence', capabilitiesNotRead: reads.unread.length, of: reads.capabilities });
  } else if (rules?.judgedAgainstReads && rules.uncited.length > 0) {
    blocks.push({ row: 'evidence', rulesWithoutReadLines: rules.uncited.length });
  }
  if (roles && roles.unplaced.length > 0) {
    blocks.push({ row: 'impact', rolesWithoutElement: roles.unplaced.length });
  } else if (depth.capabilities > 0 && depth.dependsOn * EDGES_PER_CAPABILITY < depth.capabilities) {
    blocks.push({ row: 'impact', dependsOn: depth.dependsOn, capabilities: depth.capabilities });
  } else if (abilityEdges && depth.capabilities >= 3 && abilityEdges.edges * ABILITY_EDGES_PER_CAPABILITY < depth.capabilities) {
    blocks.push({ row: 'impact', abilityEdges: abilityEdges.edges, capabilities: depth.capabilities });
  }
  const project = docs.find((doc) => kindOf(doc) === 'project');
  if (project && areas && notMappedLineGap(project.body, areas)) blocks.push({ row: 'not-mapped-lines' });
  return blocks;
}
