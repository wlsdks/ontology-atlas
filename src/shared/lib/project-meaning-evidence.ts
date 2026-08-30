const COMPETENCY_HEADING = "## Competency answers";

function safeRelativePath(value: string): boolean {
  if (value === ".") return true;
  return value.length > 0
    && value.length <= 500
    && value.trim() === value
    && !value.startsWith("/")
    && !/^[A-Za-z]:[\\/]/.test(value)
    && !value.includes("\\")
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/**
 * Browser mirror of the MCP persisted-competency evidence extractor. Keep the
 * two implementations pinned with the project-source-connect contract test.
 */
export function extractProjectMeaningEvidencePaths(body: unknown): string[] {
  if (typeof body !== "string") return [];
  const heading = /^## Competency answers$/gm;
  const matches = [...body.matchAll(heading)];
  if (matches.length !== 1) return [];

  const start = (matches[0].index ?? 0) + COMPETENCY_HEADING.length;
  const remainder = body.slice(start);
  const nextHeading = /\n## (?!#)/.exec(remainder);
  const section = remainder.slice(0, nextHeading?.index ?? remainder.length);
  const paths = new Set<string>();

  for (const line of section.split("\n")) {
    const row = /^- (?:Evidence|Paths): (.+)$/.exec(line);
    if (!row) continue;
    const values = row[1].split(", ");
    if (values.length === 0) return [];
    for (const value of values) {
      const literal = /^`([^`]+)`$/.exec(value);
      if (!literal || !safeRelativePath(literal[1])) return [];
      paths.add(literal[1]);
    }
  }

  return [...paths].sort((left, right) => left.localeCompare(right, "en"));
}
