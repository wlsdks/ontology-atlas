import { WIKI_PAGE_TEMPLATE } from '@/shared/lib/wiki-page-schema';
import type { VaultShape } from '@/shared/lib/vault-shape';
import {
  materializeStarterFiles,
  vaultAgentGuideForLocale,
  vaultClaudeBridgeForLocale,
  vaultSkillFilesForLocale,
} from '../../lib/ontology-starter';
import { resolveBundledLaunch, writeAgentConfigFiles } from './vault-sidecars';

/** The starter a door writes when nobody was asked what the folder holds: all of it. */
export const FULL_STARTER_SHAPE: VaultShape = { map: true, wiki: true };

/**
 * A creation door's request (just start, create a new folder): write the starter the person
 * chose, but only into a folder that holds no documents yet.
 */
interface VaultStarterRequest {
  /** The screen's language. The starter bodies are written in it (walkthrough 2026-07-26). */
  locale: string;
  /** What the person said the folder will hold. Omitted means the whole starter. */
  shape?: VaultShape;
}

export interface VaultOpenOptions {
  starter?: VaultStarterRequest;
}

/** What an open settled into, for the door that asked for it. */
export interface VaultOpenResult {
  /** The folder was read and is the open vault now. False on a cancel or a failure: the state says which. */
  opened: boolean;
  /** Starter files written before the folder was first shown. 0 when none was asked for or it already held documents. */
  starterWritten: number;
  /** Why the requested starter could not be written, or `null`. The folder itself still opened. */
  starterError: unknown;
}

export const NOT_OPENED: VaultOpenResult = Object.freeze({
  opened: false,
  starterWritten: 0,
  starterError: null,
});

interface StarterWrite {
  /** Markdown files that become ontology nodes — the same unit the map and settings count. */
  markdownCreated: number;
  /** Agent guides, skills, the wiki template and config files such as `.mcp.json`. Not concepts. */
  agentConfigCreated: number;
  created: number;
  skipped: number;
  /** The first file that could not be written (an existing file is a skip, not a failure). */
  firstFailure: unknown;
}

async function starterFileParent(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<{ parent: FileSystemDirectoryHandle; fileName: string }> {
  const parts = relPath.split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error('Empty starter path');
  let parent = root;
  for (const part of parts) parent = await parent.getDirectoryHandle(part, { create: true });
  return { parent, fileName };
}

/**
 * Writes the starter for the parts a person chose (`VaultShape`) into `root`: the map's starter
 * nodes and skills, the wiki's template, or both, plus the agent guide pair. Every folder of the
 * fixed shape is created either way — `domains/`, `capabilities/`, `elements/`, `sources/`,
 * `wiki/` — so the folder a teammate pulls always has the same tree, and "start the map" or "start
 * a wiki" later only adds the files that make that part real.
 *
 * It takes the folder as an argument rather than reading the session's current one, because a
 * creation door writes into a folder **while it is being opened**: the screen that pressed the
 * door is gone by then (the shell swaps it for the opening pane, and the root entry swaps that for
 * the map), so nothing that waits for that screen's next render can run (2026-09-25, D1).
 *
 * Existing files are skipped rather than overwritten. A file that fails is counted as skipped and
 * the first such failure is reported, so a caller can say the starter is incomplete instead of
 * presenting a half-written folder as done.
 */
export async function writeVaultStarter(
  root: FileSystemDirectoryHandle,
  starterLocale: string,
  shape: VaultShape,
  existingSlugs: { has(slug: string): boolean },
): Promise<StarterWrite> {
  // Count the two kinds **separately**. They used to be summed into one `created`, so the
  // toast said "8 starter documents" while the real ontology concept count was 5 and the
  // settings panel said "5 documents" — two screens giving different numbers for one vault.
  let markdownCreated = 0;
  let skipped = 0;
  let firstFailure: unknown = null;
  for (const { relPath, content } of shape.map ? materializeStarterFiles(starterLocale) : []) {
    // The slug is the path with the `.md` extension removed, per createDoc / saveDoc rules.
    if (existingSlugs.has(relPath.replace(/\.md$/, ''))) {
      skipped += 1;
      continue;
    }
    try {
      const { parent, fileName } = await starterFileParent(root, relPath);
      const fh = await parent.getFileHandle(fileName, { create: true });
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      markdownCreated += 1;
    } catch (error) {
      skipped += 1;
      firstFailure ??= error;
    }
  }
  /*
   * The agent guide — **config alone is not enough** (measured 2026-08-17). Even with MCP
   * connected, the agent read frontmatter directly with `sed` and `grep` (zero MCP calls).
   * Putting `AGENTS.md` in the vault made it call `list_concepts` for the same question
   * immediately. Evidence: the `VAULT_AGENT_GUIDE_PATH` comment in `ontology-starter.ts`.
   *
   * **Not counted in `markdownCreated`**, because it is not a concept and that number is
   * rendered as "N concept documents".
   */
  let guideCreated = 0;
  for (const guide of [
    vaultAgentGuideForLocale(starterLocale),
    // Claude Code does not read `AGENTS.md` directly; it goes through `CLAUDE.md`'s import.
    // With only one of them, one of the two runtimes gets no guide at all.
    vaultClaudeBridgeForLocale(starterLocale),
    /*
     * The procedural skill set. Where the guide says *what to call*, these say *in what order
     * and where to stop*. The vault is the agent's working folder, so they appear directly in
     * its `/` listing — evidence: the `VAULT_SKILL_NAMES` comment in `ontology-starter.ts`.
     */
    ...(shape.map ? vaultSkillFilesForLocale(starterLocale) : []),
    /*
     * The wiki's furniture. The vault shape is one folder with `sources/` and `wiki/`
     * always (ledger, 2026-09-06), and the CLI's `init` writes the page template into
     * every new vault; a folder the app started used to lack it, so the two doors left
     * two shapes. The template is the same string the validator enforces.
     */
    ...(shape.wiki ? [{ relPath: 'wiki/_template.md', content: WIKI_PAGE_TEMPLATE }] : []),
  ]) {
    try {
      const { parent, fileName } = await starterFileParent(root, guide.relPath);
      const existing = await parent
        .getFileHandle(fileName)
        .then(() => true)
        .catch(() => false);
      if (existing) {
        skipped += 1;
        continue;
      }
      const fh = await parent.getFileHandle(fileName, { create: true });
      const writable = await fh.createWritable();
      await writable.write(guide.content);
      await writable.close();
      guideCreated += 1;
    } catch (error) {
      skipped += 1;
      firstFailure ??= error;
    }
  }
  // `sources/` from the first minute, in both shapes, so the folder says where files go.
  for (const folder of ['domains', 'capabilities', 'elements', 'sources', 'wiki']) {
    try {
      await root.getDirectoryHandle(folder, { create: true });
    } catch {
      // A folder that cannot be made is reported by the first file written into it.
    }
  }

  // Ready-to-use agent configs for "open the vault folder itself" flows.
  // Fail closed when the bundled server cannot be found: write the markdown starter only.
  const starterLaunch = await resolveBundledLaunch();
  const agentConfigResult = starterLaunch
    ? await writeAgentConfigFiles(root, starterLaunch)
    : { created: 0, skipped: 0 };
  skipped += agentConfigResult.skipped;
  return {
    markdownCreated,
    agentConfigCreated: agentConfigResult.created + guideCreated,
    /** Backwards-compatible total. When shown to a user, state the two above separately. */
    created: markdownCreated + agentConfigResult.created + guideCreated,
    skipped,
    firstFailure,
  };
}
