import type { LibrarySourceRow, LibraryWikiPage } from "@/entities/docs-vault";
import { WIKI_DIR } from "@/shared/lib/library/wiki-page-schema";

import { isRetainedAnswerPath } from "../../questions/answer-revision";

/** Existing pages a brief lists at most: those citing the request's sources first, then the newest. */
export const COMPILE_BRIEF_PAGE_CAP = 200;
const PAGE_TITLE_CHARS = 80;
const PAGE_CITES_SHOWN = 2;
const EARLIEST_RECORDED = Date.UTC(2000, 0, 1);
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;
const utf8 = new TextEncoder();

export function byteLength(text: string): number {
  return utf8.encode(text).length;
}

/** Line breaks, other control characters and bidirectional overrides. */
const UNSAFE_IN_LINE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/gu;

/**
 * A vault-derived string (title, path, slug, folder) as one inert line. A title holding a newline
 * would otherwise start a line of its own, which reads to the agent as an instruction.
 */
export function oneLine(value: string): string {
  return value.replace(UNSAFE_IN_LINE, " ");
}

/** The instant a page records in `compiled_at`, or -1 when it has none worth believing. */
function recordedInstant(value: string | null, now: number): number {
  if (value === null || !ISO_DATE_PREFIX.test(value)) return -1;
  const instant = Date.parse(value);
  return Number.isNaN(instant) || instant > now || instant < EARLIEST_RECORDED ? -1 : instant;
}

export interface BriefPage {
  page: LibraryWikiPage;
  line: string;
}

interface BriefPages {
  listed: BriefPage[];
  /** Pages under `wiki/` the brief does not list. */
  omitted: number;
}

function pageLine(page: LibraryWikiPage, targets: ReadonlySet<string>): string {
  const chars = [...oneLine(page.title)];
  const title = chars.length > PAGE_TITLE_CHARS ? `${chars.slice(0, PAGE_TITLE_CHARS - 1).join("")}…` : chars.join("");
  // The request's own sources first: they are why this page is listed.
  const cites = [
    ...page.sourcePaths.filter((path) => targets.has(path)),
    ...page.sourcePaths.filter((path) => !targets.has(path)),
  ];
  const shown = cites.slice(0, PAGE_CITES_SHOWN).map(oneLine).join(", ");
  const more = cites.length > PAGE_CITES_SHOWN ? ` (+${cites.length - PAGE_CITES_SHOWN})` : "";
  return `- ${oneLine(page.slug)}.md — ${title}${shown ? ` — ${shown}${more}` : ""}`;
}

/**
 * At most `COMPILE_BRIEF_PAGE_CAP` pages: those citing a requested source or due for its review,
 * then the newest by `compiled_at`, undated last. O(P log P) for the sort of P pages.
 */
export function selectBriefPages(
  pages: readonly LibraryWikiPage[],
  targets: readonly LibrarySourceRow[],
  now: number,
  budget: number,
): BriefPages {
  const targetPaths = new Set(targets.map((row) => row.path));
  const reviewSlugs = new Set(targets.flatMap((row) => row.reviewPages ?? []));
  const citing: LibraryWikiPage[] = [];
  const others: { page: LibraryWikiPage; at: number }[] = [];
  for (const page of pages) {
    if (reviewSlugs.has(page.slug) || page.sourcePaths.some((path) => targetPaths.has(path))) citing.push(page);
    else others.push({ page, at: recordedInstant(page.compiledAt, now) });
  }
  others.sort((a, b) => b.at - a.at);
  const listed: BriefPage[] = [];
  let bytes = 0;
  for (const page of [...citing, ...others.map((entry) => entry.page)]) {
    if (listed.length >= COMPILE_BRIEF_PAGE_CAP) break;
    const line = pageLine(page, targetPaths);
    bytes += byteLength(line) + 1;
    if (bytes > budget) break;
    listed.push({ page, line });
  }
  return { listed, omitted: pages.length - listed.length };
}

/** Whether the local reader may open this listed page: a safe inventoried `wiki/` address, never a retained answer. Listing grants no write authority. */
export function isLocallyReadableWikiSlug(slug: string): boolean {
  return slug.startsWith(`${WIKI_DIR}/`) &&
    !/[\\#?\u0000-\u001f\u007f]/.test(slug) &&
    !slug.split("/").some((part) => !part || part.startsWith(".") || part.startsWith("_")) &&
    slug !== `${WIKI_DIR}/answers` && !isRetainedAnswerPath(slug);
}
