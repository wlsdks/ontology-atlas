import { join } from 'node:path';

import { repoText } from '../../analyze/repo-text.mjs';
import { areaLocator } from '../../analyze/survey/survey-areas.mjs';
import { kindOf, pathOf, sectionOf } from './node-fields.mjs';

/** One capability per this many abilities an area holds maps it. */
const ABILITIES_PER_CAPABILITY = 3;

/**
 * The summary line the project keeps under `## Uncertainty`. The app reads it with
 * `/Not mapped yet:\s*(\d+)\s+of\s+(\d+)\s+areas?\b/i`, so its wording is fixed.
 */
export function notMappedSummary(notMapped, counted) {
  return `Not mapped yet: ${notMapped} of ${counted} areas.`;
}

/** A `Not mapped yet` line of the project's Uncertainty: the summary or one area's bullet. */
export const NOT_MAPPED_LINE = /^\s*(?:[-*+]\s+)?Not mapped yet:/i;

/**
 * An Uncertainty line that leaves an area out of the product, as opposed to one
 * saying it is still to open or read, which keeps the area counted.
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

/** The project's text that leaves areas out: its `## Excludes`, and each Uncertainty line that says so. */
function exclusionText(docs) {
  const project = docs.find((doc) => kindOf(doc) === 'project');
  if (!project) return '';
  const leftOut = sectionOf(project.body, 'Uncertainty').split('\n')
    .filter((line) => !NOT_MAPPED_LINE.test(line) && LEFT_OUT.test(line) && !STILL_TO_MAP.test(line));
  return [sectionOf(project.body, 'Excludes'), ...leftOut].join('\n');
}

/**
 * Every area of a survey listed by area, with the abilities the survey found in
 * it (all of them, not the sampled rows) and the capabilities whose `path:` falls
 * in it (the deepest area wins). An area the project leaves out is not counted.
 * Not mapped yet: an area holding abilities with fewer than one capability per
 * three, or one holding none that no node's path falls in and no domain names.
 * Largest gap first; O(areas x project and domain text + nodes x path depth).
 */
export function areaCoverage(docs, survey) {
  if (!Array.isArray(survey?.areas)) return null;
  const locate = areaLocator(survey.areas);
  const capabilities = new Map();
  const placed = new Set();
  for (const doc of docs) {
    const path = pathOf(doc);
    const area = path ? locate(path) : null;
    if (!area) continue;
    placed.add(area);
    if (kindOf(doc) === 'capability') capabilities.set(area, (capabilities.get(area) ?? 0) + 1);
  }
  const domains = docs.filter((doc) => kindOf(doc) === 'domain').map((doc) => String(doc.body ?? '')).join('\n');
  const excludes = exclusionText(docs);
  const counted = survey.areas
    .filter((area) => !namesArea(excludes, area))
    .map((area) => ({ ...area, abilities: Number(area.abilities) || 0, capabilities: capabilities.get(area) ?? 0, placed: placed.has(area) }));
  const notMapped = counted
    .filter((area) => (area.abilities > 0
      ? area.capabilities * ABILITIES_PER_CAPABILITY < area.abilities
      : !area.placed && !namesArea(domains, area)))
    .map((area) => ({ ...area, gap: area.abilities - area.capabilities * ABILITIES_PER_CAPABILITY }))
    .sort((left, right) => right.gap - left.gap || right.lines - left.lines);
  return { areas: survey.areas.length, counted: counted.length, excluded: survey.areas.length - counted.length, notMapped };
}

/** The area as its `Not mapped yet` bullet and the Areas sentence write it. */
export function areaLabel(area) {
  const where = area.rest
    ? `${area.members.length} smaller folders in ${repoText(area.path)}`
    : `${repoText(area.path)}${area.own ? ' (its own files)' : ''}`;
  return `${where} (${area.abilities} abilities, ${area.capabilities} capabilities)`;
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
