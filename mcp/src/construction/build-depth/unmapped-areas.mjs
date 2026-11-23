import { join, posix } from 'node:path';

import { repoText } from '../../analyze/repo-text.mjs';
import { areaLocator } from '../../analyze/survey/survey-areas.mjs';
import { lineCites } from './line-cites.mjs';
import { kindOf, pathOf, sectionOf } from './node-fields.mjs';

/** One press of the panel's step is one request of at most this many files, across at most this many areas. */
const BATCH_FILES = 12;
const BATCH_AREAS = 6;

/** How many areas the kept lines name, one bullet each. */
const LISTED_AREAS = 12;

/** The node kinds whose `path:` or cited lines put an ability's file on the map. */
const EVIDENCE_KINDS = new Set(['capability', 'element']);

/**
 * The summary line the project keeps under `## Uncertainty`. The app reads it with
 * `/Not mapped yet:\s*(\d+)\s+of\s+(\d+)\s+areas?,\s*(\d+)\s+of\s+(\d+)\s+abilities\b/i`,
 * so its wording is fixed.
 */
function notMappedSummary({ notMapped, counted, uncovered, abilities }) {
  return `Not mapped yet: ${notMapped.length} of ${counted} areas, ${uncovered} of ${abilities} abilities.`;
}

/** Any summary line, in this form or an earlier one, once its list marker is stripped. */
const SUMMARY_LINE = /^Not mapped yet:\s*\d+\s+of\s+\d+\s+areas?\b/i;
const LIST_MARKER = /^\s*(?:[-*+]\s+)?/;

/** The lines the project keeps under `## Uncertainty`: the summary, then one bullet per listed area. */
export function notMappedLines(coverage) {
  return [notMappedSummary(coverage), ...coverage.notMapped.slice(0, LISTED_AREAS).map((area) => `- Not mapped yet: ${areaLabel(area)}`)];
}

/**
 * The summary line a project body keeps against the measure: `kept` is the first
 * summary line under `## Uncertainty` (null when none), `matches` whether one of
 * them equals the measure exactly. O(body length).
 */
function keptNotMappedSummary(body, coverage) {
  const expected = notMappedSummary(coverage);
  const summaries = sectionOf(body, 'Uncertainty').split('\n')
    .map((line) => line.replace(LIST_MARKER, '').trim())
    .filter((line) => SUMMARY_LINE.test(line));
  return { expected, kept: summaries[0] ?? null, matches: summaries.includes(expected) };
}

/** What the project's summary line says against the measure, or null when it matches or no line is needed. */
export function notMappedLineGap(body, coverage) {
  if (!coverage || coverage.notMapped.length === 0) return null;
  const { expected, kept, matches } = keptNotMappedSummary(body, coverage);
  if (matches) return null;
  return kept === null
    ? `keeps no Not mapped yet summary line under ## Uncertainty, where the measure gives "${expected}"`
    : `keeps "${kept}" under ## Uncertainty, where the measure gives "${expected}"`;
}

/**
 * The validate_vault warning on the project whose summary line is missing or
 * differs from the measure, which the app shows as the share on the map.
 */
export function notMappedLineFindings(docs, coverage) {
  const project = docs.find((doc) => kindOf(doc) === 'project');
  const gap = project ? notMappedLineGap(project.body, coverage) : null;
  if (!gap) return [];
  return [{
    slug: project.slug,
    code: 'not-mapped-line-mismatch',
    message: `${project.slug} ${gap}, so the app shows a share of the code on the map that is not the measured one, and finalize_project_meaning refuses. Repair: patch_concept the project body so its ## Uncertainty holds exactly these lines, replacing any earlier Not mapped yet lines:\n${notMappedLines(coverage).join('\n')}`,
  }];
}

/** The share of surveyed abilities on the map in whole percent, never 100 while any is uncovered; null without abilities. */
export function mappedPercent({ abilities, uncovered }) {
  if (abilities === 0) return null;
  const percent = Math.round((100 * (abilities - uncovered)) / abilities);
  return uncovered > 0 ? Math.min(percent, 99) : percent;
}

