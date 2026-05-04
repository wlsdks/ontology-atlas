import { promises as fs } from 'fs';
import * as path from 'path';
import { parseFrontmatter } from './parse-frontmatter';

export interface VaultNode {
  slug: string;
  kind: string;
  title: string;
  filePath: string;
  domain?: string;
  capabilities?: string[];
  elements?: string[];
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'out', 'dist']);

export async function walkVault(vaultRoot: string): Promise<VaultNode[]> {
  const out: VaultNode[] = [];
  await walk(vaultRoot, vaultRoot, out);
  return out;
}

async function walk(
  root: string,
  dir: string,
  out: VaultNode[],
): Promise<void> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, full, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        const raw = await fs.readFile(full, 'utf-8');
        const { frontmatter } = parseFrontmatter(raw);
        const kind = String(frontmatter.kind ?? '').trim();
        if (!kind) continue;
        const slug =
          String(frontmatter.slug ?? '').trim() ||
          path
            .relative(root, full)
            .replace(/\.md$/, '')
            .replace(/\\/g, '/');
        out.push({
          slug,
          kind,
          title: String(frontmatter.title ?? slug),
          filePath: full,
          domain: optionalString(frontmatter.domain),
          capabilities: optionalArray(frontmatter.capabilities),
          elements: optionalArray(frontmatter.elements),
        });
      } catch {
        // skip unreadable file silently
      }
    }
  }
}

function optionalString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function optionalArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.map(String) : undefined;
}
