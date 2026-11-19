/**
 * What a read that returned less than a whole declaration owes its reader: one
 * plain sentence saying where the declaration ends and which lines are unread,
 * and the exact `analyze_repo_structure` call that returns them. A builder that
 * gets a cut body writes the limit down; with the call beside it, reading the
 * rest costs one step instead of a decision. The call is a line range bounded by
 * the reader's own limits (at most 200 lines, the same 8 KiB a range returns),
 * and a range still cut returns its own continuation.
 */

import { repoText } from '../analyze/repo-text.mjs';
import { OUTLINE_LINE_CHARS } from './source-outline.mjs';

const MAX_LINES = 200;

/**
 * @param {object} part
 * @param {string} part.path repository-relative path
 * @param {string} part.name the declaration's name
 * @param {{ startLine: number, endLine: number }} part.served lines returned
 * @param {{ startLine: number, endLine: number }} part.declaration lines the declaration spans
 * @param {string} [part.sha256] the file's hash, so the follow-up read refuses a changed file
 * @param {object} [part.callArguments] arguments the serving call carried that the follow-up repeats (`rootPath`, `ignore`)
 * @param {boolean} [part.afterOnly] owe only the lines after the served ones (a line range asked to start where it did)
 * @returns {{ continues: string, nextCall: object } | null} null when nothing of the declaration is unread
 */
export function continuationOf({ path, name, served, declaration, sha256, callArguments = {}, afterOnly = false }) {
  const before = !afterOnly && served.startLine > declaration.startLine;
  const after = served.endLine < declaration.endLine;
  if (!before && !after) return null;
  // Lines after the served ones are read from just past them; a window inside the declaration is read from its start.
  const startLine = before ? declaration.startLine : served.endLine + 1;
  const left = declaration.endLine - startLine + 1;
  const maxLines = Math.min(MAX_LINES, left);
  const unread = before
    ? `L${declaration.startLine}-L${served.startLine - 1}${after ? ` and L${served.endLine + 1}-L${declaration.endLine}` : ''}`
    : `L${served.endLine + 1}-L${declaration.endLine}`;
  const returns = left > MAX_LINES
    ? `L${startLine}-L${startLine + MAX_LINES - 1}, and its own nextCall the rest`
    : `L${startLine}-L${declaration.endLine}`;
  return {
    continues: `${repoText(name, 120)} continues to line ${declaration.endLine} (it runs L${declaration.startLine}-L${declaration.endLine}); this returned L${served.startLine}-L${served.endLine}, unread: ${unread}. nextCall returns ${returns}.`,
    nextCall: {
      tool: 'analyze_repo_structure',
      arguments: {
        ...callArguments,
        sourceOnly: true,
        sourceReads: [{ path, startLine, maxLines, ...(sha256 ? { expectedSha256: sha256 } : {}) }],
      },
    },
  };
}

/**
 * The innermost declaration that `line` sits inside, in one backward pass: a
 * declaration encloses the line when no declaration between them is at its
 * indent or shallower. `end(declaration)` gives its last line.
 *
 * @param {object[]} declarations outline declarations in line order
 * @param {number} line
 * @param {(line: number) => number} indentAt
 * @param {(declaration: object) => number} end
 * @param {{ before?: boolean }} [options] only a declaration that starts before `line` (the one around a declaration)
 */
export function enclosingDeclaration(declarations, line, indentAt, end, { before = false } = {}) {
  let shallowest = Infinity;
  for (let index = declarations.length - 1; index >= 0; index -= 1) {
    const declaration = declarations[index];
    if (declaration.line > line || (before && declaration.line === line)) continue;
    const indent = indentAt(declaration.line);
    if (indent < shallowest) {
      if (declaration.kind !== 'export' && declaration.kind !== 'section' && end(declaration) >= line) return declaration;
      shallowest = indent;
    }
    if (shallowest === 0) return null;
  }
  return null;
}

/**
 * Whether a declaration's last line is known. An outline cut at its declaration
 * cap or past a skipped long line may miss the declaration that ends it: its end
 * is trusted only when a later listed declaration closes it and no skipped line
 * lies inside it.
 *
 * @param {{ lines: string[], declarations: object[], truncated: boolean, declaration: object, end: number }} outline
 */
export function endKnown({ lines, declarations, truncated, declaration, end }) {
  if (!truncated) return true;
  const indentAt = (line) => /^[\t ]*/u.exec(lines[line - 1] ?? '')[0].length;
  const indent = indentAt(declaration.line);
  if (!declarations.some((candidate) => candidate.line > declaration.line && indentAt(candidate.line) <= indent)) return false;
  for (let line = declaration.line; line <= end; line += 1) if ((lines[line - 1] ?? '').length > OUTLINE_LINE_CHARS) return false;
  return true;
}
