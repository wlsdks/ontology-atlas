import { join, posix } from 'node:path';

import { repoText } from '../../analyze/repo-text.mjs';
import { abilityRowText } from '../../analyze/survey/breadth-map.mjs';
import { areaLocator } from '../../analyze/survey/survey-areas.mjs';
import { lineCites } from './line-cites.mjs';
import { kindOf, pathOf, sectionOf } from './node-fields.mjs';

/** One press of the panel's step is one request of at most this many files, across at most this many areas. */
const BATCH_FILES = 18;
const BATCH_AREAS = 7;

/** How many areas the kept lines name, one bullet each. */
const LISTED_AREAS = 12;

/** The node kinds whose `path:` or cited lines put an ability's file on the map. */
const EVIDENCE_KINDS = new Set(['capability', 'element']);

/**
 * The summary line the project keeps under `## Uncertainty`; the app reads its
 * numbers (`not-mapped-areas.ts`), so its wording is fixed.
 */
function notMappedSummary({ notMapped, counted, uncovered, abilities }) {
  return `Not mapped yet: ${notMapped.length} of ${counted} areas, ${uncovered} of ${abilities} abilities.`;
}

/**
 * A summary line, in this form or an earlier one, leads its line after an
 * optional `-`, `*` or `+` marker; only the first one is read, by `SUMMARY_COUNTS`.
 */
const SUMMARY_LINE = /^\s*(?:[-*+]\s+)?Not mapped yet:\s*\d+\s+of\s+\d+\s+areas?\b/i;
const SUMMARY_COUNTS = /^\s*(?:[-*+]\s+)?Not mapped yet:\s*(\d+)\s+of\s+(\d+)\s+areas?,\s*(\d+)\s+of\s+(\d+)\s+abilities\b/i;

/** The lines the project keeps under `## Uncertainty`: the summary, then one bullet per listed area. */
export function notMappedLines(coverage) {
  return [notMappedSummary(coverage), ...coverage.notMapped.slice(0, LISTED_AREAS).map((area) => `- Not mapped yet: ${areaLabel(area)}`)];
}

/**
 * The first summary line under `## Uncertainty` as written (`line`, null when
 * none) and the counts the app reads from it (`counts`, null when it is in an
 * earlier form or its counts cannot be true: not whole numbers a double holds
 * exactly, more remaining than there are, or no area or ability). The app's
 * parser answers the same (`tests/fixtures/not-mapped-line-cases.mjs`).
 * O(body length).
 */
export function readNotMappedSummary(body) {
  const line = sectionOf(body, 'Uncertainty').split('\n').find((text) => SUMMARY_LINE.test(text)) ?? null;
  const match = line === null ? null : SUMMARY_COUNTS.exec(line);
  if (!match) return { line: line?.trim() ?? null, counts: null };
  const numbers = match.slice(1).map(Number);
  const [remaining, total, abilitiesUncovered, abilitiesTotal] = numbers;
  const valid = numbers.every(Number.isSafeInteger) && total > 0 && remaining <= total && abilitiesTotal > 0 && abilitiesUncovered <= abilitiesTotal;
  return { line: line.trim(), counts: valid ? { remaining, total, abilitiesUncovered, abilitiesTotal } : null };
}

/** Areas are not mapped yet and hold abilities; without abilities the app shows no step, so no line is asked for. */
function needsSummaryLine(coverage) {
  return coverage.notMapped.length > 0 && coverage.abilities > 0;
}

/**
 * What the project's summary line says against the measure, or null when it
 * matches or no line is needed: the first summary line carries the measured
 * counts, and once every area is mapped no Not mapped yet line stays.
 */
