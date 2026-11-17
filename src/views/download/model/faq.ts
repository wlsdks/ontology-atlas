/**
 * The two questions the page's sections do not already answer, in reading order. What Atlas is,
 * which agents read it, its price and where it runs are said once each above: the hero, the loop,
 * the open-source section, the facts strip and the trust line.
 */
export const FAQ_KEYS = ['privacy', 'difference'] as const;

/**
 * An answer's first sentence, the gap after it and the rest, so the page sets the direct answer
 * in full ink and the detail a step quieter. The three parts join back into the answer unchanged:
 * the FAQPage markup carries the whole string and the page must show the same words. A sentence
 * ends at `.`, `!` or `?` before a space or the end, or at a full-width stop.
 */
export function splitAnswer(answer: string): { lead: string; gap: string; rest: string } {
  const match = /^([\s\S]*?(?:[.!?](?=\s|$)|[。！？]))(\s*)([\s\S]*)$/.exec(answer);
  if (!match) return { lead: answer, gap: '', rest: '' };
  return { lead: match[1], gap: match[2], rest: match[3] };
}

/**
 * schema.org FAQPage for the same questions and answers the page shows, word for word, so a search
 * or answer engine can quote them; markup that says more than the page would be a different claim.
 */
export function faqStructuredData(entries: readonly { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
}
