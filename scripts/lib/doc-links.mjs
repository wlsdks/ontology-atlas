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

/**
 * GitHub's heading anchors, computed the way GitHub computes them: strip
 * formatting, lowercase, drop everything that is not a letter, digit, `_`,
 * space or `-`, then spaces to `-`. A repeated heading gets `-1`, `-2`, ...
 *
 * Why this belongs in the link gate: the file-existence half was already
 * machine-decidable, but a link was only ever checked up to the `#`. A section
 * rename left it green and the reader stranded — measured once in this
 * repository, where a citation pointed at a heading in the root agent guide that
 * had not existed for months.
 */
export function headingAnchorSlug(heading) {
  return heading
    .replace(/`/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|\*/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s-]/gu, '')
    .replace(/\s/g, '-');
}

/** Every fragment a link may target in one markdown file: headings plus explicit ids. */
export function collectAnchors(markdown) {
  const anchors = new Set();
  const seen = new Map();
  for (const line of stripFencedBlocks(markdown)) {
    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const base = headingAnchorSlug(heading[2]);
      if (base) {
        const used = seen.get(base) ?? 0;
        seen.set(base, used + 1);
        anchors.add(used === 0 ? base : `${base}-${used}`);
      }
    }
    for (const match of line.matchAll(/<a\b[^>]*\b(?:name|id)\s*=\s*(["'])(.*?)\1/gi)) {
      anchors.add(match[2].toLowerCase());
    }
    for (const match of line.matchAll(/\{#([^}\s]+)\}/g)) anchors.add(match[1].toLowerCase());
  }
  return anchors;
}

/** `<a href="#anchor">` in raw HTML is a promise the same way a markdown link is. */
export function collectHtmlLinks(markdown) {
  const links = [];
  stripFencedBlocks(markdown).forEach((line, index) => {
    for (const tag of line.matchAll(/<a\b[^>]*>/gi)) {
      const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(tag[0]);
      if (href) links.push({ line: index + 1, target: href[2].trim() });
    }
  });
  return links;
}

/** The fragment of a link target, lowercased and percent-decoded, or null. */
export function linkFragment(target) {
  const index = target.indexOf('#');
  if (index === -1 || index === target.length - 1) return null;
  const raw = target.slice(index + 1);
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
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
 * Citations to a gitignored dot-directory are caught unconditionally, not via `exists()`: the
 * folder exists on one machine only, so an existence test would be green locally and red in CI.
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
