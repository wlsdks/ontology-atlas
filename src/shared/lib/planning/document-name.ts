const FORBIDDEN_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
const FALLBACK_NAME = 'untitled';
/** Keeps `<name>-NN.md` well under the 255-byte file-name limit even for multi-byte titles. */
const MAX_NAME_CHARACTERS = 80;

/**
 * The Markdown file name a document title becomes: characters a file system refuses removed,
 * whitespace runs turned into `-`, never empty and never hidden; a taken name (compared
 * lower-case, as macOS does) gains `-2`, `-3`, ….
 */
export function planningDocumentFileName(title: string, taken: ReadonlySet<string>): string {
  const cleaned = title.replace(/\s+/g, ' ').replace(FORBIDDEN_CHARACTERS, '').trim().replace(/ /g, '-').replace(/^\.+/, '');
  const base = [...cleaned].slice(0, MAX_NAME_CHARACTERS).join('') || FALLBACK_NAME;
  for (let suffix = 1; ; suffix++) {
    const name = `${base}${suffix === 1 ? '' : `-${suffix}`}.md`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}
