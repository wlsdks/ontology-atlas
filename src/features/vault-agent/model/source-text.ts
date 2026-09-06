import { WIKI_SOURCES_DIR } from '@/shared/lib/wiki-page-schema';

/**
 * **What Atlas can honestly read out of a raw source, with the parsers it already has.**
 *
 * Compile through a coding agent works because the agent brings its own PDF reader. A
 * local model brings nothing: it reaches the folder only through the tools handed to it,
 * so the question "can this file be opened" has to be answered here, once, in a way the
 * screen can repeat to a person.
 *
 * Three outcomes, never two:
 *
 * - `readable` — text this bundle can decode with no dependency at all: Markdown, plain
 *   text, CSV, JSON, and HTML with its tags stripped.
 * - `needs-a-parser` — PDF, Word, PowerPoint, Excel and their older siblings. Atlas
 *   refuses them **by name**, because "could not read it" and "cannot read this format"
 *   are different facts to a person deciding whether to install a coding agent.
 * - `unknown-format` — an image, an archive, a binary nobody named. Guessing UTF-8 on it
 *   would hand a model mojibake and let it write a page about noise.
 *
 * No parser is added here. That is deferred deliberately: shipping a PDF extractor is a
 * dependency, a licence, and a new class of wrong text, and none of it is needed to prove
 * that a local model can compile the formats a folder already holds in plain bytes.
 */

/** Formats decoded as text. `htm` is `html` under a shorter name, not a second format. */
export const READABLE_SOURCE_FORMATS: readonly string[] = [
  'md',
  'markdown',
  'txt',
  'text',
  'csv',
  'tsv',
  'json',
  'html',
  'htm',
];

/** Formats Atlas names and refuses, because reading them needs a parser it does not ship. */
export const PARSER_SOURCE_FORMATS: readonly string[] = [
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'key',
  'pages',
  'numbers',
  'rtf',
  'odt',
  'ods',
  'odp',
];

/**
 * The character cap on one `read_source_text` result.
 *
 * Every character read is a character that leaves this computer on the next round trip,
 * counted into the turn's measured `vaultChars` and written to the audit line. Five
 * sources at this cap is 40,000 characters, exactly `AGENT_TURN_VAULT_CHAR_CAP` — so the
 * bound a person reads on the card and the bound the loop actually enforces are the same
 * number, rather than two that drift.
 */
export const SOURCE_TEXT_CHAR_CAP = 8_000;

export type SourceFormatVerdict = 'readable' | 'needs-a-parser' | 'unknown-format';

/** Which of the three buckets a source falls in, from its extension alone. */
export function classifySourceFormat(format: string): SourceFormatVerdict {
  const lowered = format.trim().toLowerCase().replace(/^\./, '');
  if (READABLE_SOURCE_FORMATS.includes(lowered)) return 'readable';
  if (PARSER_SOURCE_FORMATS.includes(lowered)) return 'needs-a-parser';
  return 'unknown-format';
}

/**
 * Why a path may not be used to name a source, or null when its shape is acceptable.
 *
 * Shape only. Membership of the folder's own inventory is the second gate and lives in
 * the reader — a well-shaped path to a file this folder does not hold is still refused.
 */
export type SourcePathProblem =
  | 'empty-path'
  | 'absolute-path'
  | 'backslash'
  | 'relative-segment'
  | 'outside-sources'
  | 'not-a-file'
  | 'control-character';

export function sourcePathProblem(path: unknown): SourcePathProblem | null {
  if (typeof path !== 'string') return 'empty-path';
  const raw = path.trim();
  if (!raw) return 'empty-path';
  if (/[\u0000-\u001f\u007f]/.test(raw)) return 'control-character';
  // A Windows separator is not a path this vault uses, and normalising it would quietly
  // accept `sources\..\..\.ssh\id_rsa` on a platform that reads it as an escape.
  if (raw.includes('\\')) return 'backslash';
  if (raw.startsWith('/') || raw.startsWith('~') || /^[a-z]:/i.test(raw)) return 'absolute-path';
  if (raw.endsWith('/')) return 'not-a-file';
  const segments = raw.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return 'relative-segment';
  }
  if (segments[0] !== WIKI_SOURCES_DIR || segments.length < 2) return 'outside-sources';
  return null;
}