/**
 * The files one request maps, largest gap first: files holding abilities no node
 * points at, most abilities first within an area, the first area always, at most
 * twelve files across at most six areas. When only areas holding no abilities are
 * left, the first of them is opened instead. O(files in the batch).
 */
export function mappingBatch(notMapped) {
  const batch = [];
  let files = 0;
  for (const area of notMapped) {
    if (batch.length === BATCH_AREAS || files === BATCH_FILES) break;
    if (area.uncoveredFiles.length === 0) continue;
    const taken = area.uncoveredFiles.slice(0, BATCH_FILES - files);
    batch.push({ ...area, batchFiles: taken });
    files += taken.length;
  }
  if (batch.length === 0 && notMapped.length > 0) batch.push({ ...notMapped[0], batchFiles: [] });
  return batch;
}

/** A `Not mapped yet` line of the project's Uncertainty: the summary or one area's bullet. */
export const NOT_MAPPED_LINE = /^\s*(?:[-*+]\s+)?Not mapped yet:/i;

/**
 * An Uncertainty line that leaves code out of the product, as opposed to one
 * saying it is still to open or read, which keeps that code counted.
 */
const LEFT_OUT = /\b(?:exclud\w*|left\s+out|leaves?\s+out|out\s+of\s+scope|not\s+(?:a\s+|the\s+)?(?:product|part\s+of\s+the\s+product)|tooling|build\s+(?:tool|plugin|script)s?|generated|vendored|third[-\s]party|demo|examples?|samples?|tests?|fixtures?|benchmarks?)\b/i;
const STILL_TO_MAP = /\b(?:unopened|unread|unmapped|not\s+(?:yet\s+)?(?:opened|read|mapped|traced|inspected)|never\s+opened|outlined?\s+only|later)\b/i;

/** Whether `text` names `path` as a whole path, not as part of a longer path, file or word; O(text). */
function namesPath(text, path) {
  for (let at = text.indexOf(path); at !== -1; at = text.indexOf(path, at + 1)) {
    const before = text[at - 1] ?? ' ';
    const after = text[at + path.length] ?? ' ';
    const extension = after === '.' && /\w/.test(text[at + path.length + 1] ?? '');
    if (!/[\w/.-]/.test(before) && !/[\w/-]/.test(after) && !extension) return true;
  }
  return false;
}

/** A rest row is named only when every folder it stands for is. */
function namesArea(text, area) {
  return area.rest ? area.members.every((member) => namesPath(text, member)) : namesPath(text, area.path);
}

/** The project's text that leaves files, folders and areas out: its `## Excludes`, and each Uncertainty line that says so. */
function exclusionText(docs) {
  const project = docs.find((doc) => kindOf(doc) === 'project');
  if (!project) return '';
  const leftOut = sectionOf(project.body, 'Uncertainty').split('\n')
    .filter((line) => !NOT_MAPPED_LINE.test(line) && LEFT_OUT.test(line) && !STILL_TO_MAP.test(line));
  return [sectionOf(project.body, 'Excludes'), ...leftOut].join('\n');
}

/** `path` and every folder above it; O(path depth). */
function pathAndFolders(path) {
  const parts = path.split('/');
  return parts.map((_, index) => parts.slice(0, parts.length - index).join('/'));
}

/**
 * The paths a capability or element points at: its `path:` and every file its
 * body cites lines of (`path:L12-L30`), with the folders above each, since a
 * family the survey found is one ability whose path is its folder.
 * O(node text + cites x path depth).
 */
function pathsOnTheMap(docs) {
  const paths = new Set();
  for (const doc of docs) {
    if (!EVIDENCE_KINDS.has(kindOf(doc))) continue;
    const path = pathOf(doc);
    const cited = lineCites(doc.body).map((cite) => posix.normalize(cite.path));
    for (const file of path ? [path, ...cited] : cited) for (const folder of pathAndFolders(file)) paths.add(folder);
  }
  return paths;
}

