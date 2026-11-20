import type { VaultDoc } from "@/entities/docs-vault";
import { automaticWikiWriteAllowed, judgePageWrite, wikiNodeIndexOfDocs, wikiPagePathOf } from "@/features/library";
import { WIKI_CITATION_PATTERN } from "@/shared/lib/library/wiki-page-schema";
import { parseFrontmatter } from "@/shared/lib/vault-document/parse-frontmatter";
import { nativeVaultFileHashResults, readTauriVaultText } from "@/shared/lib/vault-folder/tauri-vault-fs";

import type { LiveLibraryFolder } from "./library-folder-mirror";

export interface LibraryWriteRequest {
  filePath: string | null;
  rawInput: Record<string, unknown>;
  toolKind: string | null;
}

/** What the decision reads from disk at the request; each read failing means Atlas asks. */
export interface FolderReads {
  /** The file's text, or null when it does not exist; rejects when it cannot be read. */
  text: (vaultRoot: string, relativePath: string) => Promise<string | null>;
  /** Which of these paths exist as readable files now; null when that cannot be known. */
  present: (vaultRoot: string, relativePaths: readonly string[]) => Promise<ReadonlySet<string> | null>;
}

const nodeIndexes = new WeakMap<readonly VaultDoc[], ReturnType<typeof wikiNodeIndexOfDocs>>();

/** Built once per published document list, not per request. O(documents). */
function nodeIndexOf(docs: readonly VaultDoc[]) {
  let index = nodeIndexes.get(docs);
  if (!index) {
    index = wikiNodeIndexOfDocs(docs);
    nodeIndexes.set(docs, index);
  }
  return index;
}

/** The source paths a page names: its `sources:` list and every `[[src:…]]` citation. O(page length). */
export function citedSources(pageText: string): string[] {
  const cited = new Set<string>();
  const listed = parseFrontmatter(pageText).frontmatter.sources;
  for (const entry of Array.isArray(listed) ? listed : [listed]) if (typeof entry === "string" && entry.trim()) cited.add(entry.trim());
  for (const match of pageText.matchAll(new RegExp(WIKI_CITATION_PATTERN, "g"))) if (match[1]) cited.add(match[1]);
  return [...cited];
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Allows a wiki page write without a card only when, at this request, the write mode is `auto`,
 * the page as it is on disk and the text the tool would leave fit the wiki contract, and every
 * source it cites is still on disk. Anything Atlas cannot read or judge asks the person.
 */
export async function libraryAutoDecision(
  request: LibraryWriteRequest,
  turnRoot: string,
  live: LiveLibraryFolder,
  reads: FolderReads,
): Promise<string | null> {
  if (live.writeMode !== "auto" || live.vaultRoot !== turnRoot) return null;
  const page = wikiPagePathOf(request.filePath, turnRoot);
  if (!page || !automaticWikiWriteAllowed(page)) return null;
  let current: string | null = null;
  if (text(request.rawInput.content) === null) {
    try {
      current = await reads.text(turnRoot, page);
    } catch {
      return null;
    }
    if (current === null) return null;
  }
  const probe = judgePageWrite({ request, vaultRoot: turnRoot, currentText: () => current, knownSources: live.sources, nodes: nodeIndexOf(live.docs) });
  if (!probe?.ok) return null;
  const listed = new Set(live.sources);
  const cited = citedSources(probe.text).filter((path) => listed.has(path));
  const present = cited.length === 0 ? new Set<string>() : await reads.present(turnRoot, cited).catch(() => null);
  if (present === null) return null;
  const missing = new Set(cited.filter((path) => !present.has(path)));
  const known = missing.size === 0 ? live.sources : live.sources.filter((path) => !missing.has(path));
  const verdict = judgePageWrite({ request, vaultRoot: turnRoot, currentText: () => current, knownSources: known, nodes: nodeIndexOf(live.docs) });
  return verdict?.ok ? page : null;
}

/** The installed app's reads: a file's text, and which files can be opened, through the native bridge. */
export const NATIVE_FOLDER_READS: FolderReads = {
  text: (vaultRoot, relativePath) => readTauriVaultText(vaultRoot, relativePath),
  present: async (vaultRoot, relativePaths) => {
    const results = await nativeVaultFileHashResults(vaultRoot, relativePaths);
    if (!results) return null;
    return new Set([...results].filter(([, sha256]) => sha256 !== null).map(([path]) => path));
  },
};
