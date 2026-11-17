const FORBIDDEN_CHARACTERS = /[\\/:*?"<>|\p{Cc}\p{Cf}]/gu;
const FALLBACK_NAME = 'untitled';
/** Leaves room for `-NN.md` under the common 255-byte file-name limit. */
const MAX_NAME_BYTES = 200;

/** How two names compare on disk: APFS ignores letter case and Unicode composition. */
export function planningNameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

function withinBytes(value: string, limit: number): string {
  const encoder = new TextEncoder();
  let used = 0;
  let kept = '';
  for (const character of value) {
    used += encoder.encode(character).length;
    if (used > limit) break;
    kept += character;
  }
  return kept;
}

/**
 * The Markdown file name a document title becomes, in NFC: characters a file system refuses and
 * invisible ones removed, whitespace runs turned into `-`, never empty and never hidden; a taken
 * name gains `-2`, `-3`, ….
 */
export function planningDocumentFileName(title: string, takenNames: Iterable<string>): string {
  const taken = new Set([...takenNames].map(planningNameKey));
  const cleaned = title.normalize('NFC').replace(/\s+/g, ' ').replace(FORBIDDEN_CHARACTERS, '').trim().replace(/ /g, '-').replace(/^\.+/, '');
  const base = withinBytes(cleaned, MAX_NAME_BYTES) || FALLBACK_NAME;
  for (let suffix = 1; ; suffix++) {
    const name = `${base}${suffix === 1 ? '' : `-${suffix}`}.md`;
    if (!taken.has(planningNameKey(name))) return name;
  }
}
