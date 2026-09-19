/**
 * **What the Library adds to the vault handoff, so a free question can be filed.**
 *
 * Measured in the installed app on 2026-09-19 (two originals, Claude ACP): a question typed
 * into the Library's composer went out as bare text, the agent answered in prose ("states it
 * as a bare 14 days on line 3"), and "Save answer" refused it as `no-cited-fact`. The
 * question door's own brief (`ask-brief.ts`) carries the citation rule; the composer carried
 * nothing, and every free turn in the Library is classified as an ask (`LibraryPage`
 * `handleTurnStarted`) and offered the save chip. The rule belongs to the session, so it holds
 * for whatever the person types. English, like the handoff it follows; the answer-language
 * sentence already tells the agent which language to answer in.
 */
export const LIBRARY_HANDOFF_APPENDIX = [
  "This folder is also a Library: `sources/` holds the originals as they arrived, and `wiki/` holds the pages written from them, one page per original.",
  "When the person asks about the folder's documents, read the wiki pages first and then the originals they cite; read a DOCX, XLSX, CSV or text original through the `read_source` tool, and a PDF with your own reader. Do not fill gaps from outside the folder.",
  "Put a citation after every fact in your answer, in the wiki's own form: `[[src:sources/<file>#p<page>]]` (`#r<row>` for a table, `#l<line>` for a text file). The person can save your answer as a wiki page as it stands, and a citation in any other form does not count as evidence there. When the documents do not say, say so.",
].join(" ");
