import { collectNeighborRefs, relationNoteFor } from '../vault/graph/relation-refs.mjs';

function buildUidClaims(docs) {
  const claims = new Map();
  const push = (uid, doc, kind) => {
    if (typeof uid !== 'string' || !uid) return;
    if (!claims.has(uid)) claims.set(uid, []);
    claims.get(uid).push({ doc, kind });
  };
  for (const doc of docs) {
    const currentUid = doc.frontmatter?.uid;
    const mergedUids = Array.isArray(doc.frontmatter?.merged_uids) ? doc.frontmatter.merged_uids : [];
    const claimed = new Map();
    if (typeof currentUid === 'string' && currentUid) claimed.set(currentUid, 'current');
    for (const uid of mergedUids) {
      if (typeof uid === 'string' && uid && !claimed.has(uid)) claimed.set(uid, 'merged');
    }
    for (const [uid, kind] of claimed) {
      push(uid, doc, kind);
    }
  }
  return claims;
}

function resolveMember(item, uidClaims) {
  const claims = uidClaims.get(item.target.uid) ?? [];
  if (claims.length === 0) {
    return {
      ok: false,
      itemId: item.id,
      uid: item.target.uid,
      label: item.label,
      lastKnownPath: item.target.lastKnownPath,
      reason: 'missing',
    };
  }
  if (claims.length > 1) {
    return {
      ok: false,
      itemId: item.id,
      uid: item.target.uid,
      label: item.label,
      lastKnownPath: item.target.lastKnownPath,
      reason: 'ambiguous',
      claimCount: claims.length,
    };
  }
  const claim = claims[0];
  if (typeof claim.doc.frontmatter?.kind !== 'string' || !claim.doc.frontmatter.kind.trim()) {
    return {
      ok: false,
      itemId: item.id,
      uid: item.target.uid,
      label: item.label,
      lastKnownPath: item.target.lastKnownPath,
      reason: 'not_graph_node',
      claimCount: 1,
    };
  }
  return { ok: true, item, doc: claim.doc, identityResolution: claim.kind };
}

function buildGraphResolver(docs) {
  const graphDocs = docs.filter(
    (doc) => typeof doc.frontmatter?.kind === 'string' && doc.frontmatter.kind.trim(),
  );
  const exact = new Map(graphDocs.map((doc) => [doc.slug, doc]));
  const aliases = new Map();
  const addAlias = (alias, doc) => {
    if (typeof alias !== 'string' || !alias.trim()) return;
    if (!aliases.has(alias)) aliases.set(alias, []);
    aliases.get(alias).push(doc);
  };
  for (const doc of graphDocs) {
    addAlias(doc.frontmatter?.slug, doc);
    const tail = doc.slug.split('/').pop();
    if (tail !== doc.slug) addAlias(tail, doc);
  }
  return {
    graphDocs,
    resolve(ref) {
      const direct = exact.get(ref);
      if (direct) return direct;
      const candidates = [...new Map((aliases.get(ref) ?? []).map((doc) => [doc.slug, doc])).values()];
      return candidates.length === 1 ? candidates[0] : null;
    },
  };
}

function buildRelationView(from, to, type, rationale) {
  return {
    from: { uid: from.frontmatter.uid, slug: from.slug },
    to: { uid: to.frontmatter.uid, slug: to.slug },
    type,
    ...(rationale ? { rationale } : {}),
  };
}

function relationKey(edge) {
  return `${edge.type}\0${edge.from.slug}\0${edge.to.slug}`;
}

function collectScopeRelations(docs, resolvedScope, relationLimit, dependencyLimit) {
  const { graphDocs, resolve: resolveRef } = buildGraphResolver(docs);
  const selectedSlugs = new Set(resolvedScope.map((row) => row.doc.slug));
  const internal = new Map();
  const outside = new Map();
  let unresolvedGraphReferences = 0;
  let unresolvedDependencyReferences = 0;

  for (const doc of graphDocs) {
    const fromInside = selectedSlugs.has(doc.slug);
    for (const { key, ref } of collectNeighborRefs(doc)) {
      const target = resolveRef(ref);
      if (!target) {
        if (fromInside) {
          unresolvedGraphReferences += 1;
          if (key === 'dependencies') unresolvedDependencyReferences += 1;
        }
        continue;
      }
      if (target.slug === doc.slug) continue;
      const toInside = selectedSlugs.has(target.slug);
      const rationale = relationNoteFor(doc, ref, target.slug);
      if (fromInside && toInside) {
        const edge = buildRelationView(doc, target, key, rationale);
        internal.set(relationKey(edge), edge);
      } else if (key === 'dependencies' && fromInside !== toInside) {
        const edge = {
          ...buildRelationView(doc, target, key, rationale),
          scopeDirection: fromInside ? 'outgoing' : 'incoming',
          outsideNode: {
            uid: (fromInside ? target : doc).frontmatter.uid,
            slug: (fromInside ? target : doc).slug,
            kind: (fromInside ? target : doc).frontmatter.kind,
            title:
              (fromInside ? target : doc).frontmatter.title ||
              (fromInside ? target : doc).frontmatter.name ||
              (fromInside ? target : doc).slug,
          },
        };
        outside.set(`${relationKey(edge)}\0${edge.scopeDirection}`, edge);
      }
    }
  }

  const internalRows = [...internal.values()].sort((a, b) => relationKey(a).localeCompare(relationKey(b)));
  const outsideRows = [...outside.values()].sort((a, b) =>
    `${a.scopeDirection}\0${relationKey(a)}`.localeCompare(`${b.scopeDirection}\0${relationKey(b)}`),
  );
  return {
    internal: internalRows.slice(0, relationLimit),
    internalTotal: internalRows.length,
    outside: outsideRows.slice(0, dependencyLimit),
    outsideTotal: outsideRows.length,
    unresolvedGraphReferences,
    unresolvedDependencyReferences,
    graphNodeCount: graphDocs.length,
  };
}

export { buildUidClaims, collectScopeRelations, resolveMember };
