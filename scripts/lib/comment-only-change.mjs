import { extractCommentTokens } from '../quality/source-language/inventory.mjs';

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

export function isCommentOnlyChange(path, before, after) {
  return codeWithoutComments(path, before) === codeWithoutComments(path, after);
}
