/**
 * A repository too large for one flat map is surveyed by area: the product root's
 * folders, the largest split into its subfolders while the list has room, so a
 * folder holding most of the code is shown as its children. Ability rows are
 * shared between areas so every area shows some before any shows more, and
 * product-facing kinds come before library exports.
 */

import { posix } from 'node:path';

import { folderTree } from './source-units.mjs';

/** Area rows one survey lists; at about 200 characters a row the section stays near 12 KB. */
const AREA_ROW_LIMIT = 60;

/** Library exports fill what product-facing rows leave. */
const BACKFILL_KINDS = new Set(['export', 'api']);

function treeArea(node) {
  return { path: node.path || '.', own: false, node, files: node.total, lines: node.lines };
}

function ownArea(node) {
  return { path: node.path || '.', own: true, node, files: node.files.length, lines: node.files.reduce((sum, file) => sum + file.lines, 0) };
}

/**
 * What a folder holds one level down: its own files as one area and each code
 * subfolder as another. A lone subfolder is looked through, so
 * `src/main/java/org/app` opens as its children.
 */
function partsOf(node) {
  const own = node.files.length > 0 ? [ownArea(node)] : [];
  const folders = [...node.children.values()];
  if (folders.length === 1) return [...own, ...partsOf(folders[0])];
  return [...own, ...folders.map(treeArea)];
}

/**
 * A folder's parts in at most `rows` rows: when they do not fit, its own files,
 * its largest subfolders and one row naming the rest; null when that leaves
 * fewer than two subfolders of its own.
 */
function partsWithin(node, rows) {
  const parts = partsOf(node);
  if (parts.length <= rows) return parts;
  const own = parts.filter((part) => part.own);
  const folders = parts.filter((part) => !part.own).sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
  const shown = rows - own.length - 1;
  if (shown < 2) return null;
  const rest = folders.slice(shown);
  return [...own, ...folders.slice(0, shown), {
    path: node.path || '.',
    own: false,
    rest: true,
    members: rest.map((area) => area.path),
    files: rest.reduce((sum, area) => sum + area.files, 0),
    lines: rest.reduce((sum, area) => sum + area.lines, 0),
  }];
}

/**
 * The areas of a repository's product files, largest first. The largest area is
 * split while it has two or more code subfolders and they fit; one holding most
 * of the code is split even when its smaller subfolders must share one row,
 * which ends the splitting. Each pass scans the list for its largest area, so the
 * loop is O(rows^2) after the O(files x depth) folder tree.
 *
 * @param {{ path: string, lines: number }[]} productFiles
 * @returns {{ path: string, own: boolean, rest?: true, members?: string[], files: number, lines: number, node?: object }[]}
 */
export function surveyAreas(productFiles) {
  const root = folderTree(productFiles);
  let areas = partsWithin(root, AREA_ROW_LIMIT) ?? [treeArea(root)];
  while (areas.length > 0 && !areas.some((area) => area.rest)) {
    const largest = areas.reduce((best, area) => (area.lines > best.lines ? area : best));
    if (largest.own) break;
    const children = partsOf(largest.node);
    if (children.filter((part) => !part.own).length < 2) break;
    const rows = AREA_ROW_LIMIT - (areas.length - 1);
    const holdsMost = largest.lines * 2 > root.lines;
    const parts = children.length <= rows ? children : holdsMost ? partsWithin(largest.node, rows) : null;
    if (!parts) break;
    areas = areas.flatMap((area) => (area === largest ? parts : [area]));
  }
  return areas.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
}

/**
 * The area a repository path falls in: the deepest folder area holding it, else
 * the own-files area of its folder; O(path depth) a lookup.
 */
export function areaLocator(areas) {
  const folders = new Map();
  const owns = new Map();
  for (const area of areas) {
    if (area.rest) for (const member of area.members) folders.set(member, area);
    else (area.own ? owns : folders).set(area.path, area);
  }
  return (path) => {
    const parts = String(path).split('/');
    for (let depth = parts.length; depth > 0; depth -= 1) {
      const hit = folders.get(parts.slice(0, depth).join('/'));
      if (hit) return hit;
    }
    return owns.get(path) ?? owns.get(posix.dirname(path)) ?? null;
  };
}

/**
 * At most `limit` rows: product-facing kinds first, then module APIs; within each,
 * every area, largest first, gets one row a round before any gets a second, so
 * no area is left out while another fills the list. A lone export says little
 * about a product, so one is shown only for an area that has no other row;
 * O(rows + limit x areas).
 */
export function abilitiesByArea(rows, areas, locate, limit) {
  const rank = new Map(areas.map((area, index) => [area, index]));
  const laneKey = (row) => {
    const area = locate(row.path);
    return area ? rank.get(area) : areas.length;
  };
  const lanesOf = (wanted) => {
    const lanes = new Map();
    for (const row of rows) {
      if (!wanted(row)) continue;
      const key = laneKey(row);
      if (!lanes.has(key)) lanes.set(key, []);
      lanes.get(key).push(row);
    }
    return [...lanes.entries()].sort((a, b) => a[0] - b[0]);
  };
  const picked = [];
  const shownAreas = new Set();
  const take = (key, row) => {
    picked.push(row);
    shownAreas.add(key);
  };
  for (const wanted of [(row) => !BACKFILL_KINDS.has(row.kind), (row) => row.kind === 'api']) {
    const ordered = lanesOf(wanted);
    for (let round = 0; picked.length < limit; round += 1) {
      const open = ordered.filter(([, lane]) => lane.length > round);
      if (open.length === 0) break;
      for (const [key, lane] of open) {
        if (picked.length === limit) break;
        take(key, lane[round]);
      }
    }
  }
  for (const [key, lane] of lanesOf((row) => row.kind === 'export')) {
    if (picked.length === limit) break;
    if (!shownAreas.has(key)) take(key, lane[0]);
  }
  return picked;
}
