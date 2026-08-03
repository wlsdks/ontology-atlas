/**
 * The in-app agent can read only the vault. It may curate meaning, but it
 * cannot certify source-backed competency answers without the MCP builder's
 * repository evidence and quantifier-aware validator.
 */
export const SOURCE_BACKED_COMPETENCY_MESSAGE =
  'Source-backed competency qualification must be created through the MCP builder.';

export function containsCompetencyQualification(content: unknown): boolean {
  return typeof content === 'string' && /^## Competency answers$/m.test(content);
}

export function changesCompetencyQualification(
  before: string | null,
  after: string,
): boolean {
  const afterSection = competencySection(after);
  return afterSection !== null && competencySection(before) !== afterSection;
}

function competencySection(content: string | null): string | null {
  if (content === null) return null;
  const match = /^## Competency answers$/m.exec(content);
  if (!match || match.index === undefined) return null;
  const remainder = content.slice(match.index + match[0].length);
  const nextHeading = /\n## (?!#)/.exec(remainder);
  return content
    .slice(match.index, nextHeading ? match.index + match[0].length + nextHeading.index : undefined)
    .trimEnd();
}
