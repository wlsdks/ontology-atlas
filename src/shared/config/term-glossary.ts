export const TERM_GLOSSARY = {
  mcp: { label: 'MCP' },
  acp: { label: 'ACP' },
  apiKey: { label: 'API key' },
  cli: { label: 'CLI' },
} as const;

export type GlossaryTerm = keyof typeof TERM_GLOSSARY;

export const GLOSSARY_TERMS = Object.keys(TERM_GLOSSARY) as GlossaryTerm[];
