import { WIKI_DIR } from "./wiki-page-schema";

/**
 * What a folder holds, read from its files and nothing else.
 *
 * The rail, the landing and the settings row all ask the same question — is this a map,
 * a wiki, or both — and the answer is never stored: a preference could disagree with the
 * files a teammate pulled, and vault Markdown wins every such disagreement
 * (`local-first.md`). The signals are the files a creator writes for each part:
 *
 * - **map** — any `kind:` node outside `wiki/`. `project.md` alone is enough, which is
 *   what "start the map" writes; the vault README is not a node.
 * - **wiki** — anything under `wiki/`, the `_template.md` furniture included, which is
 *   what "start a wiki" writes before there is a page.
 *
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
