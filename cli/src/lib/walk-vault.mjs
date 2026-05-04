import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'out',
  'build',
  'dist',
  '.serena',
]);

/** vault root 안의 모든 .md 절대 경로. dotfile / build artifact 폴더 skip. */
export function walkMd(rootPath) {
  const out = [];
  const stack = [rootPath];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(join(dir, entry.name));
      } else if (entry.name.endsWith('.md')) {
        out.push(join(dir, entry.name));
      }
    }
  }
  return out;
}

export function pathToSlug(rootPath, filePath) {
  return relative(rootPath, filePath).replace(/\\/g, '/').replace(/\.md$/, '');
}