/**
 * Every area of a survey listed by area, measured by evidence. An ability the
 * survey found is on the map when a capability or element points at its file, by
 * `path:` or by cited lines (a family's folder at any file inside it); nothing
 * else counts. An ability whose file, or a folder above it, the project leaves out
 * is not counted, nor is an area left out whole or one whose every ability file
 * is left out. Not mapped yet: an area
 * holding a counted ability not on the map, or one holding none that no node's
 * path falls in and no domain names. Largest gap first, ties by lines.
 * O(areas x project and domain text + ability files x path depth x exclusion text + node text).
 */
export function areaCoverage(docs, survey) {
  if (!Array.isArray(survey?.areas)) return null;
  const locate = areaLocator(survey.areas);
  const placed = new Set();
  for (const doc of docs) {
    const path = pathOf(doc);
    const area = path ? locate(path) : null;
    if (area) placed.add(area);
  }
  const onTheMap = pathsOnTheMap(docs);
  const domains = docs.filter((doc) => kindOf(doc) === 'domain').map((doc) => String(doc.body ?? '')).join('\n');
  const excludes = exclusionText(docs);
  const counted = [];
  for (const area of survey.areas) {
    if (namesArea(excludes, area)) continue;
    const found = Array.isArray(area.abilityFiles) ? area.abilityFiles : [];
    const files = found.filter((file) => !pathAndFolders(file.path).some((path) => namesPath(excludes, path)));
    if (found.length > 0 && files.length === 0) continue;
    const uncoveredFiles = files.filter((file) => !onTheMap.has(file.path))
      .sort((left, right) => right.abilities - left.abilities || left.path.localeCompare(right.path));
    counted.push({
      ...area,
      abilities: files.reduce((sum, file) => sum + file.abilities, 0),
      uncovered: uncoveredFiles.reduce((sum, file) => sum + file.abilities, 0),
      uncoveredFiles,
      placed: placed.has(area),
    });
  }
  const notMapped = counted
    .filter((area) => (area.abilities > 0 ? area.uncovered > 0 : !area.placed && !namesArea(domains, area)))
    .sort((left, right) => right.uncovered - left.uncovered || right.lines - left.lines);
  let abilities = 0;
  let uncovered = 0;
  for (const area of counted) {
    abilities += area.abilities;
    uncovered += area.uncovered;
  }
  return { areas: survey.areas.length, counted: counted.length, excluded: survey.areas.length - counted.length, abilities, uncovered, notMapped };
}

/** The area as its `Not mapped yet` bullet and the Areas sentence write it. */
export function areaLabel(area) {
  const where = area.rest
    ? `${area.members.length} smaller folders in ${repoText(area.path)}`
    : `${repoText(area.path)}${area.own ? ' (its own files)' : ''}`;
  if (area.abilities === 0) return `${where} (no abilities found, no node)`;
  return `${where} (${area.uncovered} of ${area.abilities} ${area.abilities === 1 ? 'ability' : 'abilities'} not on the map)`;
}

/**
 * The files one area adds to the batch, each with the abilities it holds, written
 * from the area's folder so a long common prefix is written once.
 */
export function batchFilesLabel(area) {
  const prefix = area.path === '.' ? '' : `${area.path}/`;
  const files = area.batchFiles.map((file) => {
    const within = prefix && file.path.startsWith(prefix) ? file.path.slice(prefix.length) : file.path;
    return `${repoText(within)} (${file.abilities} ${file.abilities === 1 ? 'ability' : 'abilities'})`;
  });
  return `in ${prefix ? repoText(prefix) : 'the root'}: ${files.join(', ')}`;
}

/** The call that opens an area: its own map, or for a folder's own files an outline of its main files. */
export function openAreaCall(repoRoot, area) {
  if (area.own) return `analyze_repo_structure(${JSON.stringify({ sourceOnly: true, sourceReads: area.mainFiles.map((file) => ({ path: file.path, mode: 'outline' })) })})`;
  return `analyze_repo_structure(${JSON.stringify({ rootPath: join(repoRoot, area.rest ? area.members[0] : area.path) })})`;
}

/** Whether the project still keeps `Not mapped yet` lines under its Uncertainty. */
export function keepsNotMappedLines(docs) {
  const project = docs.find((doc) => kindOf(doc) === 'project');
  return Boolean(project) && sectionOf(project.body, 'Uncertainty').split('\n').some((line) => NOT_MAPPED_LINE.test(line));
}
