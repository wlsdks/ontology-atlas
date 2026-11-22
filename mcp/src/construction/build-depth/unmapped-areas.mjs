import { join } from 'node:path';

import { repoText } from '../../analyze/repo-text.mjs';
import { areaLocator } from '../../analyze/survey/survey-areas.mjs';
import { kindOf, pathOf, sectionOf } from './node-fields.mjs';

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

/**
 * The areas of a survey listed by area that are neither placed (a node's
 * `path:` falls in it) nor named (a domain's body or the project's
 * `## Uncertainty` writes its path), largest first; O(areas x that text).
 */
export function unmappedAreas(docs, survey) {
  if (!Array.isArray(survey?.areas)) return [];
  const locate = areaLocator(survey.areas);
  const placed = new Set(docs.map(pathOf).filter(Boolean).map(locate));
  const naming = docs
    .map((doc) => (kindOf(doc) === 'domain' ? String(doc.body ?? '') : kindOf(doc) === 'project' ? sectionOf(doc.body, 'Uncertainty') : ''))
    .join('\n');
  const named = (area) => (area.rest ? area.members.every((member) => namesPath(naming, member)) : namesPath(naming, area.path));
  return survey.areas.filter((area) => !placed.has(area) && !named(area));
}

export function areaLabel(area) {
  if (area.rest) return `${area.members.length} smaller folders in ${repoText(area.path)} (${area.lines} lines)`;
  return `${repoText(area.path)}${area.own ? ' (its own files)' : ''} (${area.files} files, ${area.lines} lines)`;
}

/** The call that opens an area: its own map, or for a folder's own files an outline of its main files. */
export function openAreaCall(repoRoot, area) {
  if (area.own) return `analyze_repo_structure(${JSON.stringify({ sourceOnly: true, sourceReads: area.mainFiles.map((file) => ({ path: file.path, mode: 'outline' })) })})`;
  return `analyze_repo_structure(${JSON.stringify({ rootPath: join(repoRoot, area.rest ? area.members[0] : area.path) })})`;
}
