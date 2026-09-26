// app/globals.css is the entry Next imports; its rules live in app/styles/*.css
// parts pulled in by `@import "./styles/<part>.css";` lines. Gates and tests
// that read the stylesheet as text read it through here, so they see the same
// single body the entry used to hold, in the same order. The one difference:
// where a part boundary falls inside `@layer base`, the parts close and reopen
// the layer (`}` then `@layer base {`); Tailwind merges them, so the built CSS
// is unchanged.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PART_IMPORT = /^@import "\.\/(styles\/[^"]+\.css)";\n/gm;

const GLOBAL_CSS_ENTRY = 'app/globals.css';

/** The entry with every part import replaced by that part's content. */
export function readGlobalCss(root = process.cwd()) {
  const entry = readFileSync(path.join(root, GLOBAL_CSS_ENTRY), 'utf8');
  return entry.replace(PART_IMPORT, (_line, rel) =>
    readFileSync(path.join(root, 'app', rel), 'utf8'),
  );
}

/** A repo file's text at a Git ref, or null when it is absent there. */
export function showFileAt(ref, file, root = process.cwd()) {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/**
 * readGlobalCss() as it stood at a Git ref. A ref that predates the split has
 * no part imports, so its plain entry comes back as is and an old base still
 * compares. Returns null when the entry or a part is absent at that ref.
 */
export function readGlobalCssAt(ref, root = process.cwd()) {
  const show = (file) => showFileAt(ref, file, root);
  const entry = show(GLOBAL_CSS_ENTRY);
  if (entry === null) return null;
  let missing = false;
  const joined = entry.replace(PART_IMPORT, (_line, rel) => {
    const part = show(`app/${rel}`);
    if (part === null) missing = true;
    return part ?? '';
  });
  return missing ? null : joined;
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
