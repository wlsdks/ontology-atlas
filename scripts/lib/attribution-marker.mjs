import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { classifySourcePath, isSupportedSourcePath } from '../quality/source-language/source-paths.mjs';
import { extractCommentTokens } from '../quality/source-language/inventory.mjs';

const CANDIDATE = /^\/\/\s*Adapted from\b/;
const MARKER = /^\/\/ Adapted from (https?:\/\/[^\s()]+) \(([A-Za-z0-9.+-]+), © ([^()\n]+?)\)$/;

/** `// Adapted from <url> (<SPDX>, © <holder>)`, the one comment shape a license requires. */
export function parseAttributionMarker(commentText) {
  const match = MARKER.exec(commentText.trim());
  return match ? { url: match[1], license: match[2], holder: match[3] } : null;
}

export function isAttributionMarker(commentText) {
  return parseAttributionMarker(commentText) !== null;
}

const sortKey = (marker) => `${marker.path}\0${marker.url ?? marker.malformed}`;
const bySortKey = (a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0);

export function collectAttributionMarkers(root) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((file) => file && isSupportedSourcePath(file) && classifySourcePath(file) === 'current');
  const markers = [];
  for (const file of tracked) {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) continue;
    const source = fs.readFileSync(absolute, 'utf8');
    if (!source.includes('Adapted from')) continue;
    for (const token of extractCommentTokens(file, source)) {
      const text = token.text.trim();
      if (!CANDIDATE.test(text)) continue;
      const marker = parseAttributionMarker(text);
      markers.push(marker ? { path: file, ...marker } : { path: file, malformed: text });
    }
  }
  return markers.sort(bySortKey);
}
