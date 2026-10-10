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
  /** The screen's language. The starter bodies are written in it. */
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
 * Writes the starter for the chosen parts (`VaultShape`) into `root`, always creating the fixed
 * folder tree. It takes `root` as an argument because a creation door writes while the folder is
 * being opened. Existing files are skipped; the first failure is reported as an incomplete starter.
 */
export async function writeVaultStarter(
  root: FileSystemDirectoryHandle,
  starterLocale: string,
  shape: VaultShape,
  existingSlugs: { has(slug: string): boolean },
): Promise<StarterWrite> {
  // Count the two kinds separately: the toast and the settings panel must show the same number.
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
   * The agent guide: config alone does not make an agent call MCP. Not counted in
   * `markdownCreated`, which renders as "N concept documents". See `ontology-starter.ts`.
   */
  let guideCreated = 0;
  for (const guide of [
    vaultAgentGuideForLocale(starterLocale),
    // Claude Code does not read `AGENTS.md` directly; it goes through `CLAUDE.md`'s import.
    // With only one of them, one of the two runtimes gets no guide at all.
    vaultClaudeBridgeForLocale(starterLocale),
    // The procedural skill set: in what order and where to stop. See `VAULT_SKILL_NAMES`.
    ...(shape.map ? vaultSkillFilesForLocale(starterLocale) : []),
    // The wiki page template, the same string the validator enforces; the CLI `init` writes it too.
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
