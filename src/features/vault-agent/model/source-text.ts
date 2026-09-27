import { WIKI_SOURCES_DIR } from '@/shared/lib/wiki-page-schema';

/**
 * What Atlas can honestly read without a parser dependency: a source is `readable`,
 * needs a parser (refused by name), or is an unknown format (never guessed as UTF-8).
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

/** Characters per read; five reads equal `AGENT_TURN_VAULT_CHAR_CAP`, so the card and the loop state one bound. */
export const SOURCE_TEXT_CHAR_CAP = 8_000;

export type SourceFormatVerdict = 'readable' | 'needs-a-parser' | 'unknown-format';

/** Which of the three buckets a source falls in, from its extension alone. */
export function classifySourceFormat(format: string): SourceFormatVerdict {
  const lowered = format.trim().toLowerCase().replace(/^\./, '');
  if (READABLE_SOURCE_FORMATS.includes(lowered)) return 'readable';
  if (PARSER_SOURCE_FORMATS.includes(lowered)) return 'needs-a-parser';
  return 'unknown-format';
}

/** Why a path may not name a source, by shape only; folder membership is the reader's second gate. */
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

/** HTML without markup; script and style bodies drop whole, and only meaning-changing entities decode. */
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

/** Bytes to capped model text, capped after stripping; `truncated` lets the page say it was partial. */
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

/** What the handed-over text holds, so citation anchors are checked; `validateWikiPage` never resolves them. */
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

/** Each paragraph carries the number a citation must use, so the writer never guesses an anchor. */
export function numberParagraphs(text: string): string {
  return splitParagraphs(text)
    .map((block, index) => `[p${index + 1}] ${block}`)
    .join('\n\n');
}

/** Whether an anchor resolves in what was read; sheet anchors are refused because no readable format has sheets. */
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