/**
 * HTML with its markup taken out.
 *
 * `<script>` and `<style>` bodies are dropped whole rather than untagged: their contents
 * are code, and a model handed a minified bundle as "what the document says" will write
 * facts about it. Entities are decoded only for the five that change meaning; a numeric
 * entity left alone is legible, and a half-written decoder is not.
 */
export function stripHtml(html: string): string {
  const withoutCode = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const withBreaks = withoutCode
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return withBreaks
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

export interface DecodedSourceText {
  text: string;
  /** Characters the file holds, before the cap. */
  totalChars: number;
  /** True when `text` stops short of `totalChars`. */
  truncated: boolean;
}

/**
 * Bytes → the text a model is allowed to see, capped.
 *
 * The cap is applied **after** stripping, so an HTML file's budget is spent on its prose
 * rather than on its markup. `truncated` is reported rather than hidden: a page written
 * from the first 8,000 characters of a 90,000-character file must be able to say so, and
 * the proposal validator refuses to call such a page complete.
 */
export function decodeSourceText(bytes: ArrayBuffer, format: string): DecodedSourceText {
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const lowered = format.trim().toLowerCase().replace(/^\./, '');
  const text = lowered === 'html' || lowered === 'htm' ? stripHtml(decoded) : decoded;
  const totalChars = text.length;
  return {
    text: totalChars > SOURCE_TEXT_CHAR_CAP ? text.slice(0, SOURCE_TEXT_CHAR_CAP) : text,
    totalChars,
    truncated: totalChars > SOURCE_TEXT_CHAR_CAP,
  };
}

/**
 * What Atlas measured in the text it handed over — the material a citation is checked
 * against.
 *
 * `validateWikiPage` captures a citation's anchor and never resolves it (its own header
 * says nothing there reads the filesystem), so `[[src:sources/notes.md#p47]]` passes on a
 * three-paragraph file. On this route Atlas is the one holding the bytes, so it is the
 * only party that can tell the difference, and the proposal validator does (PO evidence,
 * 2026-09-06). A page whose citations open nothing is the exact failure the citation
 * format exists to prevent.
 */
export interface SourceMeasurement {
  paragraphs: number;
  lines: number;
  /** Heading slugs found in the text, for an `h:<slug>` anchor. */
  headings: string[];
}

/** `## Quarter plan` → `quarter-plan`. The same shape the citation anchor allows. */
function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Blank-line separated blocks, in order, with empties dropped. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== '');
}

export function measureSourceText(text: string): SourceMeasurement {
  const headings: string[] = [];
  for (const line of text.split('\n')) {
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const slug = headingSlug(match[1]!);
    if (slug && !headings.includes(slug)) headings.push(slug);
  }
  return {
    paragraphs: splitParagraphs(text).length,
    lines: text === '' ? 0 : text.split('\n').length,
    headings,
  };
}

/**
 * The text as the model sees it: every paragraph carries the number a citation must use.
 *
 * Without the markers a writer guesses an anchor, and a guessed anchor is what a reader
 * finds broken when they press it. With them the number is in front of the sentence it
 * belongs to, and Atlas can check the answer afterwards.
 */
export function numberParagraphs(text: string): string {
  return splitParagraphs(text)
    .map((block, index) => `[p${index + 1}] ${block}`)
    .join('\n\n');
}

/**
 * Whether one citation anchor resolves inside what was actually read.
 *
 * `s<n>` and `s<n>r<n>` name a spreadsheet sheet. No format this reader can open has
 * sheets, so an anchor claiming one is refused rather than waved through — it can only
 * have come from the template.
 */
export function anchorResolves(anchor: string, measure: SourceMeasurement): boolean {
  const paragraph = /^p(\d+)$/.exec(anchor);
  if (paragraph) {
    const n = Number(paragraph[1]);
    return n >= 1 && n <= measure.paragraphs;
  }
  const line = /^[lr](\d+)$/.exec(anchor);
  if (line) {
    const n = Number(line[1]);
    return n >= 1 && n <= measure.lines;
  }
  const heading = /^h:(.+)$/.exec(anchor);
  if (heading) return measure.headings.includes(heading[1]!);
  return false;
}
