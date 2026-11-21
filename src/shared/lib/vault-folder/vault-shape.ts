import { WIKI_DIR } from "../library/wiki-page-schema";

/**
 * What a folder holds, read from its files and nothing else: the rail, the landing and the settings
 * row all ask whether it is a map, a wiki or both, and a stored preference could disagree with files a
 * teammate pulled (`local-first.md`).
 * - map: any `kind:` node outside `wiki/`; `project.md` alone is enough, the vault README is not a node.
 * - wiki: anything under `wiki/`, `_template.md` included.
 * Neither means an empty folder, or no folder: the shell shows everything then.
 */
export interface VaultShape {
  map: boolean;
  wiki: boolean;
}

export interface VaultShapeDoc {
  slug: string;
  frontmatter?: Record<string, unknown> | null;
}

export interface VaultContents {
  docCount: number;
  conceptCount: number;
}

/** The kinds the map draws; every "N concepts" count, here and in `canonical-census.ts`, uses it. */
export const MAP_CONCEPT_KINDS: ReadonlySet<string> = new Set(["project", "domain", "capability", "element"]);

/**
 * Counts what a folder holds for a row offering to open it. `conceptCount` is the map's census, so a
 * row and the map agree; `docCount` is every document the walk parsed, wiki pages included, as
 * `manifest.docs.length` behind the header chip.
 */
export function countVaultContents(docs: ReadonlyArray<VaultShapeDoc>): VaultContents {
  let conceptCount = 0;
  for (const doc of docs) {
    if (doc.slug.startsWith(`${WIKI_DIR}/`)) continue;
    const kind = doc.frontmatter?.kind;
    if (typeof kind === "string" && MAP_CONCEPT_KINDS.has(kind)) conceptCount += 1;
  }
  return { docCount: docs.length, conceptCount };
}

export function describeVaultShape(docs: ReadonlyArray<VaultShapeDoc>): VaultShape {
  let map = false;
  let wiki = false;
  for (const doc of docs) {
    if (doc.slug.startsWith(`${WIKI_DIR}/`)) {
      wiki = true;
      continue;
    }
    const kind = doc.frontmatter?.kind;
    if (typeof kind === "string" && kind.trim() !== "" && kind !== "vault-readme") map = true;
    if (map && wiki) break;
  }
  return { map, wiki };
}
