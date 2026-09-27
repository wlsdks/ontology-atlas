import { folderForKind } from "@/shared/lib/meaning-findings";

/**
 * Where a document belongs for its kind, the address `slug-outside-kind-folder` asks for.
 * The rule is the validator's (`folderForKind` in `meaning-findings.ts`, mirrored from the MCP
 * schema): projects and documents live at the root and never move. The file keeps its name.
 */
const KIND_FOLDER_NAMES: ReadonlySet<string> = new Set(
  ["domain", "capability", "element"].map((kind) => folderForKind(kind).replace(/\/$/, "")),
);

function splitSlug(slug: string): { dir: string[]; tail: string } {
  const segments = slug.split("/").filter(Boolean);
  return { dir: segments.slice(0, -1), tail: segments[segments.length - 1] ?? "" };
}

/**
 * Null when the kind keeps no folder or the document is already there. A document in another
 * kind's folder moves beside it, so a vault kept in a subfolder stays there.
 */
export function kindFolderAddress(slug: string, kind: string): string | null {
  const folderName = folderForKind(kind).replace(/\/$/, "");
  if (!folderName) return null;
  const { dir, tail } = splitSlug(slug);
  if (!tail) return null;
  const parent = dir[dir.length - 1];
  if (parent === folderName) return null;
  if (parent !== undefined && KIND_FOLDER_NAMES.has(parent)) {
    return [...dir.slice(0, -1), folderName, tail].join("/");
  }
  return `${folderName}/${tail}`;
}

/**
 * Only when the document sits in its old kind's folder; a document kept elsewhere is not
 * relocated by a select.
 */
export function reclassifyMoveTarget(
  slug: string,
  fromKind: string | null | undefined,
  toKind: string | null | undefined,
): string | null {
  if (!toKind || !fromKind || toKind === fromKind) return null;
  const fromFolder = folderForKind(fromKind).replace(/\/$/, "");
  const { dir } = splitSlug(slug);
  if (!fromFolder || dir[dir.length - 1] !== fromFolder) return null;
  return kindFolderAddress(slug, toKind);
}
