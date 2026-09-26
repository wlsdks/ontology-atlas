// app/globals.css is the entry Next imports; its rules live in app/styles/*.css
// parts pulled in by `@import "./styles/<part>.css";` lines. Gates and tests
// that read the stylesheet as text read it through here, so they see the same
// single body the entry used to hold, in the same order.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PART_IMPORT = /^@import "\.\/(styles\/[^"]+\.css)";\n/gm;

export const GLOBAL_CSS_ENTRY = 'app/globals.css';

/** Part files in import order, as repo-relative paths. */
export function globalCssParts(root = process.cwd()) {
  const entry = readFileSync(path.join(root, GLOBAL_CSS_ENTRY), 'utf8');
  return [...entry.matchAll(PART_IMPORT)].map((m) => `app/${m[1]}`);
}

/** The entry with every part import replaced by that part's content. */
export function readGlobalCss(root = process.cwd()) {
  const entry = readFileSync(path.join(root, GLOBAL_CSS_ENTRY), 'utf8');
  return entry.replace(PART_IMPORT, (_line, rel) =>
    readFileSync(path.join(root, 'app', rel), 'utf8'),
  );
}

/**
 * Maps a 1-based line of readGlobalCss() back to the file that holds it.
 * Returns { file, line } with a repo-relative file path.
 */
export function locateGlobalCssLine(lineNumber, root = process.cwd()) {
  const entry = readFileSync(path.join(root, GLOBAL_CSS_ENTRY), 'utf8');
  let joined = 0;
  let entryLine = 0;
  for (const raw of entry.split(/(?<=\n)/)) {
    const m = /^@import "\.\/(styles\/[^"]+\.css)";\n$/.exec(raw);
    if (m) {
      const part = readFileSync(path.join(root, 'app', m[1]), 'utf8');
      const count = part.split('\n').length - 1;
      if (lineNumber <= joined + count) {
        return { file: `app/${m[1]}`, line: lineNumber - joined };
      }
      joined += count;
    } else {
      entryLine += 1;
      joined += 1;
      if (lineNumber === joined) return { file: GLOBAL_CSS_ENTRY, line: entryLine };
    }
  }
  return { file: GLOBAL_CSS_ENTRY, line: lineNumber };
}
