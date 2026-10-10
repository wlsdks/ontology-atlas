import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readAcpRust(root: string): string {
  const base = join(root, 'src-tauri', 'src');
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      const production =
        entry.name.endsWith('.rs') && entry.name !== 'tests.rs' && entry.name !== 'test_support.rs';
      return production ? [path] : [];
    });
  const files = [join(base, 'acp.rs'), ...walk(join(base, 'acp'))].sort();
  return files.map((file) => readFileSync(file, 'utf8')).join('\n');
}
