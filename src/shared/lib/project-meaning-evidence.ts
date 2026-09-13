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

function wellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function parseSourceRangeCitation(value: string): string | null {
  if (!value.startsWith("source:")) return null;
  const match = /^source:(.+)#L([1-9][0-9]*)-L([1-9][0-9]*)@sha256:([a-f0-9]{64})$/.exec(value);
  if (!match || /[:#]/.test(match[1]) || !wellFormedUnicode(match[1]) || !safeRelativePath(match[1]) || match[1].includes("`") || match[1].includes(", ")) return null;
  const startLine = Number(match[2]);
  const endLine = Number(match[3]);
  return Number.isSafeInteger(startLine) && Number.isSafeInteger(endLine) && endLine >= startLine ? match[1] : null;
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
    const row = /^- (Evidence|Paths): (.+)$/.exec(line);
    if (!row) continue;
    const values = row[2].split(", ");
    if (values.length === 0) return [];
    for (const value of values) {
      const literal = /^`([^`]+)`$/.exec(value);
      if (!literal) return [];
      const rangePath = row[1] === "Evidence" ? parseSourceRangeCitation(literal[1]) : null;
      if (literal[1].startsWith("source:") && !rangePath) return [];
      if (row[1] === "Paths" && literal[1].startsWith("source:")) return [];
      const path = rangePath ?? literal[1];
      if (!safeRelativePath(path)) return [];
      paths.add(path);
    }
  }

  return [...paths].sort((left, right) => left.localeCompare(right, "en"));
}
