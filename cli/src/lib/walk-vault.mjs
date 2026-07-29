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
  // NFC 정규화 — macOS 가 넘겨주는 NFD 한글 파일명과 사용자가 타이핑한 NFC
  // 참조가 글자는 같고 바이트가 달라서, 종전엔 그 노드로 오는 엣지가 전부
  // dangling 이 됐다(`mcp/src/vault.mjs` 의 같은 함수에 상세). 식별자만
  // 정규화하고 디스크 경로는 그대로 둔다.
  return relative(rootPath, filePath)
    .replace(/\\/g, '/')
    .replace(/\.md$/, '')
    .normalize('NFC');
}
