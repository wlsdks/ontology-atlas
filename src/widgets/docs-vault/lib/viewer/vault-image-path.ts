/** The vault-relative path of an image `src` written in the document `docSlug`, `..` resolved. */
export function vaultPathFromDoc(docSlug: string, src: string): string {
  const fromDir = docSlug.includes('/') ? docSlug.slice(0, docSlug.lastIndexOf('/')) : '';
  const rel = src.replace(/^\.\//, '');
  const stack: string[] = [];
  for (const part of (fromDir ? `${fromDir}/${rel}` : rel).split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}
