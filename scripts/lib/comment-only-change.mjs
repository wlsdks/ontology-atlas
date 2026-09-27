import { extractCommentTokens } from '../quality/source-language/inventory.mjs';

/** The source with every comment removed and whitespace runs collapsed, so layout and comments never count as a change. */
function codeWithoutComments(path, source) {
  let code = '';
  let cursor = 0;
  for (const { start, end } of extractCommentTokens(path, source)) {
    code += `${source.slice(cursor, start)} `;
    cursor = end;
  }
  code += source.slice(cursor);
  return code.replace(/\s+/g, ' ').trim();
}

/** True when two versions of a file differ only in comments and whitespace. */
export function isCommentOnlyChange(path, before, after) {
  return codeWithoutComments(path, before) === codeWithoutComments(path, after);
}
