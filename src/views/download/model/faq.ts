/** The questions the download page answers in plain sentences, in reading order. */
export const FAQ_KEYS = ['what', 'agents', 'privacy', 'price', 'difference', 'platforms'] as const;

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
