function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function decode(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '');
  try { return JSON.parse(trimmed); } catch { return null; }
}

/** Only actual full, untruncated successful result objects become portable evidence. */
export function fullBodyResultRows(rawOutput: unknown): Array<Record<string, unknown>> {
  const found = new Map<string, Record<string, unknown>>();
  const visited = new Set<object>();
  let budget = 20_000;
  const walk = (raw: unknown, depth: number) => {
    if (depth > 16 || budget-- <= 0) return;
    const value = decode(raw);
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) { value.forEach((item) => walk(item, depth + 1)); return; }
    const row = value as Record<string, unknown>;
    if (row.isError === true || row.error) return;
    const bodyInfo = object(row.bodyInfo);
    if (typeof row.slug === 'string' && typeof row.body === 'string' && object(row.frontmatter)
      && bodyInfo?.mode === 'full' && bodyInfo.truncated === false
      && bodyInfo.returnedChars === row.body.length) {
      found.set(row.slug, row);
    }
    for (const [key, child] of Object.entries(row)) {
      if (key === 'body' || key === 'frontmatter') continue;
      if (child && (typeof child === 'object' || ['text', 'content', 'output', 'result'].includes(key))) walk(child, depth + 1);
    }
  };
  walk(rawOutput, 0);
  return [...found.values()];
}

/** Keep the real measurement, including unknown coverage. Machine-local roots are omitted. */
export function architectureResultRows(rawOutput: unknown): Array<Record<string, unknown>> {
  const results: Record<string, unknown>[] = [];
  const stripRoots = (value: unknown): unknown => Array.isArray(value) ? value.map(stripRoots) : object(value)
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => key !== 'rootPath').map(([key, child]) => [key, stripRoots(child)])) : value;
  const walk = (raw: unknown, depth: number) => {
    if (depth > 12 || results.length >= 20) return;
    const value = decode(raw);
    if (Array.isArray(value)) { value.forEach((child) => walk(child, depth + 1)); return; }
    const row = object(value);
    if (!row || row.isError === true || row.error) return;
    if (row.contract === 'architectureBrief:v1' && object(row.measured) && object(row.profile) && object(row.conformance)) {
      results.push(stripRoots(row) as Record<string, unknown>); return;
    }
    for (const key of ['structuredContent', 'content', 'text', 'output', 'result']) if (row[key]) walk(row[key], depth + 1);
  };
  walk(rawOutput, 0);
  return [...new Map(results.map((result) => [JSON.stringify(result), result])).values()];
}