export function notMappedLineGap(body, coverage) {
  if (!coverage) return null;
  if (coverage.notMapped.length === 0) {
    return keepsLinesIn(body) ? 'keeps Not mapped yet lines under ## Uncertainty although every area is mapped' : null;
  }
  if (!needsSummaryLine(coverage)) return null;
  const expected = notMappedSummary(coverage);
  const { line, counts } = readNotMappedSummary(body);
  const measured = { remaining: coverage.notMapped.length, total: coverage.counted, abilitiesUncovered: coverage.uncovered, abilitiesTotal: coverage.abilities };
  if (counts && Object.keys(measured).every((key) => counts[key] === measured[key])) return null;
  return line === null
    ? `keeps no Not mapped yet summary line under ## Uncertainty, where the measure gives "${expected}"`
    : `keeps "${repoText(line)}" as its first summary line under ## Uncertainty, where the measure gives "${expected}"`;
}

/**
 * The validate_vault warning on the project whose summary line is missing,
 * differs from the measure or outlives it. The lines to keep are written once
 * per answer, in the Areas sentence of its coverage.
 */
export function notMappedLineFindings(docs, coverage) {
  const project = docs.find((doc) => kindOf(doc) === 'project');
  const gap = project ? notMappedLineGap(project.body, coverage) : null;
  if (!gap) return [];
  const repair = coverage.notMapped.length === 0
    ? 'patch_concept the project body to remove its Not mapped yet lines'
    : 'patch_concept the project body so its ## Uncertainty holds exactly the lines the Areas sentence of this answer\'s coverage gives, replacing any earlier Not mapped yet lines';
  return [{
    slug: project.slug,
    code: 'not-mapped-line-mismatch',
    message: `${project.slug} ${gap}, so the app shows a share of the code on the map that is not the measured one, and finalize_project_meaning refuses. Repair: ${repair}.`,
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
 * eighteen files across at most seven areas. When only areas holding no abilities are
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

const FOLDER_SUFFIX = /^\/(?:\*\*)?/;
const LINE_CITE_AFTER = /^[:#]L?\d/;
const FILE_EXTENSION = /\.[A-Za-z][\w]{0,9}$/;
const LINE_LEAD = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?[`*_]*$/;

/**
 * Each place `text` names `path` as a whole path, not part of a longer path, file
 * or word; a trailing `/` or `/**` belongs to the name. `.` is never named. O(text).
 */
function* pathMentions(text, path) {
  if (!path || path === '.') return;
  for (let at = text.indexOf(path); at !== -1; at = text.indexOf(path, at + 1)) {
    if (/[\w/.-]/.test(text[at - 1] ?? ' ')) continue;
    const suffix = FOLDER_SUFFIX.exec(text.slice(at + path.length, at + path.length + 3))?.[0] ?? '';
    const end = at + path.length + suffix.length;
    const after = text[end] ?? ' ';
    if (/[\w/-]/.test(after) || (after === '.' && /\w/.test(text[end + 1] ?? ''))) continue;
    yield { at, end, folderSuffix: suffix !== '' };
  }
}

/** Whether `text` names `path` as a whole path anywhere; how a domain names an area. */
function namesPath(text, path) {
  return !pathMentions(text, path).next().done;
}

/**
 * Whether `text` leaves `path` out. A path of two or more segments, or a file
 * name, counts wherever it is named; one folder name counts only in code form
 * (backticked, `name/`, `name/**`) or leading its line, so a word in a sentence
 * ("no public api") leaves nothing out. A cite of lines (`path:L12`) points at
 * one row, never the whole file.
 */
function leavesOutPath(text, path) {
  const oneName = !path.includes('/') && !FILE_EXTENSION.test(path);
  for (const { at, end, folderSuffix } of pathMentions(text, path)) {
    if (LINE_CITE_AFTER.test(text.slice(end, end + 3))) continue;
    if (!oneName || folderSuffix || (text[at - 1] === '`' && text[end] === '`')) return true;
    if (LINE_LEAD.test(text.slice(text.lastIndexOf('\n', at - 1) + 1, at))) return true;
  }
  return false;
}

/** A rest row is named only when every folder it stands for is. */
function areaNamedBy(names, text, area) {
  return area.rest ? area.members.every((member) => names(text, member)) : names(text, area.path);
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

/** The folder an area stands for at `path`: a rest row's member holding it, else the area's own path. */
function areaFolder(area, path) {
  if (!area.rest) return area.path;
  return area.members.find((member) => path === member || path.startsWith(`${member}/`)) ?? area.path;
}

/**
 * What capabilities and elements point at. `paths`: each `path:` and each file
 * whose cited lines exist (resolved as the Depth measure resolves them, a
 * sub-root cite through this session's reads), with the folders above, since a
 * family the survey found is one ability whose path is its folder. `folders`: a
 * `path:` that is a folder strictly below its area's own folder points at every
 * file under it; one at an area or above claims a domain, not an ability.
 * O(node text + cites x path depth + files).
 */
function pointedAt(docs, survey, { collection, repoRoot, reads }) {
  const fileLines = new Map((Array.isArray(collection?.files) ? collection.files : []).map((file) => [file.path, file.lines]));
  const locate = areaLocator(survey.areas);
  const paths = new Set();
  const folders = new Set();
  for (const doc of docs) {
    if (!EVIDENCE_KINDS.has(kindOf(doc))) continue;
    const path = pathOf(doc) && posix.normalize(pathOf(doc)).replace(/\/+$/, '');
    const cited = lineCites(doc.body, reads, repoRoot)
      .filter((cite) => (fileLines.get(posix.normalize(cite.path)) ?? 0) >= cite.endLine)
      .map((cite) => posix.normalize(cite.path));
    for (const file of path ? [path, ...cited] : cited) for (const folder of pathAndFolders(file)) paths.add(folder);
    const area = path && !fileLines.has(path) ? locate(path) : null;
    const folder = area ? areaFolder(area, path) : null;
    if (folder && path !== folder && (folder === '.' || path.startsWith(`${folder}/`))) folders.add(path);
  }
  return { paths, folders };
}

/** Whether a node points at the file: its path, or a folder node above it. */
function isPointedAt({ paths, folders }, file) {
  return paths.has(file) || pathAndFolders(file).some((folder) => folders.has(folder));
}

/**
 * Every area of a survey listed by area, measured by evidence. An ability the
 * survey found is on the map when a capability or element points at its file:
 * by `path:` (a folder strictly below its area's folder points at the files
 * under it), or by cited lines that exist in the file (`collection.files` gives
 * each file's lines, so nothing is read); nothing else counts. An ability whose
 * file, or a folder above it, the project leaves out (`leavesOutPath`) is not
 * counted, nor is an area left out whole or one whose every ability file is left
 * out. Not mapped yet: an area holding a counted ability not on the map, or one
 * holding none that no node's path falls in and no domain names. Largest gap
 * first, ties by lines. The measure reads the vault's first project only.
 * O(areas x project and domain text + ability files x path depth x exclusion text + node text + files).
 */
export function areaCoverage(docs, survey, { collection = null, repoRoot = null, reads = null } = {}) {
  if (!Array.isArray(survey?.areas)) return null;
  const locate = areaLocator(survey.areas);
  const placed = new Set();
  for (const doc of docs) {
    const path = pathOf(doc);
    const area = path ? locate(path) : null;
    if (area) placed.add(area);
  }
  const onTheMap = pointedAt(docs, survey, { collection, repoRoot, reads });
  const domains = docs.filter((doc) => kindOf(doc) === 'domain').map((doc) => String(doc.body ?? '')).join('\n');
  const excludes = exclusionText(docs);
  const counted = [];
  for (const area of survey.areas) {
    if (areaNamedBy(leavesOutPath, excludes, area)) continue;
    const found = Array.isArray(area.abilityFiles) ? area.abilityFiles : [];
    const files = found.filter((file) => !pathAndFolders(file.path).some((path) => leavesOutPath(excludes, path)));
    if (found.length > 0 && files.length === 0) continue;
    const uncoveredFiles = files.filter((file) => !isPointedAt(onTheMap, file.path))
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
    .filter((area) => (area.abilities > 0 ? area.uncovered > 0 : !area.placed && !areaNamedBy(namesPath, domains, area)))
    .sort((left, right) => right.uncovered - left.uncovered || right.lines - left.lines);
  let abilities = 0;
  let uncovered = 0;
  for (const area of counted) {
    abilities += area.abilities;
    uncovered += area.uncovered;
  }
  return { areas: survey.areas.length, counted: counted.length, excluded: survey.areas.length - counted.length, abilities, uncovered, notMapped };
}

/** The area as its `Not mapped yet` bullet and the Areas sentence write it; `areaOfLabel` reads it back. */
export function areaLabel(area) {
  const where = area.rest
    ? `${area.members.length} smaller folders in ${repoText(area.path)}`
    : `${repoText(area.path)}${area.own ? OWN_FILES : ''}`;
  if (area.abilities === 0) return `${where} (no abilities found, no node)`;
  return `${where} (${area.uncovered} of ${area.abilities} ${area.abilities === 1 ? 'ability' : 'abilities'} not on the map)`;
}

const OWN_FILES = ' (its own files)';
/** The counts an `areaLabel` ends with, and the earlier `(12 abilities, 3 capabilities)` form. */
const LABEL_COUNTS = / \((?:\d+ of \d+ abilit(?:y|ies) not on the map|no abilities found, no node|\d+ abilit(?:y|ies), \d+ capabilit(?:y|ies))\)$/;
const REST_LEAD = /^\d+ smaller folders in /;

/**
 * The area path an `areaLabel` names, read from its end: the counts, then the
 * own-files mark, then a rest row's lead; null when the text is not in that
 * form. A path may itself hold brackets (`app/(shop)`). O(label).
 */
export function areaOfLabel(label) {
  const text = String(label ?? '').trim();
  if (!LABEL_COUNTS.test(text)) return null;
  const where = text.replace(LABEL_COUNTS, '');
  const path = (where.endsWith(OWN_FILES) ? where.slice(0, -OWN_FILES.length) : where).replace(REST_LEAD, '');
  return path || null;
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

/** Members a batch row shows before the rest are counted; a read finds the others. */
const BATCH_ROW_MEMBERS = 8;

/** The rows' share of a validate_vault answer, whose whole text stays within 40,000 characters. */
const BATCH_ROWS_CHARS = 8000;

/**
 * The survey's ability rows for the batch's files, so one request reads them
 * without opening a whole area, in at most 8,000 characters with the rows past
 * that counted; empty when the files carry no rows. O(rows).
 */
export function batchAbilityRows(batch) {
  const rows = batch.flatMap((area) => area.batchFiles.flatMap((file) => file.rows ?? []))
    .map((row) => abilityRowText(row, { membersShown: BATCH_ROW_MEMBERS, withFolder: false }));
  const shown = [];
  let chars = 0;
  for (const row of rows) {
    if (shown.length > 0 && chars + row.length > BATCH_ROWS_CHARS) break;
    shown.push(row);
    chars += row.length + 2;
  }
  const more = rows.length - shown.length;
  return more > 0 ? [...shown, `${more} more ${more === 1 ? 'row' : 'rows'} in their areas' maps`] : shown;
}

/** The call that opens an area: its own map, or for a folder's own files an outline of its main files. */
export function openAreaCall(repoRoot, area) {
  if (area.own) return `analyze_repo_structure(${JSON.stringify({ sourceOnly: true, sourceReads: area.mainFiles.map((file) => ({ path: file.path, mode: 'outline' })) })})`;
  return `analyze_repo_structure(${JSON.stringify({ rootPath: join(repoRoot, area.rest ? area.members[0] : area.path) })})`;
}

function keepsLinesIn(body) {
  return sectionOf(body, 'Uncertainty').split('\n').some((line) => NOT_MAPPED_LINE.test(line));
}

/** Whether the project still keeps `Not mapped yet` lines under its Uncertainty. */
export function keepsNotMappedLines(docs) {
  const project = docs.find((doc) => kindOf(doc) === 'project');
  return Boolean(project) && keepsLinesIn(project.body);
}
