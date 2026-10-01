/** ECMAScript whitespace tokens; O(n) time, O(1) space. */
export function countWhitespaceWords(text: string): number {
  let count = 0;
  let precededByWhitespace = true;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const whitespace = code === 32 || (code >= 9 && code <= 13) || code === 0xa0 ||
      code === 0x1680 || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 ||
      code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000 || code === 0xfeff;
    if (!whitespace && precededByWhitespace) count += 1;
    precededByWhitespace = whitespace;
  }
  return count;
}
