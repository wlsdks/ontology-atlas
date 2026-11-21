export function normalizeCanvasPosition(value) {
  if (
    value &&
    typeof value === 'object' &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y)
  ) {
    return { x: value.x, y: value.y };
  }
  return null;
}

export function builderFocusParam(node) {
  const slug = node?.slug || '';
  if (!['project', 'domain', 'capability', 'element'].includes(node?.kind)) return slug;
  const tail = slug.includes('/') ? slug.slice(slug.indexOf('/') + 1) : slug;
  return `${node.kind}:${tail}`;
}

export function normalizeBuilderFocusInput(value) {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().replace(/^\/+/, '').replace(/^ontology\//, '');
  if (!normalized || normalized.includes('/')) return normalized;
  const [kind, ...tailParts] = normalized.split(':');
  const tail = tailParts.join(':').trim();
  if (!tail) return normalized;
  if (kind === 'project') return tail;
  const folder = {
    domain: 'domains',
    capability: 'capabilities',
    element: 'elements',
  }[kind];
  return folder ? `${folder}/${tail}` : normalized;
}
