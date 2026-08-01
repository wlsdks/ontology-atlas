import { AGENT_TOOL_RESULT_CHAR_CAP } from './types';

type ConceptEvidenceRow = Record<string, unknown>;

export interface ConceptEvidenceInput {
  payload: ConceptEvidenceRow;
  excerpt: string;
}

export interface PackedConceptEvidence {
  content: string;
  deliveredSlugs: string[];
  vaultChars: number;
  omittedCount: number;
}

/** Frontmatter keys that carry graph references, mirrored against the MCP engine by contract. */
export const GRAPH_FRONTMATTER_KEYS = [
  'domain',
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
  'broader',
] as const;

/** Keep vault prose visibly untrusted when it is sent back to a model. */
export function wrapUntrusted(text: string): string {
  return `<untrusted_vault_content>\n${text}\n</untrusted_vault_content>`;
}

// `description` is promoted into the untrusted excerpt when the body excerpt is empty.
// Sending both copies the same definition and steals comparison room from sibling rows.
const FRONTMATTER_DUPLICATE_KEYS = new Set(['slug', 'kind', 'title', 'description']);
const FRONTMATTER_VALUE_CHAR_CAP = 120;

function compactFrontmatter(value: unknown) {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const frontmatter: Record<string, string | number | boolean> = {};
  const relationCounts: Record<string, number> = {};
  const omittedKeys: string[] = [];
  const truncatedKeys: string[] = [];

  for (const [key, entry] of Object.entries(source)) {
    if (FRONTMATTER_DUPLICATE_KEYS.has(key)) continue;
    if ((GRAPH_FRONTMATTER_KEYS as readonly string[]).includes(key)) {
      const count = Array.isArray(entry)
        ? entry.filter((item) => typeof item === 'string' && item.trim()).length
        : typeof entry === 'string' && entry.trim()
          ? 1
          : 0;
      if (count > 0) relationCounts[key] = count;
      continue;
    }
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      if (trimmed.length > FRONTMATTER_VALUE_CHAR_CAP) {
        frontmatter[key] = `${trimmed.slice(0, FRONTMATTER_VALUE_CHAR_CAP - 1).trimEnd()}…`;
        truncatedKeys.push(key);
      } else {
        frontmatter[key] = trimmed;
      }
      continue;
    }
    if (typeof entry === 'number' || typeof entry === 'boolean') {
      frontmatter[key] = entry;
      continue;
    }
    if (entry !== null && entry !== undefined) omittedKeys.push(key);
  }

  const frontmatterInfo = {
    ...(omittedKeys.length > 0 ? { omittedKeys } : {}),
    ...(truncatedKeys.length > 0 ? { truncatedKeys } : {}),
  };
  return {
    frontmatter,
    ...(Object.keys(relationCounts).length > 0 ? { relationCounts } : {}),
    ...(omittedKeys.length > 0 || truncatedKeys.length > 0
      ? { frontmatterInfo }
      : {}),
  };
}

function compactNeighbors(slug: string, value: unknown, limit: number) {
  const source = Array.isArray(value) ? value : [];
  const neighbors = source.slice(0, limit).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const from = typeof row.from === 'string' ? row.from : '';
    const to = typeof row.to === 'string' ? row.to : '';
    const other = from === slug ? to : from;
    if (!other) return [];
    return [{
      slug: other,
      direction: from === slug ? 'outgoing' : 'incoming',
      type: typeof row.type === 'string' ? row.type : 'related_to',
      ...(typeof row.why === 'string' && row.why ? { why: row.why } : {}),
    }];
  });
  return {
    neighbors,
    neighborsInfo: {
      total: source.length,
      returned: neighbors.length,
      truncated: neighbors.length < source.length,
    },
  };
}

