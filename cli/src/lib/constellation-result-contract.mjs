function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
}

function string(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
}

function assertSource(source) {
  object(source, 'constellation source');
  string(source.path, 'constellation source.path');
  string(source.schema, 'constellation source.schema');
  if (!['ready', 'missing', 'corrupt', 'unsupported'].includes(source.status)) {
    throw new Error('constellation source.status is invalid');
  }
  if (!['ready', 'missing', 'unavailable'].includes(source.availability)) {
    throw new Error('constellation source.availability is invalid');
  }
  const expectedAvailability = source.status === 'ready'
    ? 'ready'
    : source.status === 'missing'
      ? 'missing'
      : 'unavailable';
  if (source.availability !== expectedAvailability) throw new Error('constellation source status/availability disagree');
  if (source.revision !== null && (typeof source.revision !== 'string' || !/^[a-f0-9]{64}$/.test(source.revision))) {
    throw new Error('constellation source.revision is invalid');
  }
  if (source.mtime !== null && (typeof source.mtime !== 'number' || !Number.isFinite(source.mtime) || source.mtime < 0)) {
    throw new Error('constellation source.mtime is invalid');
  }
}

function nullableString(value, label) {
  if (value !== null && typeof value !== 'string') throw new Error(`${label} must be a string or null`);
}

function assertNodeRef(value, label) {
  object(value, label);
  string(value.uid, `${label}.uid`);
  string(value.slug, `${label}.slug`);
}

function assertRelation(row, label) {
  object(row, label);
  assertNodeRef(row.from, `${label}.from`);
  assertNodeRef(row.to, `${label}.to`);
  string(row.type, `${label}.type`);
  if (row.rationale !== undefined) string(row.rationale, `${label}.rationale`);
}

function assertPagination(pagination, label) {
  object(pagination, label);
  for (const field of ['offset', 'limit', 'total', 'returned']) {
    nonNegativeInteger(pagination[field], `${label}.${field}`);
  }
  if (typeof pagination.hasMore !== 'boolean') throw new Error(`${label}.hasMore must be a boolean`);
  if (pagination.nextOffset !== null) nonNegativeInteger(pagination.nextOffset, `${label}.nextOffset`);
}

function assertPurpose(purpose, label) {
  object(purpose, label);
  if (!['recorded', 'unknown'].includes(purpose.status)) throw new Error(`${label}.status is invalid`);
  if (purpose.status === 'recorded') string(purpose.value, `${label}.value`);
  if (purpose.status === 'unknown' && purpose.value !== undefined) throw new Error(`${label}.value must be omitted when unknown`);
}

export function assertConstellationListShape(result) {
  object(result, 'list_constellations result');
  if (result.contract !== 'savedConstellationList:v1') throw new Error('list_constellations contract is invalid');
  if (!['ready', 'missing', 'unavailable'].includes(result.availability)) {
    throw new Error('list_constellations availability is invalid');
  }
  assertSource(result.source);
  if (result.source.availability !== result.availability) {
    throw new Error('list_constellations source availability does not match result');
  }
  for (const field of ['total', 'returned']) nonNegativeInteger(result[field], `list_constellations ${field}`);
  if (typeof result.limited !== 'boolean') throw new Error('list_constellations limited must be a boolean');
  assertPagination(result.pagination, 'list_constellations pagination');
  if (result.total !== result.pagination.total || result.returned !== result.pagination.returned) {
    throw new Error('list_constellations totals do not match pagination');
  }
  if (result.limited !== result.pagination.hasMore) throw new Error('list_constellations limited does not match pagination');
  if (!Array.isArray(result.constellations)) throw new Error('list_constellations constellations must be an array');
  if (result.returned !== result.constellations.length) throw new Error('list_constellations returned does not match rows');
  for (const row of result.constellations) {
    object(row, 'constellation row');
    for (const field of ['id', 'name', 'createdAt', 'updatedAt']) string(row[field], `constellation ${field}`);
    assertPurpose(row.purpose, 'constellation purpose');
    for (const field of ['order', 'memberCount', 'ontologyMemberCount', 'referenceMemberCount']) {
      nonNegativeInteger(row[field], `constellation ${field}`);
    }
  }
  string(result.guidance, 'list_constellations guidance');
  return result;
}

