// app/globals.css is the entry Next imports; its rules live in app/styles/*.css
// parts pulled in by `@import "./styles/<part>.css";` lines. Gates and tests
// that read the stylesheet as text read it through here, so they see the same
// single body the entry used to hold, in the same order.
//
// Where a part boundary falls inside `@layer base`, the parts close and reopen
// the layer: one part ends with `}` and the next begins with `@layer base {`.
// Tailwind merges them, so the built CSS is unchanged, and the join drops that
// seam so readers see one block, exactly as before the split.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PART_LINE = /^@import "\.\/(styles\/[^"]+\.css)";\n$/;
const GLOBAL_CSS_ENTRY = 'app/globals.css';
const SEAM_CLOSE = '}\n';
const SEAM_OPEN = '@layer base {\n';

/**
 * Splits the entry into segments: `{ file, text, skip }`, where `skip` is the
 * number of leading lines of the file dropped by a seam. Null if a file is absent.
 */
function segments(entry, readPart) {
  const out = [];
  for (const raw of entry.split(/(?<=\n)/)) {
    const m = PART_LINE.exec(raw);
    if (!m) {
      out.push({ file: GLOBAL_CSS_ENTRY, text: raw, skip: 0, entryLine: true });
      continue;
    }
    const text = readPart(`app/${m[1]}`);
    if (text === null) return null;
    out.push({ file: `app/${m[1]}`, text, skip: 0 });
  }
  for (let i = 0; i + 1 < out.length; i += 1) {
    const a = out[i];
    const b = out[i + 1];
    if (a.entryLine || b.entryLine) continue;
    if (a.text.endsWith(SEAM_CLOSE) && b.text.startsWith(SEAM_OPEN)) {
      a.text = a.text.slice(0, -SEAM_CLOSE.length);
      b.text = b.text.slice(SEAM_OPEN.length);
      b.skip = 1;
    }
  }
  return out;
}

const readLocal = (root) => (file) => readFileSync(path.join(root, file), 'utf8');

/** The entry with every part import replaced by that part's content. */
export function readGlobalCss(root = process.cwd()) {
  const entry = readFileSync(path.join(root, GLOBAL_CSS_ENTRY), 'utf8');
  return segments(entry, readLocal(root)).map((s) => s.text).join('');
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
  const entry = showFileAt(ref, GLOBAL_CSS_ENTRY, root);
  if (entry === null) return null;
  const parts = segments(entry, (file) => showFileAt(ref, file, root));
  return parts === null ? null : parts.map((s) => s.text).join('');
}

/**
 * Maps a 1-based line of readGlobalCss() back to the file that holds it.
 * Returns { file, line } with a repo-relative file path.
 */
export function locateGlobalCssLine(lineNumber, root = process.cwd()) {
  const entry = readFileSync(path.join(root, GLOBAL_CSS_ENTRY), 'utf8');
  let joined = 0;
  let entryLine = 0;
  for (const s of segments(entry, readLocal(root))) {
    if (s.entryLine) {
      entryLine += 1;
      joined += 1;
      if (lineNumber === joined) return { file: GLOBAL_CSS_ENTRY, line: entryLine };
      continue;
    }
    const count = s.text.split('\n').length - 1;
    if (lineNumber <= joined + count) {
      return { file: s.file, line: lineNumber - joined + s.skip };
    }
    joined += count;
  }
  return { file: GLOBAL_CSS_ENTRY, line: lineNumber };
}
