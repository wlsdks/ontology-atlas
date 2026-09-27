import { listTauriVaultEntries, readTauriVaultText } from '@/shared/lib/tauri-vault-fs';

import type { AgentFileEntry } from '@/entities/agent-files';

/**
 * Reads both skill trees by absolute path, desktop only. The manifest walkers skip dot
 * directories by design, so `.claude/skills` never enters the manifest. An FSA handle has no
 * absolute path, so the web returns an empty array (`.claude/rules/surfaces.md`: a desktop
 * capability need not be backfilled).
 */

const SKILL_TREES = ['.claude/skills', '.agents/skills'] as const;

const READABLE = /\.(md|mdc|txt|json|ya?ml|toml)$/i;

/** A runaway guard; a skill tree has no reason to hold thousands of files. */
const MAX_FILES = 400;
const MAX_DEPTH = 4;

async function walk(
  rootPath: string,
  relative: string,
  depth: number,
  out: AgentFileEntry[],
): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
  let entries: Array<{ name: string; kind: 'file' | 'directory' }>;
  try {
    entries = await listTauriVaultEntries(rootPath, relative);
  } catch {
    // Most vaults have no `.claude/`.
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    const path = `${relative}/${entry.name}`;
    if (entry.kind === 'directory') {
      await walk(rootPath, path, depth + 1, out);
      continue;
    }
    if (!READABLE.test(entry.name)) continue;
    try {
      const text = await readTauriVaultText(rootPath, path);
      out.push({ path, content: text });
    } catch {
      // Carry a failed read with null content, so it never reads as "present in one tree only".
      out.push({ path, content: null });
    }
  }
}

export async function readDesktopSkillTrees(rootPath: string): Promise<AgentFileEntry[]> {
  const out: AgentFileEntry[] = [];
  for (const tree of SKILL_TREES) {
    await walk(rootPath, tree, 0, out);
  }
  return out;
}
