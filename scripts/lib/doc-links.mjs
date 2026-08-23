// The pure part of the broken-link check.
//
// This is decay the repository actually suffered: regenerating the vault removes
// node files, but the prose citing them stays. A 3,419-line suite of 2,126 prose
// pin assertions caught none of it (the sentences had not changed). Links are the
// opposite — **whether the target exists is machine-decidable.**

/** Link syntax also appears as examples inside code fences — checking examples yields false positives. */
export function stripFencedBlocks(markdown) {
  const lines = markdown.split('\n');
  let fenced = false;
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return '';
    }
    return fenced ? '' : line;
  });
}

/** Inline code (`[a](b)` written to explain the syntax) is not a link either. */
function stripInlineCode(line) {
  return line.replace(/`[^`]*`/g, (match) => ' '.repeat(match.length));
}

export function collectMarkdownLinks(markdown) {
  const links = [];
  stripFencedBlocks(markdown).forEach((line, index) => {
    for (const match of stripInlineCode(line).matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push({ line: index + 1, target: match[1] });
    }
  });
  return links;
}

/** Raw HTML picture/img assets used in the GitHub README are local promises too, even though nothing clicks them. */
export function collectHtmlAssetRefs(markdown) {
  const refs = [];
  stripFencedBlocks(markdown).forEach((line, index) => {
    for (const tagMatch of line.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
      for (const attrMatch of tagMatch[0].matchAll(/\b(src|srcset)\s*=\s*(["'])(.*?)\2/gi)) {
        const [, attribute, , value] = attrMatch;
        const candidates = attribute.toLowerCase() === 'srcset' && !isExternalTarget(value)
          ? value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0])
          : [value.trim()];
        for (const target of candidates) {
          if (target && !isExternalTarget(target)) refs.push({ line: index + 1, target });
        }
      }
    }
  });
  return refs;
}

export function isExternalTarget(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');
}

/**
 * Repository-path citations inside backticks. This reads **path tokens**, not
 * sentences.
 *
 * The narrow scope comes from measurement: matching any backticked path yields
 * 168 hits, mostly vault-relative examples like `domains/foo.md` or build output.
 * Narrowing to `.md` paths anchored at the repository root yields 3 hits out of
 * 232, and **all three were real**.
 */
const REPO_TOP_LEVEL = new Set([
  'src',
  'app',
  'docs',
  'scripts',
  'cli',
  'mcp',
  'tests',
  'messages',
  'samples',
  '.claude',
  '.agents',
  '.codex',
  '.github',
]);

/**
 * **Citations whose evidence is a path not in the repository** — a layer the
 * check above could not see in principle, because it was outside the allowlist
 * (found by measurement, 2026-08-15).
 *
 * `REPO_TOP_LEVEL` is a hand-maintained 13-line allowlist, so **for a citation
 * pointing at a directory not on that list, no check existed at all.** Through
 * that gap, the colour charter's evidence (`signal tone 3 types`) and the bar-colouring
 * discipline's evidence each pointed at a `.md` inside a gitignored scratch
 * folder for three weeks — files that are not on this machine either, and for
 * anyone who clones, the **whole folder** is missing. One lint message was citing
 * that non-existent file to a developer as its evidence.
 *
 * ## Why dot-directories rather than "everything off the list"
 *
 * Inventory before switching it on (2026-08-15): **255** citations sit off the
 * list and most are legitimate — `@docs/…` (import syntax) 35 ·
 * `domains/foo.md` (vault-relative examples) 10 · root filenames 199. Catching
 * them all buries the signal in noise. A citation whose evidence is a
 * **gitignored dot-directory**, by contrast, is by definition something nobody
 * can open.
 *
 * These are caught **unconditionally** rather than via `exists()` — the folder
 * exists only on the author's machine, so an existence test would make a check
 * that is green locally and red in CI (a gate that differs per machine is not a
 * gate).
 */
const KEPT_DOT_DIRS = new Set(['.claude', '.agents', '.codex', '.github']);

/**
 * Exception — naming **artifacts created at runtime in the user's folder** is
 * legitimate. These are not files the repository should hold; the citation
 * describes where they appear.
 */
const RUNTIME_ARTIFACT_DOT_DIRS = new Set([
  '.ontology-atlas', // Agent records and imports inside the vault — created in the user's folder
  '.tmp', // State files the check scripts create
]);

export function collectProseDocRefs(markdown) {
  const refs = [];
  stripFencedBlocks(markdown).forEach((line, index) => {
    for (const match of line.matchAll(/`([^`\s]+\.md)`/g)) {
      const target = match[1];
      if (/[*?{}<>|[\]]/.test(target)) continue; // Globs and placeholders
      if (isExternalTarget(target)) continue;
      const relative = target.startsWith('./') || target.startsWith('../');
      const head = target.split('/')[0];
      const ghostDir =
        !relative &&
        head.startsWith('.') &&
        target.includes('/') &&
        !KEPT_DOT_DIRS.has(head) &&
        !RUNTIME_ARTIFACT_DOT_DIRS.has(head);
      if (ghostDir) {
        refs.push({ line: index + 1, target, relative: false, ghost: true });
        continue;
      }
      if (!relative && !REPO_TOP_LEVEL.has(head)) continue;
      refs.push({ line: index + 1, target, relative });
    }
  });
  return refs;
}

/**
 * Naming deleted files **is the job** of a historical document — a changelog
 * writing "deleted `docs/GUIDE.md`" is a record, not decay. So the prose
 * path-citation check is skipped here. Links are not skipped: a link is a promise
 * that it opens when clicked, in a historical document too.
 *
 * Measured: without this exclusion, historical documents alone produce 24 hits,
 * burying the 3 in current documents.
 */
export function isHistoricalDoc(relativePath) {
  const normalized = relativePath.split('\\').join('/');
  return (
    /(^|\/)CHANGELOG\.md$/.test(normalized) ||
    normalized === 'docs/DECISIONS.md' ||
    /^docs\/(archive|audits|plans|prototypes)\//.test(normalized) ||
    /^docs\/benchmark\/results\//.test(normalized)
  );
}
