import { createWikiTermIntern, wikiRetrievalPage, type WikiRetrievalPage, type WikiTermIntern } from "@/entities/docs-vault";
import { compactOntologyDescription } from "@/shared/lib/concept-display/ontology-description";
import { WIKI_CITATION_PATTERN } from "@/shared/lib/library/wiki-page-schema";
import { wikiPageFacts, type WikiPageFacts } from "@/shared/lib/library/wiki-folder";
import { deskPageClaims, type DeskPageClaims } from "../lib/questions/desk-search";
import { isRetainedAnswerPath } from "../lib/questions/answer-revision";
import { answerTextHash } from "../lib/questions/answer-revision-store";
import { sectionSlices } from "../lib/wiki/section-slices";

/**
 * Everything the Library reads of one version of a wiki page, so the page text is dropped once
 * this exists: the wiki contract's facts, the terms Compile retrieves by, the desk's claims, the
 * graph card's sentence and citation count, and, for a saved answer, the hash of its text.
 */
export interface LibraryPageFacts {
  readonly wiki: WikiPageFacts;
  readonly retrieval: WikiRetrievalPage;
  readonly claims: DeskPageClaims;
  /** The card's sentence from `## Summary`; `undefined` when the page has none, so the frontmatter `summary:` stands. */
  readonly summary: string | null | undefined;
  /** Citations in the page; `null` for an empty file, which a card shows as unknown. */
  readonly cites: number | null;
  /** SHA-256 of a saved answer's text (`wiki/answers/`); absent for any other page. */
  readonly answerHash?: string;
}

function summarySentence(raw: string): string | null | undefined {
  const section = raw ? sectionSlices(raw).sections.get("Summary") : undefined;
  if (section === undefined) return undefined;
  const sentence = compactOntologyDescription(section);
  return sentence === undefined ? null : (JSON.parse(JSON.stringify(sentence)) as string);
}

/** O(page bytes); the text is read for this call only and nothing returned refers to it. */
export function libraryPageFacts(raw: string, intern: WikiTermIntern = createWikiTermIntern()): LibraryPageFacts {
  return {
    wiki: wikiPageFacts(raw),
    retrieval: wikiRetrievalPage(raw, intern),
    claims: deskPageClaims(raw),
    summary: summarySentence(raw),
    cites: raw ? [...raw.matchAll(new RegExp(WIKI_CITATION_PATTERN, "g"))].length : null,
  };
}

/** A saved answer's facts carry the hash of its text, which its next version records. */
export async function withAnswerHash(slug: string, raw: string, facts: LibraryPageFacts): Promise<LibraryPageFacts> {
  if (!isRetainedAnswerPath(slug)) return facts;
  try {
    return { ...facts, answerHash: await answerTextHash(raw) };
  } catch {
    return facts;
  }
}
