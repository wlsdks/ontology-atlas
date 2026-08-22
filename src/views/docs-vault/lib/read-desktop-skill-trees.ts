import { listTauriVaultEntries, readTauriVaultText } from '@/shared/lib/tauri-vault-fs';

import type { AgentFileEntry } from './agent-files';

/**
 * Reads both skill trees **by absolute path** — desktop only.
 *
 * **Why not the manifest.** `build-local-manifest.ts` and `build-docs-vault.mjs` both skip dot
 * directories with `if (name.startsWith('.')) continue;`. So `.claude/skills` **never enters the
 * manifest**, and a check that consumes the manifest can never fire even though the code exists
 * (found by the PO council, 2026-07-29).
 *
 * Not fixing the walker is this slice's decision. That filter is the rule defining a vault as "a
 * folder of documents a person reads and writes", and mixing agent configuration files into the
 * document list blurs what the docs surface shows. Instead they are read **separately**, where
 * needed.
 *
 * **Why there is no web equivalent.** An FSA handle has no absolute path and cannot leave the
 * folder the user chose. Not seeing `.claude/` is a browser limitation in principle, so no web
 * equivalent is built (`.claude/rules/surfaces.md` — a desktop capability carries no obligation to
 * backfill the web). With no bridge this function returns an **empty array** and the caller draws
 * nothing in that slot.
 */

const SKILL_TREES = ['.claude/skills', '.agents/skills'] as const;

/** Files inside a skill tree worth comparing — configuration and instructions are text. */
const READABLE = /\.(md|mdc|txt|json|ya?ml|toml)$/i;

/** A runaway guard — there is no reason for a skill tree to hold thousands of files. */
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
    // A missing tree is not a defect — most vaults have no `.claude/`.
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
      // A file that failed to read is **not pretended away** — the path is carried with no
      // content, so a "present in one tree only" verdict is never really a read failure.
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
