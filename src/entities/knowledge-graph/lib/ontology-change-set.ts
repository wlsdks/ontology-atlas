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

/** One row in the exact ACP request. Batch reviews must never collapse these. */
export interface OntologyChangeItem {
  key: string;
  target: string | null;
  exact: boolean;
  relation: OntologyRelationChange | null;
  fields: OntologyChangeField[];
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
  /** Every requested row, in protocol order. `relation`/`fields` above mirror item 0. */
  items: OntologyChangeItem[];
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

function item(
  toolName: string,
  index: number,
  input: {
    target: string | null;
    exact: boolean;
    relation?: OntologyRelationChange | null;
    fields?: OntologyChangeField[];
  },
): OntologyChangeItem {
  return {
    key: `${toolName}:${index}:${input.target ?? 'unknown'}`,
    target: input.target,
    exact: input.exact,
    relation: input.relation ?? null,
    fields: input.fields ?? [],
  };
}

function withItems(
  base: Omit<OntologyChangeSet, 'items' | 'itemCount' | 'target' | 'relation' | 'fields'>,
  items: OntologyChangeItem[],
): OntologyChangeSet {
  const first = items[0] ?? null;
  return {
    ...base,
    target: first?.target ?? null,
    relation: first?.relation ?? null,
    fields: first?.fields ?? [],
    itemCount: items.length,
    items,
  };
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
      const relation = { from, to, type, ...(text(rawInput.why) ? { why: text(rawInput.why)! } : {}) };
      return withItems({
        toolName,
        operation: 'relate',
        exact: true,
        destructive: false,
      }, [item(toolName, 0, { target: from, exact: true, relation })]);
    }
  }

  if (toolName === 'add_relations') {
    const relations = Array.isArray(rawInput.relations) ? rawInput.relations : [];
    const items = relations.map((value, index) => {
      const row = record(value);
      const from = text(row.from);
      const to = text(row.to);
      const type = text(row.type);
      const relation = from && to && type
        ? { from, to, type, ...(text(row.why) ? { why: text(row.why)! } : {}) }
        : null;
      return item(toolName, index, {
        target: from,
        exact: Boolean(relation),
        relation,
        fields: relation ? [] : fieldsFrom(row, new Set()),
      });
    });
    return withItems({
      toolName,
      operation: 'relate',
      exact: items.length > 0 && items.every((entry) => entry.exact),
      destructive: false,
    }, items);
  }

  if (toolName === 'add_concept') {
    const omitted = new Set([...OMITTED_ARGUMENTS, 'slug']);
    const target = text(rawInput.slug);
    const fields = fieldsFrom(rawInput, omitted);
    const exact = Boolean(target && text(rawInput.kind) && text(rawInput.title));
    return withItems({
      toolName,
      operation: 'create',
      exact,
      destructive: false,
    }, [item(toolName, 0, { target, exact, fields })]);
  }

  if (toolName === 'add_concepts') {
    const concepts = Array.isArray(rawInput.concepts) ? rawInput.concepts : [];
    const items = concepts.map((value, index) => {
      const row = record(value);
      const target = text(row.slug);
      const exact = Boolean(target && text(row.kind) && text(row.title));
      return item(toolName, index, {
        target,
        exact,
        fields: fieldsFrom(row, new Set(['slug'])),
      });
    });
    return withItems({
      toolName,
      operation: 'create',
      exact: items.length > 0 && items.every((entry) => entry.exact),
      destructive: false,
    }, items);
  }

  if (toolName === 'patch_concept') {
    const frontmatter = record(rawInput.frontmatter);
    const target = text(rawInput.slug);
    const fields = [
      ...fieldsFrom(frontmatter, new Set()),
      ...(rawInput.body === undefined ? [] : [{ key: 'body', after: rawInput.body }]),
    ];
    return withItems({
      toolName,
      operation: 'update',
      exact: Boolean(target),
      destructive: false,
    }, [item(toolName, 0, { target, exact: Boolean(target), fields })]);
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
  const target = text(rawInput.slug) ?? text(rawInput.from) ?? text(rawInput.projectSlug);
  const fields = fieldsFrom(rawInput, OMITTED_ARGUMENTS);
  const exact = Object.keys(rawInput).length > 0;
  return withItems({
    toolName,
    operation,
    exact,
    destructive,
  }, [item(toolName, 0, { target, exact, fields })]);
}
