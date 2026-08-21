export type OntologyChangeOperation =
  | 'create'
  | 'update'
  | 'relate'
  | 'remove'
  | 'rename'
  | 'merge'
  | 'write';

export interface OntologyChangeField {
  key: string;
  before?: unknown;
  after: unknown;
}

export interface OntologyRelationChange {
  from: string;
  type: string;
  to: string;
  why?: string;
}

/** A transient, pre-write description. It is never persisted beside the vault. */
export interface OntologyChangeSet {
  toolName: string;
  operation: OntologyChangeOperation;
  target: string | null;
  exact: boolean;
  destructive: boolean;
  relation: OntologyRelationChange | null;
  fields: OntologyChangeField[];
  itemCount: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function shortToolName(toolName: string): string {
  const separator = toolName.lastIndexOf('__');
  return separator >= 0 ? toolName.slice(separator + 2) : toolName;
}

const OMITTED_ARGUMENTS = new Set(['confirm', 'expected_mtime', 'expected_into_mtime']);

function fieldsFrom(input: Record<string, unknown>, omitted: ReadonlySet<string>): OntologyChangeField[] {
  return Object.entries(input)
    .filter(([key, value]) => !omitted.has(key) && value !== undefined)
    .map(([key, after]) => ({ key, after }));
}

/**
 * Turns the ACP tool input into the same typed unit the manual editor reviews.
 * Exact means the requested after-values are shown without inference. Existing
 * values are only populated by manual editors that already hold a vault doc.
 */
export function buildOntologyChangeSet(
  permissionToolName: string,
  rawInput: Record<string, unknown>,
): OntologyChangeSet {
  const toolName = shortToolName(permissionToolName);
  const destructive = new Set([
    'delete_concept',
    'merge_concepts',
    'rename_concept',
    'remove_relation',
    'replace_relation',
    'reclassify_concept',
    'disconnect_project_source',
    'absorb_document',
  ]).has(toolName);

  if (toolName === 'add_relation') {
    const from = text(rawInput.from);
    const to = text(rawInput.to);
    const type = text(rawInput.type);
    if (from && to && type) {
      return {
        toolName,
        operation: 'relate',
        target: from,
        exact: true,
        destructive: false,
        relation: { from, to, type, ...(text(rawInput.why) ? { why: text(rawInput.why)! } : {}) },
        fields: [],
        itemCount: 1,
      };
    }
  }

  if (toolName === 'add_relations') {
    const relations = Array.isArray(rawInput.relations) ? rawInput.relations : [];
    const first = record(relations[0]);
    const from = text(first.from);
    const to = text(first.to);
    const type = text(first.type);
    return {
      toolName,
      operation: 'relate',
      target: from,
      exact: relations.length > 0,
      destructive: false,
      relation: from && to && type
        ? { from, to, type, ...(text(first.why) ? { why: text(first.why)! } : {}) }
        : null,
      fields: [],
      itemCount: relations.length,
    };
  }

  if (toolName === 'add_concept') {
    const omitted = new Set([...OMITTED_ARGUMENTS, 'slug']);
    return {
      toolName,
      operation: 'create',
      target: text(rawInput.slug),
      exact: Boolean(text(rawInput.slug) && text(rawInput.kind) && text(rawInput.title)),
      destructive: false,
      relation: null,
      fields: fieldsFrom(rawInput, omitted),
      itemCount: 1,
    };
  }

  if (toolName === 'add_concepts') {
    const concepts = Array.isArray(rawInput.concepts) ? rawInput.concepts : [];
    const first = record(concepts[0]);
    return {
      toolName,
      operation: 'create',
      target: text(first.slug),
      exact: concepts.length > 0,
      destructive: false,
      relation: null,
      fields: fieldsFrom(first, new Set(['slug'])),
      itemCount: concepts.length,
    };
  }

  if (toolName === 'patch_concept') {
    const frontmatter = record(rawInput.frontmatter);
    return {
      toolName,
      operation: 'update',
      target: text(rawInput.slug),
      exact: Boolean(text(rawInput.slug)),
      destructive: false,
      relation: null,
      fields: [
        ...fieldsFrom(frontmatter, new Set()),
        ...(rawInput.body === undefined ? [] : [{ key: 'body', after: rawInput.body }]),
      ],
      itemCount: 1,
    };
  }

  const operation: OntologyChangeOperation = toolName.includes('relation')
    ? destructive ? 'remove' : 'relate'
    : toolName === 'rename_concept'
      ? 'rename'
      : toolName === 'merge_concepts'
        ? 'merge'
        : destructive
          ? 'remove'
          : 'write';
  return {
    toolName,
    operation,
    target: text(rawInput.slug) ?? text(rawInput.from) ?? text(rawInput.projectSlug),
    exact: Object.keys(rawInput).length > 0,
    destructive,
    relation: null,
    fields: fieldsFrom(rawInput, OMITTED_ARGUMENTS),
    itemCount: 1,
  };
}
