export const KEEP_TERMS = [
  'MCP',
  'ACP',
  'API key',
  'Git',
  'PR',
  'Markdown',
  'CLI',
  'frontmatter',
  'Claude Code',
  'Codex',
  'GitHub',
  'macOS',
  'Windows',
  'Apple Silicon',
  'Developer ID',
  'SmartScreen',
  'Ontology Atlas',
  'Anthropic',
  'OpenAI',
  'Google',
  'Gemini',
  'Ollama',
  'LM Studio',
  'llama.cpp',
  'Jev',
  'Notion',
  'Confluence',
  'Jira',
  'Intel',
  'Next.js',
  'TypeScript',
  'Tauri',
  'MIT',
];

export const KEEP_TERM_EXEMPT = { ko: ['Markdown'] };

function escapeRegExp(term) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keepTermPattern(term, flags = '') {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])`, flags);
}

export function keepTermsIn(text, terms = KEEP_TERMS) {
  return terms.filter((term) => keepTermPattern(term).test(text));
}

export function stripKeepTerms(text, terms = KEEP_TERMS) {
  return terms.reduce((rest, term) => rest.replace(keepTermPattern(term, 'g'), ' '), text);
}
