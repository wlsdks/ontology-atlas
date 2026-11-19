/**
 * Families the export surface cannot show: a folder whose files each declare the
 * operation the file is named after (`order_cancel.py` declares `OrderCancel`).
 * An application registers such operations in a schema or router instead of
 * re-exporting them from a package file, so `libraryAbilities` never meets them.
 * One pass over the declaration index and one over the product files:
 * O(declarations + files).
 */

import { basename, dirname, extname } from 'node:path';

import { nameKey } from './operator-abilities.mjs';

const OPERATION_KINDS = new Set(['class', 'function', 'method']);
/** Package and barrel files hold no operation of their own. */
const PACKAGE_FILE_STEMS = new Set(['__init__', 'index', 'mod', 'lib', 'main']);
/**
 * A JVM file always declares the type it is named after, so the rule would turn
 * every package into a family; `jvm-abilities.mjs` names JVM families its own way.
 */
const ONE_TYPE_PER_FILE_EXTENSIONS = new Set(['.java', '.kt', '.kts', '.scala', '.cs']);

const stemOf = (path) => basename(path).replace(/\.[^.]+$/, '');

/**
 * @param {{ path: string }[]} productFiles
 * @param {Map<string, { path: string, line: number, kind: string, name: string }[]>} index `declarationIndex`
 * @param {number} familySize the fewest members that make a family
 * @returns {{ kind: 'family', name: string, path: string, evidence: string, members: string[] }[]}
 */
export function siblingFamilies(productFiles, index, familySize) {
  const namedAfterFile = new Map();
  for (const [name, declarations] of index) {
    if (name.includes('.')) continue;
    for (const declared of declarations) {
      if (!OPERATION_KINDS.has(declared.kind) || namedAfterFile.has(declared.path)) continue;
      if (nameKey(name) === nameKey(stemOf(declared.path))) namedAfterFile.set(declared.path, { name, line: declared.line });
    }
  }
  const byFolder = new Map();
  for (const { path } of productFiles) {
    if (ONE_TYPE_PER_FILE_EXTENSIONS.has(extname(path)) || PACKAGE_FILE_STEMS.has(stemOf(path))) continue;
    const folder = dirname(path);
    const held = byFolder.get(folder) ?? { files: 0, members: [] };
    held.files += 1;
    const member = namedAfterFile.get(path);
    if (member) held.members.push({ ...member, path });
    byFolder.set(folder, held);
  }
  const rows = [];
  for (const [folder, { files, members }] of byFolder) {
    // Most of the folder follows the convention; a helper file or two beside the operations is normal.
    if (members.length < familySize || members.length * 2 < files) continue;
    members.sort((a, b) => a.path.localeCompare(b.path));
    rows.push({
      kind: 'family',
      name: folder,
      path: folder,
      evidence: `${members[0].path}:L${members[0].line}`,
      members: members.map((member) => member.name),
    });
  }
  return rows.sort((a, b) => b.members.length - a.members.length || a.path.localeCompare(b.path));
}
