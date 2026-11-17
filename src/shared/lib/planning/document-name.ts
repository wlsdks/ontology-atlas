const FORBIDDEN_CHARACTERS = /[\\/:*?"<>|\p{Cc}\p{Cf}]/gu;
const FALLBACK_NAME = 'untitled';
/** Windows refuses these as a file name whatever the extension. */
const WINDOWS_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const DEVICE_NAME_SUFFIX = '-document';
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
 * name gains `-2`, `-3`, …, and a Windows device name gains `-document`.
 */
export function planningDocumentFileName(title: string, takenNames: Iterable<string>): string {
  const taken = new Set([...takenNames].map(planningNameKey));
  const cleaned = title.normalize('NFC').replace(/\s+/g, ' ').replace(FORBIDDEN_CHARACTERS, '').trim().replace(/ /g, '-').replace(/^\.+/, '');
  const kept = withinBytes(cleaned, MAX_NAME_BYTES) || FALLBACK_NAME;
  const base = WINDOWS_DEVICE_NAME.test(kept) ? `${kept}${DEVICE_NAME_SUFFIX}` : kept;
  for (let suffix = 1; ; suffix++) {
    const name = `${base}${suffix === 1 ? '' : `-${suffix}`}.md`;
    if (!taken.has(planningNameKey(name))) return name;
  }
}
