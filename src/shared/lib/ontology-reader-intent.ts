export const ONTOLOGY_READER_INTENTS = [
  "planning",
  "marketing",
  "leadership",
  "developer",
  "agent",
] as const;

export type OntologyReaderIntent = (typeof ONTOLOGY_READER_INTENTS)[number];

export function parseOntologyReaderIntent(value: string | null): OntologyReaderIntent | null {
  if (!value) return null;
  return (ONTOLOGY_READER_INTENTS as readonly string[]).includes(value)
    ? (value as OntologyReaderIntent)
    : null;
}