function compactConceptEvidenceRow(
  input: ConceptEvidenceInput,
  bodyCharCap: number,
  neighborLimit: number,
): ConceptEvidenceRow {
  const row = input.payload;
  const slug = typeof row.slug === 'string' ? row.slug : '';
  if (row.found === false) {
    return {
      slug,
      found: false,
      ...(typeof row.hint === 'string' ? { hint: row.hint } : {}),
    };
  }
  if (row.hasDocument === false) {
    return {
      slug,
      found: true,
      title: row.title,
      kind: row.kind,
      hasDocument: false,
      referencedBy: Array.isArray(row.referencedBy) ? row.referencedBy.slice(0, 8) : [],
      ...(typeof row.hint === 'string' ? { hint: row.hint } : {}),
    };
  }

  const originalBodyInfo =
    row.bodyInfo && typeof row.bodyInfo === 'object'
      ? (row.bodyInfo as Record<string, unknown>)
      : {};
  const totalChars =
    typeof originalBodyInfo.totalChars === 'number'
      ? originalBodyInfo.totalChars
      : input.excerpt.length;
  const description =
    row.frontmatter && typeof row.frontmatter === 'object'
      ? (row.frontmatter as Record<string, unknown>).description
      : null;
  const evidenceText =
    input.excerpt.trim() || (typeof description === 'string' ? description.trim() : '');
  const excerpt = evidenceText.slice(0, bodyCharCap);

  return {
    slug,
    found: true,
    title: row.title,
    kind: row.kind,
    hasDocument: true,
    path: row.path,
    mtime: row.mtime,
    ...compactFrontmatter(row.frontmatter),
    body: wrapUntrusted(excerpt),
    bodyInfo: {
      mode: 'excerpt',
      requestedMode: originalBodyInfo.mode ?? 'full',
      totalChars: Math.max(totalChars, evidenceText.length),
      returnedChars: excerpt.length,
      truncated: excerpt.length < totalChars,
    },
    ...compactNeighbors(slug, row.neighbors, neighborLimit),
  };
}

function packedConceptEvidence(content: string): PackedConceptEvidence {
  const payload = JSON.parse(content) as Record<string, unknown>;
  const rows = Array.isArray(payload.concepts)
    ? (payload.concepts as Array<Record<string, unknown>>)
    : [];
  const deliveredSlugs = rows.flatMap((row) =>
    row.found !== false && typeof row.slug === 'string' ? [row.slug] : [],
  );
  const vaultChars = rows.reduce((sum, row) => {
    const info =
      row.bodyInfo && typeof row.bodyInfo === 'object'
        ? (row.bodyInfo as Record<string, unknown>)
        : null;
    return sum + (typeof info?.returnedChars === 'number' ? info.returnedChars : 0);
  }, 0);
  return {
    content,
    deliveredSlugs,
    vaultChars,
    omittedCount: typeof payload.omitted === 'number' ? payload.omitted : 0,
  };
}

/**
 * `get_concepts` is a comparison tool. A long first row must not erase all other
 * candidates. Compact every row to the same evidence shape first; omit trailing
 * rows only when even the smallest honest form cannot fit the 6,000-char cap.
 */
export function packConceptEvidence(inputs: ConceptEvidenceInput[]): PackedConceptEvidence {
  const fullContent = JSON.stringify({ concepts: inputs.map((input) => input.payload) });
  if (fullContent.length <= AGENT_TOOL_RESULT_CHAR_CAP) {
    return packedConceptEvidence(fullContent);
  }

  const budgets = [
    { body: 240, neighbors: 5 },
    { body: 200, neighbors: 4 },
    { body: 160, neighbors: 3 },
    { body: 120, neighbors: 2 },
    { body: 80, neighbors: 1 },
    { body: 48, neighbors: 1 },
    { body: 24, neighbors: 1 },
  ];
  const hint =
    'Rows were compacted fairly. Check each *Info field, then use get_concept before editing.';

  for (const budget of budgets) {
    const concepts = inputs.map((input) =>
      compactConceptEvidenceRow(input, budget.body, budget.neighbors),
    );
    const content = JSON.stringify({
      concepts,
      compacted: true,
      requested: inputs.length,
      returned: concepts.length,
      omitted: 0,
      hint,
    });
    if (content.length <= AGENT_TOOL_RESULT_CHAR_CAP) {
      return packedConceptEvidence(content);
    }
  }

  const concepts = inputs.map((input) => compactConceptEvidenceRow(input, 48, 0));
  for (let keep = concepts.length; keep >= 0; keep -= 1) {
    const content = JSON.stringify({
      concepts: concepts.slice(0, keep),
      compacted: true,
      requested: inputs.length,
      returned: keep,
      omitted: concepts.length - keep,
      hint,
    });
    if (content.length <= AGENT_TOOL_RESULT_CHAR_CAP) {
      return packedConceptEvidence(content);
    }
  }

  throw new Error('Could not fit even an empty get_concepts result inside the result cap.');
}
