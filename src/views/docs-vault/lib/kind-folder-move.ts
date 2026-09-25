import { folderForKind } from "@/shared/lib/meaning-findings";

/**
 * Where a document belongs for its kind — the address `slug-outside-kind-folder` asks for.
 *
 * **Why it exists** (2026-09-26, map-edit QA D8). Changing a capability's kind to element in
 * the docs page's quick patch rewrote `kind:` and left the file in `capabilities/`. The
 * validator then said, correctly, «this document sits outside its kind folder — move it in»,
 * and nothing on the screen could move it: the person was told about a problem the button
 * they had just pressed created, with no remedy beside it.
 *
 * The folder rule is the validator's own (`folderForKind` in `meaning-findings.ts`, mirrored
 * from the MCP schema): domains, capabilities and elements each have a folder; a project and
 * a document live at the vault root, so they never move. The file keeps its name.
 */
const KIND_FOLDER_NAMES: ReadonlySet<string> = new Set(
  ["domain", "capability", "element"].map((kind) => folderForKind(kind).replace(/\/$/, "")),
);

function splitSlug(slug: string): { dir: string[]; tail: string } {
  const segments = slug.split("/").filter(Boolean);
  return { dir: segments.slice(0, -1), tail: segments[segments.length - 1] ?? "" };
}

/**
 * The address inside `kind`'s folder, or null when the kind keeps no folder or the document
 * is already in it. A document inside another kind's folder moves beside it
 * (`nested/capabilities/a` → `nested/elements/a`), so a vault kept under a subfolder stays there.
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
 * The move a kind change implies — **only when the document sits in its old kind's folder.**
 *
 * That is the one case where the change itself would break an arrangement the vault already
 * kept: the file was filed by kind, so it follows its kind. A document the person keeps
 * elsewhere (the vault root, a folder of their own) is not relocated by a select; the
 * validator's row offers that move separately.
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
