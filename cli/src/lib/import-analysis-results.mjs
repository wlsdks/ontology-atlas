const EDGE_KINDS = new Set(['static', 'dynamic', 'require', 'reexport', 'side']);

export function assertInferImportsResult(payload, context = 'infer_imports') {
  assertObject(payload, context);
  assertNonNegativeInteger(payload.filesScanned, `${context}.filesScanned`);
  assertArray(payload.edges, `${context}.edges`);
  assertArray(payload.externalImports, `${context}.externalImports`);
  assertArray(payload.unresolved, `${context}.unresolved`);
  assertArray(payload.moduleEdges, `${context}.moduleEdges`);

  payload.edges.forEach((row, index) => assertFileEdge(row, `${context}.edges[${index}]`));
  payload.externalImports.forEach((row, index) => {
    const rowPath = `${context}.externalImports[${index}]`;
    assertObject(row, rowPath);
    assertNonEmptyString(row.from, `${rowPath}.from`);
    assertNonEmptyString(row.spec, `${rowPath}.spec`);
  });
  payload.unresolved.forEach((row, index) => {
    const rowPath = `${context}.unresolved[${index}]`;
    assertObject(row, rowPath);
    assertNonEmptyString(row.from, `${rowPath}.from`);
    assertNonEmptyString(row.spec, `${rowPath}.spec`);
    assertNonEmptyString(row.reason, `${rowPath}.reason`);
  });
  payload.moduleEdges.forEach((row, index) => assertModuleEdge(row, `${context}.moduleEdges[${index}]`));
}

function assertFileEdge(row, path) {
  assertObject(row, path);
  assertNonEmptyString(row.from, `${path}.from`);
  assertNonEmptyString(row.to, `${path}.to`);
  assertEdgeKind(row.kind, `${path}.kind`);
}

function assertModuleEdge(row, path) {
  assertObject(row, path);
  assertNonEmptyString(row.from, `${path}.from`);
  assertNonEmptyString(row.to, `${path}.to`);
  assertPositiveInteger(row.count, `${path}.count`);
  assertObject(row.kindCounts, `${path}.kindCounts`);
  let total = 0;
  for (const [kind, count] of Object.entries(row.kindCounts)) {
    assertEdgeKind(kind, `${path}.kindCounts.${kind}`);
    assertPositiveInteger(count, `${path}.kindCounts.${kind}`);
    total += count;
  }
  if (total !== row.count) {
    throw new Error(`${path}.kindCounts total must equal count: count ${row.count}, kindCounts ${total}`);
  }
}

function assertObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
}

function assertArray(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
}

function assertNonEmptyString(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
}

function assertNonNegativeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative integer`);
  }
}

function assertPositiveInteger(value, path) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${path} must be a positive integer`);
  }
}

function assertEdgeKind(value, path) {
  if (typeof value !== 'string' || !EDGE_KINDS.has(value)) {
    throw new Error(`${path} must be one of ${[...EDGE_KINDS].join(', ')}`);
  }
}