export function assertConstellationContextShape(result) {
  object(result, 'get_constellation result');
  if (result.contract !== 'savedConstellationContext:v1') throw new Error('get_constellation contract is invalid');
  if (!['ready', 'missing', 'unavailable'].includes(result.availability)) {
    throw new Error('get_constellation availability is invalid');
  }
  assertSource(result.source);
  if (result.source.availability !== result.availability) {
    throw new Error('get_constellation source availability does not match result');
  }
  string(result.guidance, 'get_constellation guidance');
  if (result.availability !== 'ready') return result;

  const selection = object(result.selection, 'get_constellation selection');
  for (const field of ['id', 'name', 'createdAt', 'updatedAt']) string(selection[field], `selection.${field}`);
  assertPurpose(selection.purpose, 'selection.purpose');
  for (const field of ['memberCount', 'ontologyMemberCount', 'referenceMemberCount']) {
    nonNegativeInteger(selection[field], `selection.${field}`);
  }
  if (!Array.isArray(selection.members)) throw new Error('selection.members must be an array');
  for (const member of selection.members) {
    object(member, 'saved member');
    string(member.itemId, 'saved member.itemId');
    string(member.label, 'saved member.label');
    nonNegativeInteger(member.order, 'saved member.order');
    const target = object(member.target, 'saved member.target');
    if (!['ontology', 'source', 'wiki'].includes(target.kind)) throw new Error('saved member.target.kind is invalid');
    if (target.kind === 'ontology') {
      string(target.uid, 'saved member.target.uid');
      string(target.lastKnownPath, 'saved member.target.lastKnownPath');
    } else {
      string(target.path, 'saved member.target.path');
    }
  }
  assertPagination(selection.pagination, 'selection.pagination');
  if (selection.pagination.returned !== selection.members.length) {
    throw new Error('selection.pagination.returned does not match members');
  }

  const current = object(result.current, 'get_constellation current');
  if (!Array.isArray(current.resolvedMembers) || !Array.isArray(current.unresolvedMembers)) {
    throw new Error('get_constellation current member rows must be arrays');
  }
  nonNegativeInteger(current.resolvedMemberTotal, 'current.resolvedMemberTotal');
  nonNegativeInteger(current.unresolvedMemberTotal, 'current.unresolvedMemberTotal');
  for (const row of current.resolvedMembers) {
    object(row, 'resolved member');
    for (const field of ['itemId', 'requestedUid', 'identityResolution', 'uid', 'slug', 'kind', 'title']) {
      string(row[field], `resolved member.${field}`);
    }
    if (!['current', 'merged'].includes(row.identityResolution)) {
      throw new Error('resolved member.identityResolution is invalid');
    }
    nullableString(row.domain, 'resolved member.domain');
    object(row.review, 'resolved member.review');
    string(row.review.currentness, 'resolved member.review.currentness');
    object(row.evidence, 'resolved member.evidence');
    nullableString(row.evidence.implementationPath, 'resolved member.evidence.implementationPath');
    if (typeof row.evidence.excerpt !== 'string' || typeof row.evidence.excerptTruncated !== 'boolean') {
      throw new Error('resolved member evidence excerpt contract is invalid');
    }
    nonNegativeInteger(row.evidence.bodyChars, 'resolved member.evidence.bodyChars');
  }
  for (const row of current.unresolvedMembers) {
    object(row, 'unresolved member');
    for (const field of ['itemId', 'uid', 'label', 'lastKnownPath', 'reason']) {
      string(row[field], `unresolved member.${field}`);
    }
    if (!['missing', 'ambiguous', 'not_graph_node'].includes(row.reason)) {
      throw new Error('unresolved member.reason is invalid');
    }
  }

  for (const [key, block] of [
    ['relations', result.relations],
    ['outsideScopeDependencies', result.outsideScopeDependencies],
  ]) {
    object(block, key);
    nonNegativeInteger(block.total, `${key}.total`);
    nonNegativeInteger(block.returned, `${key}.returned`);
    if (typeof block.limited !== 'boolean' || !Array.isArray(block.rows)) {
      throw new Error(`${key} rows/limited contract is invalid`);
    }
    if (block.returned !== block.rows.length) throw new Error(`${key}.returned does not match rows`);
    for (const [index, row] of block.rows.entries()) {
      assertRelation(row, `${key}.rows[${index}]`);
      if (key === 'outsideScopeDependencies') {
        if (!['incoming', 'outgoing'].includes(row.scopeDirection)) {
          throw new Error(`${key}.rows[${index}].scopeDirection is invalid`);
        }
        const outside = object(row.outsideNode, `${key}.rows[${index}].outsideNode`);
        for (const field of ['uid', 'slug', 'kind', 'title']) string(outside[field], `${key}.outsideNode.${field}`);
      }
    }
  }
  const coverage = object(result.coverage, 'get_constellation coverage');
  for (const field of ['selectedMembership', 'memberFacts', 'internalRelations', 'outsideScopeDependencies']) {
    string(coverage[field], `coverage.${field}`);
  }
  for (const field of ['graphNodesScanned', 'unresolvedGraphReferences', 'unresolvedDependencyReferences']) {
    nonNegativeInteger(coverage[field], `coverage.${field}`);
  }
  for (const field of ['transitiveImpactChecked', 'meaningAcceptanceInferred', 'completeImpactInferred']) {
    if (coverage[field] !== false) throw new Error(`coverage.${field} must be false`);
  }
  return result;
}
