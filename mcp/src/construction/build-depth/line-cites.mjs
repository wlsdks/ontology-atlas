import { surveyEntry } from '../../analyze/survey/survey-paths.mjs';
import { decidesLine } from '../../evidence-search/symbol-context.mjs';
import { readPath } from '../session-reads.mjs';
import { escapeRegExp } from './name-matching.mjs';
import { readSmallSource } from './source-files.mjs';

/**
 * The symbol a body cites right after its path, in any of the forms builders write:
 * "`src/x.ts` `issueInvoice`", "src/x.ts issueInvoice", "src/x.py#Owner.method".
 */
export function citedSymbol(doc, path) {
  const body = String(doc?.body ?? '');
  const pattern = new RegExp(`${escapeRegExp(path)}\`?(?:#|:|\\s+|,\\s*)\`?([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)?)`, 'g');
  for (const match of body.matchAll(pattern)) {
    const symbol = match[1].replace(/\.$/, '');
    if (!/^(?:L\d+|and|or|the|was|is|not|in|at|line|lines)$/i.test(symbol)) return symbol;
  }
  return null;
}

/** Wording that states a rule: a condition, an order or a default. */
export const RULE_WORDS = /\b(?:if|unless|only|when|whenever|before|after|until|otherwise|default|defaults|first|must|requires?|refuses?|rejects?|never|skips?|falls? back|instead)\b/i;

/**
 * A cite of lines: `path:L12-L30`, `path#L12-30`, `path L12–30`, `path:12`. The
 * path takes any character a repository file name may hold (`app/[locale]/(shop)`,
 * `@scope/x`, `$id`, `+page`), so every cite the server emits parses.
 */
const LINE_CITE = /([^\s`'"<>|,;]{1,300}?\.[A-Za-z]{1,5})(?::|#|\s+)L?(\d+)(?:\s*[-–]\s*L?(\d+))?/g;
const OPENERS = /^[([{]/;

export function preSectionParagraphs(body) {
  const head = String(body ?? '').split(/^##\s/m)[0];
  return head.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

/**
 * The repository path a cited token names. Prose brackets around a cite join the
 * token (`(app/(shop)/page.tsx:L2)`), so each leading bracket is tried off in turn;
 * a path this session read wins, mapped back from the sub-root it was cited under,
 * then a file that exists in the repository.
 */
function citePath(token, reads, repoRoot) {
  const candidates = [token.replace(/^\.\//, '')];
  while (OPENERS.test(candidates.at(-1))) candidates.push(candidates.at(-1).slice(1).replace(/^\.\//, ''));
  const read = candidates.find((path) => reads?.has(path));
  if (read) return readPath(reads, read);
  return (repoRoot && candidates.find((path) => surveyEntry(repoRoot, path))) || candidates.at(-1);
}

export function lineCites(body, reads = null, repoRoot = null) {
  return [...String(body ?? '').matchAll(LINE_CITE)].map((match) => {
    const startLine = Number(match[2]);
    const endLine = Number(match[3] ?? match[2]);
    return { path: citePath(match[1], reads, repoRoot), startLine: Math.min(startLine, endLine), endLine: Math.max(startLine, endLine) };
  }).filter((cite) => cite.startLine > 0 && cite.endLine - cite.startLine < 400);
}

export function servedLines(reads, cite) {
  const ranges = reads?.get(cite.path) ?? [];
  for (let line = cite.startLine; line <= cite.endLine; line += 1) {
    if (!ranges.some((range) => range.startLine <= line && line <= range.endLine)) return false;
  }
  return true;
}

/** Whether the cited lines of a source text hold a condition, a branch, a throw or a default. */
export function linesDecide(text, cite) {
  return text.split(/\r?\n/).slice(cite.startLine - 1, cite.endLine).some(decidesLine);
}

/** Whether a cited range lies inside a file the repository holds. */
export function citedLinesExist(repoRoot, cite) {
  if (!repoRoot) return true;
  const text = readSmallSource(repoRoot, cite.path);
  return text !== null && text.split(/\r?\n/).length >= cite.endLine;
}

export function citedLinesDecide(repoRoot, cite) {
  if (!repoRoot) return true;
  const text = readSmallSource(repoRoot, cite.path);
  if (text === null) return false;
  return linesDecide(text, cite);
}
