import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { compileOntology } from './ontology-compiler.mjs';

function doc(slug, frontmatter = {}) {
  return {
    slug,
    frontmatter: withUid(slug, frontmatter),
    body: '',
    mtime: 1,
  };
}

function timedDoc(slug, frontmatter = {}, mtime = 1) {
  return {
    slug,
    frontmatter: withUid(slug, frontmatter),
    body: '',
    mtime,
  };
}

function withUid(slug, frontmatter) {
  if (Object.prototype.hasOwnProperty.call(frontmatter, 'uid')) return frontmatter;
  const hex = createHash('sha256').update(slug).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '8';
  const uid = `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
  return { uid, ...frontmatter };
}

describe('compileOntology', () => {
  it('compiles nodes, canonical edges, aliases, and adjacency indexes', () => {
    const result = compileOntology(
      [
        doc('domains/auth', { slug: 'auth-domain', kind: 'domain', title: 'Auth' }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          depends_on: ['auth-domain'],
          relates: ['missing'],
        }),
      ],
      { includeIndexes: true },
    );

    assert.equal(result.version, 2);
    assert.match(result.graphHash, /^[a-f0-9]{64}$/);
    assert.equal(result.maxMtime, 1);
    assert.equal(result.nodeCount, 2);
    assert.equal(result.edgeCount, 2);
    assert.equal(result.resolvedEdgeCount, 1);
    assert.equal(result.externalEdgeCount, 0);
    assert.equal(result.unresolvedEdgeCount, 1);
    assert.equal(result.aliasCount, result.aliases.length);
    assert.equal(result.ambiguousAliasCount, result.ambiguousAliases.length);
    assert.equal(result.issueCount, result.issues.length);
    assert.equal(result.canonicalizationActionCount, result.canonicalizationActions.length);
    assert.deepEqual(result.byKind, {
      capability: 1,
      domain: 1,
    });
    assert.deepEqual(result.byDomain, {});
    assert.deepEqual(
      result.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        via: edge.via,
        ref: edge.ref,
        resolved: edge.resolved,
        external: edge.external,
      })),
      [
        {
          from: 'capabilities/login',
          to: 'domains/auth',
          via: 'dependencies',
          ref: 'auth-domain',
          resolved: true,
          external: false,
        },
        {
          from: 'capabilities/login',
          to: 'missing',
          via: 'relates',
          ref: 'missing',
          resolved: false,
          external: false,
        },
      ],
    );
    assert.deepEqual(result.indexes.in['domains/auth'], [
      'capabilities/login->domains/auth:dependencies:auth-domain',
    ]);
    assert.deepEqual(result.indexes.byKind, {
      capability: ['capabilities/login'],
      domain: ['domains/auth'],
    });
    assert.deepEqual(result.indexes.byDomain, {});
    assert.equal(
      result.indexes.edgeById['capabilities/login->domains/auth:dependencies:auth-domain'].to,
      'domains/auth',
    );
    assert.equal(result.indexes.aliasToSlug['auth-domain'], 'domains/auth');
    const authUid = withUid('domains/auth', {}).uid;
    assert.equal(result.indexes.uidToSlug[authUid], 'domains/auth');
    assert.equal(result.indexes.slugToUid['domains/auth'], authUid);
    assert.deepEqual(result.indexes.mergedUidToSlug, {});
    assert.deepEqual(result.nodes.find((node) => node.slug === 'capabilities/login'), {
      uid: withUid('capabilities/login', {}).uid,
      slug: 'capabilities/login',
      kind: 'capability',
      title: 'Login',
      domain: undefined,
      mtime: 1,
      outDegree: 2,
      inDegree: 0,
    });
    assert.ok(result.aliases.some((alias) => alias.alias === 'auth-domain' && alias.slug === 'domains/auth'));
    assert.ok(result.issues.some((issue) => issue.code === 'dangling-graph-reference'));
  });

  it('fails closed with a structured issue when a graph node has no UID', () => {
    assert.throws(
      () => compileOntology([doc('domains/auth', { uid: undefined, kind: 'domain' })]),
      (error) => {
        assert.equal(error.name, 'OntologyIdentityError');
        assert.equal(error.code, 'invalid-ontology-identity');
        assert.deepEqual(error.issues, [
          {
            code: 'missing-uid',
            severity: 'error',
            slug: 'domains/auth',
            message: 'Node "domains/auth" is missing required `uid`.',
          },
        ]);
        return true;
      },
    );
  });

  it('fails closed on malformed UID instead of emitting a partial node', () => {
    assert.throws(
      () => compileOntology([doc('domains/auth', { uid: 'AUTH-1', kind: 'domain' })]),
      (error) => {
        assert.deepEqual(error.issues, [
          {
            code: 'invalid-uid',
            severity: 'error',
            slug: 'domains/auth',
            uid: 'AUTH-1',
            message: 'Node "domains/auth" has invalid `uid`; expected a lowercase UUIDv4.',
          },
        ]);
        return true;
      },
    );
  });

  it('reports every node sharing one primary UID and fails closed', () => {
    const uid = withUid('shared-identity', {}).uid;
    assert.throws(
      () =>
        compileOntology([
          doc('domains/auth', { uid, kind: 'domain' }),
          doc('capabilities/login', { uid, kind: 'capability' }),
        ]),
      (error) => {
        assert.deepEqual(error.issues, [
          {
            code: 'duplicate-uid',
            severity: 'error',
            uid,
            slugs: ['capabilities/login', 'domains/auth'],
            message: `Primary UID "${uid}" is used by multiple nodes: capabilities/login, domains/auth.`,
          },
        ]);
        return true;
      },
    );
  });

  it('the duplicate-uid fatal message names the offending files, never "undefined"', () => {
    const uid = withUid('shared-identity', {}).uid;
    assert.throws(
      () =>
        compileOntology([
          doc('domains/auth', { uid, kind: 'domain' }),
          doc('capabilities/login', { uid, kind: 'capability' }),
        ]),
      (error) => {
        assert.match(error.message, /capabilities\/login \+ domains\/auth/);
        assert.doesNotMatch(error.message, /undefined/);
        return true;
      },
    );
  });

  it('fails when a historical merged UID collides with a live primary UID', () => {
    const authUid = withUid('domains/auth', {}).uid;
    assert.throws(
      () =>
        compileOntology([
          doc('domains/auth', { uid: authUid, kind: 'domain' }),
          doc('capabilities/login', {
            kind: 'capability',
            merged_uids: [authUid],
          }),
        ]),
      (error) => {
        assert.deepEqual(error.issues, [
          {
            code: 'primary-merged-uid-collision',
            severity: 'error',
            uid: authUid,
            primarySlug: 'domains/auth',
            mergedSlugs: ['capabilities/login'],
            message: `UID "${authUid}" is primary for "domains/auth" and historical for: capabilities/login.`,
          },
        ]);
        return true;
      },
    );
  });

  it('fails closed when merged_uids contains a malformed historical identity', () => {
    assert.throws(
      () =>
        compileOntology([
          doc('capabilities/login', {
            kind: 'capability',
            merged_uids: ['legacy-login'],
          }),
        ]),
      (error) => {
        assert.deepEqual(error.issues, [
          {
            code: 'invalid-merged-uid',
            severity: 'error',
            slug: 'capabilities/login',
            uid: 'legacy-login',
            message: 'Node "capabilities/login" has invalid `merged_uids` entry "legacy-login"; expected a lowercase UUIDv4.',
          },
        ]);
        return true;
      },
    );
  });

  it('fails when one historical UID is claimed by multiple survivors', () => {
    const mergedUid = withUid('retired-login', {}).uid;
    assert.throws(
      () =>
        compileOntology([
          doc('capabilities/login', { kind: 'capability', merged_uids: [mergedUid] }),
          doc('capabilities/sign-in', { kind: 'capability', merged_uids: [mergedUid] }),
        ]),
      (error) => {
        assert.deepEqual(error.issues, [
          {
            code: 'duplicate-merged-uid',
            severity: 'error',
            uid: mergedUid,
            slugs: ['capabilities/login', 'capabilities/sign-in'],
            message: `Historical UID "${mergedUid}" is claimed by multiple nodes: capabilities/login, capabilities/sign-in.`,
          },
        ]);
        return true;
      },
    );
  });

  it('requires merged_uids to be an array instead of accepting a scalar UID', () => {
    const mergedUid = withUid('retired-login', {}).uid;
    assert.throws(
      () =>
        compileOntology([
          doc('capabilities/login', { kind: 'capability', merged_uids: mergedUid }),
        ]),
      (error) => {
        assert.deepEqual(error.issues, [
          {
            code: 'invalid-merged-uids',
            severity: 'error',
            slug: 'capabilities/login',
            message: 'Node "capabilities/login" must store `merged_uids` as an array of lowercase UUIDv4 values.',
          },
        ]);
        return true;
      },
    );
  });

  it('reports ambiguous aliases without resolving them', () => {
    const result = compileOntology([
      doc('domains/auth', { kind: 'domain' }),
      doc('capabilities/auth', { kind: 'capability' }),
      doc('project', { kind: 'project', domains: ['auth'] }),
    ]);

    assert.deepEqual(result.ambiguousAliases, [
      { alias: 'auth', slugs: ['capabilities/auth', 'domains/auth'] },
    ]);
    assert.deepEqual(result.edges, [
      {
        id: 'project->auth:domains:auth',
        from: 'project',
        to: 'auth',
        via: 'domains',
        ref: 'auth',
        resolved: false,
        external: false,
      },
    ]);
    assert.ok(result.issues.some((issue) => issue.code === 'ambiguous-alias'));
  });

  it('classifies path-like element refs as external edges, not dangling issues', () => {
    const result = compileOntology([
      doc('capabilities/mcp-server', {
        kind: 'capability',
        elements: ['mcp/src/ontology-compiler.mjs'],
      }),
    ]);

    assert.equal(result.externalEdgeCount, 1);
    assert.equal(result.unresolvedEdgeCount, 0);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.edges, [
      {
        id: 'capabilities/mcp-server->mcp/src/ontology-compiler.mjs:elements:mcp/src/ontology-compiler.mjs',
        from: 'capabilities/mcp-server',
        to: 'mcp/src/ontology-compiler.mjs',
        via: 'elements',
        ref: 'mcp/src/ontology-compiler.mjs',
        resolved: false,
        external: true,
      },
    ]);
  });

  it('preserves a capability canonical implementation path without turning it into an edge', () => {
    const result = compileOntology([
      doc('capabilities/mcp-server', {
        kind: 'capability',
        title: 'MCP server',
        path: 'mcp/src',
      }),
    ]);

    assert.equal(result.nodeCount, 1);
    assert.equal(result.nodes[0].path, 'mcp/src');
    assert.equal(result.edgeCount, 0);
    assert.deepEqual(result.edges, []);
  });

  it('keeps graphHash stable across mtime-only changes', () => {
    const first = compileOntology([
      timedDoc('domains/auth', { kind: 'domain', title: 'Auth' }, 10),
      timedDoc('capabilities/login', { kind: 'capability', domain: 'auth' }, 20),
    ]);
    const second = compileOntology([
      timedDoc('domains/auth', { kind: 'domain', title: 'Auth' }, 100),
      timedDoc('capabilities/login', { kind: 'capability', domain: 'auth' }, 200),
    ]);

    assert.equal(first.graphHash, second.graphHash);
    assert.equal(first.maxMtime, 20);
    assert.equal(second.maxMtime, 200);
  });

  it('changes graphHash when permanent identity changes while slug stays the same', () => {
    const first = compileOntology([
      doc('domains/auth', { uid: withUid('auth-v1', {}).uid, kind: 'domain' }),
    ]);
    const second = compileOntology([
      doc('domains/auth', { uid: withUid('auth-v2', {}).uid, kind: 'domain' }),
    ]);

    assert.notEqual(first.graphHash, second.graphHash);
  });

  it('emits canonical historical identities and their exact resolver index', () => {
    const olderUid = withUid('older-auth', {}).uid;
    const oldUid = withUid('old-auth', {}).uid;
    const result = compileOntology(
      [
        doc('domains/auth', {
          kind: 'domain',
          merged_uids: [oldUid, olderUid],
        }),
      ],
      { includeIndexes: true },
    );

    assert.deepEqual(result.nodes[0].merged_uids, [oldUid, olderUid].sort());
    assert.deepEqual(result.indexes.mergedUidToSlug, {
      [oldUid]: 'domains/auth',
      [olderUid]: 'domains/auth',
    });
  });

  it('reports graph array canonicalization actions outside graphHash', () => {
    const dirty = compileOntology([
      doc('project', {
        kind: 'project',
        capabilities: ['capabilities/z', 'capabilities/a', 'capabilities/z'],
      }),
      doc('capabilities/a', { kind: 'capability' }),
      doc('capabilities/z', { kind: 'capability' }),
    ]);
    const clean = compileOntology([
      doc('project', {
        kind: 'project',
        capabilities: ['capabilities/a', 'capabilities/z'],
      }),
      doc('capabilities/a', { kind: 'capability' }),
      doc('capabilities/z', { kind: 'capability' }),
    ]);

    assert.deepEqual(dirty.canonicalizationActions, [
      {
        slug: 'project',
        keys: ['capabilities'],
        frontmatter: {
          capabilities: ['capabilities/a', 'capabilities/z'],
        },
        expected_mtime: 1,
      },
    ]);
    assert.deepEqual(clean.canonicalizationActions, []);
    assert.equal(dirty.graphHash, clean.graphHash);
  });

  it('summary: true returns counts + aggregates but no array bulk', () => {
    const result = compileOntology(
      [
        doc('project', { kind: 'project', capabilities: ['login', 'logout'] }),
        doc('capabilities/login', { kind: 'capability', domain: 'auth' }),
        doc('capabilities/logout', { kind: 'capability', domain: 'auth' }),
        doc('elements/jwt', { kind: 'element', domain: 'auth' }),
      ],
      { summary: true },
    );
    assert.equal(result.nodeCount, 4);
    assert.equal(typeof result.graphHash, 'string');
    // Each node adds its slug, and a path-style one a tail alias: 1 + 2×3 = 7.
    assert.equal(result.aliasCount, 7);
    assert.deepEqual(result.byKind, {
      capability: 2,
      element: 1,
      project: 1,
    });
    assert.deepEqual(result.byDomain, { auth: 3 });
    assert.equal(result.nodes, undefined);
    assert.equal(result.edges, undefined);
    assert.equal(result.aliases, undefined);
    assert.equal(result.indexes, undefined);
  });

  it('summary hash matches full compile hash (same graph)', () => {
    const docs = [
      doc('project', { kind: 'project', domains: ['auth'] }),
      doc('domains/auth', { kind: 'domain', capabilities: ['login'] }),
      doc('capabilities/login', { kind: 'capability', domain: 'auth' }),
    ];
    const full = compileOntology(docs);
    const summary = compileOntology(docs, { summary: true });
    const indexed = compileOntology(docs, { includeIndexes: true });
    assert.equal(indexed.graphHash, full.graphHash);
    assert.deepEqual(compileOntology(docs, { summary: true, includeIndexes: true }), summary);
    assert.equal(summary.graphHash, full.graphHash);
    assert.equal(summary.nodeCount, full.nodeCount);
    assert.equal(summary.edgeCount, full.edgeCount);
    assert.equal(summary.aliasCount, full.aliasCount);
    assert.equal(summary.ambiguousAliasCount, full.ambiguousAliasCount);
    assert.equal(summary.issueCount, full.issueCount);
    assert.equal(summary.canonicalizationActionCount, full.canonicalizationActionCount);
    assert.deepEqual(summary.byKind, full.byKind);
    assert.deepEqual(summary.byDomain, full.byDomain);
  });

  it('nodesLimit / nodesOffset slice nodes with pagination meta', () => {
    const docs = ['a', 'b', 'c', 'd', 'e'].map((s) =>
      doc(`capabilities/${s}`, { kind: 'capability' }),
    );
    const page1 = compileOntology(docs, { nodesLimit: 2, nodesOffset: 0 });
    assert.equal(page1.nodes.length, 2);
    assert.equal(page1.nodes[0].slug, 'capabilities/a');
    assert.deepEqual(page1.nodesPagination, {
      offset: 0,
      limit: 2,
      total: 5,
      returned: 2,
      hasMore: true,
      nextOffset: 2,
    });

    const page2 = compileOntology(docs, { nodesLimit: 2, nodesOffset: 2 });
    assert.equal(page2.nodes[0].slug, 'capabilities/c');
    assert.equal(page2.nodesPagination.hasMore, true);

    const page3 = compileOntology(docs, { nodesLimit: 2, nodesOffset: 4 });
    assert.equal(page3.nodes.length, 1);
    assert.equal(page3.nodesPagination.hasMore, false);
    assert.equal(page3.nodesPagination.nextOffset, null);
  });

  it('rejects invalid pagination values instead of silently coercing them', () => {
    const docs = ['a', 'b', 'c'].map((s) =>
      doc(`capabilities/${s}`, { kind: 'capability' }),
    );
    assert.throws(
      () => compileOntology(docs, { nodesLimit: 0 }),
      /nodesLimit must be a positive integer/,
    );
    assert.throws(
      () => compileOntology(docs, { edgesLimit: 1.5 }),
      /edgesLimit must be a positive integer/,
    );
    assert.throws(
      () => compileOntology(docs, { nodesOffset: -1 }),
      /nodesOffset must be a non-negative integer/,
    );
    assert.throws(
      () => compileOntology(docs, { edgesOffset: 1.5 }),
      /edgesOffset must be a non-negative integer/,
    );
    assert.throws(
      () => compileOntology(docs, { nodesLimit: null }),
      /nodesLimit must be a positive integer/,
    );
    assert.throws(
      () => compileOntology(docs, { nodesLimit: 501 }),
      /nodesLimit must be <= 500/,
    );
    assert.throws(
      () => compileOntology(docs, { edgesLimit: 501 }),
      /edgesLimit must be <= 500/,
    );
    assert.throws(
      () => compileOntology(docs, { edgesOffset: null }),
      /edgesOffset must be a non-negative integer/,
    );
  });

  it('rejects invalid boolean options instead of treating them as false', () => {
    const docs = ['a', 'b', 'c'].map((s) =>
      doc(`capabilities/${s}`, { kind: 'capability' }),
    );
    assert.throws(
      () => compileOntology(docs, { summary: 'true' }),
      /summary must be a boolean/,
    );
    assert.throws(
      () => compileOntology(docs, { includeIndexes: null }),
      /includeIndexes must be a boolean/,
    );
  });

  it('edgesLimit / edgesOffset slice edges independently of nodes', () => {
    const docs = [
      doc('project', {
        kind: 'project',
        capabilities: ['login', 'logout', 'signup', 'reset'],
      }),
      doc('capabilities/login', { kind: 'capability' }),
      doc('capabilities/logout', { kind: 'capability' }),
      doc('capabilities/signup', { kind: 'capability' }),
      doc('capabilities/reset', { kind: 'capability' }),
    ];
    const result = compileOntology(docs, { edgesLimit: 2, edgesOffset: 1 });
    assert.equal(result.edges.length, 2);
    assert.equal(result.edgesPagination.total, 4);
    assert.equal(result.edgesPagination.offset, 1);
    assert.equal(result.edgesPagination.hasMore, true);
    assert.equal(result.edgesPagination.nextOffset, 3);
    assert.equal(result.nodes.length, 5);
    assert.equal(result.nodesPagination, undefined);
  });

  it('no pagination meta when limits omitted (backward compat)', () => {
    const result = compileOntology([
      doc('a', { kind: 'capability' }),
      doc('b', { kind: 'capability' }),
    ]);
    assert.equal(result.nodes.length, 2);
    assert.equal(result.nodesPagination, undefined);
    assert.equal(result.edgesPagination, undefined);
  });
});

describe('compileOntology retention', () => {
  it('keeps no document text alive once the documents are dropped', () => {
    const script = `
      import { compileOntology } from ${JSON.stringify(new URL('./ontology-compiler.mjs', import.meta.url).href)};
      import { parseFrontmatter } from ${JSON.stringify(new URL('./parser.mjs', import.meta.url).href)};
      const COUNT = 200;
      const body = '한국어 본문과 English prose together. '.repeat(1900);
      const heapAfterCollection = () => { globalThis.gc(); globalThis.gc(); return process.memoryUsage().heapUsed; };
      const before = heapAfterCollection();
      let docs = [];
      let rawBytes = 0;
      for (let index = 0; index < COUNT; index += 1) {
        const next = (index + 1) % COUNT;
        const uid = '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
        const raw = [
          '---',
          'uid: ' + uid,
          'slug: capabilities/node-' + index,
          'kind: capability',
          'title: 기능 ' + index + ' keeps a title',
          'domain: domains/core',
          'path: src/features/node-' + index + '.ts',
          'depends_on: [capabilities/node-' + next + ', capabilities/missing-' + index + ']',
          'relation_notes: { capabilities/node-' + next + ': "근거 ' + index + ' says why this edge exists" }',
          '---',
          body,
        ].join('\\n');
        rawBytes += raw.length * 2;
        docs.push({ slug: 'capabilities/node-' + index, mtime: index, raw, ...parseFrontmatter(raw) });
      }
      globalThis.artifact = compileOntology(docs, { includeIndexes: true });
      docs = null;
      const retained = heapAfterCollection() - before;
      console.log(JSON.stringify({ retained, rawBytes, nodes: globalThis.artifact.nodeCount }));
    `;
    const measured = JSON.parse(execFileSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], {
      encoding: 'utf8',
    }));
    assert.equal(measured.nodes, 200);
    assert.ok(measured.rawBytes > 20 * 1024 * 1024, `fixture text must dominate the heap: ${measured.rawBytes}`);
    assert.ok(
      measured.retained < measured.rawBytes / 10,
      `the artifact retained ${measured.retained} bytes for ${measured.rawBytes} bytes of document text`,
    );
  });
});

it('keeps diagnostics and graphHash stable when document enumeration order changes', () => {
  const docs = [
    doc('elements/z', { kind: 'element', dependencies: ['missing-z'] }),
    doc('elements/a', { kind: 'element', dependencies: ['missing-a'] }),
    { ...doc('elements/error', { kind: 'element', contains: 'bad-array' }), diagnostics: [
      { code: 'malformed-frontmatter-line', line: 3, message: 'Invalid array.' },
    ] },
  ];
  const first = compileOntology(docs, { includeIndexes: true });
  const second = compileOntology([...docs].reverse(), { includeIndexes: true });
  assert.equal(first.graphHash, second.graphHash);
  assert.deepEqual(first.issues, second.issues);
  const changed = docs.map(row => row.slug === 'elements/error'
    ? { ...row, diagnostics: [{ code: 'malformed-frontmatter-line', line: 3, message: 'Different error.' }] }
    : row);
  assert.notEqual(compileOntology(changed).graphHash, first.graphHash);
});

describe('canonical relation ordering', () => {
  it('preserves input order when Unicode relation keys collate equally', () => {
    const docs = [
      doc('elements/e\u0301', { kind: 'element', dependencies: ['missing-target'] }),
      doc('elements/é', { kind: 'element', dependencies: ['missing-target'] }),
    ];
    for (const input of [docs, [...docs].reverse()]) {
      const result = compileOntology(input);
      assert.equal(result.edges.length, 2);
      assert.deepEqual(result.edges.map(edge => edge.from), input.map(item => item.slug));
    }
  });
  it('keeps paginated relation order consistent with the full locale-sorted result', () => {
    const docs = ['z', 'A', 'a', '가', 'é', 'e\u0301'].map(name =>
      doc(`elements/${name}`, { kind: 'element', dependencies: ['missing-b', 'missing-a'] }));
    const full = compileOntology(docs, { includeIndexes: true });
    const expected = [...full.edges].sort((a, b) =>
      `${a.from}:${a.via}:${a.to}:${a.ref}`.localeCompare(`${b.from}:${b.via}:${b.to}:${b.ref}`));
    assert.deepEqual(full.edges, expected);
    const page = compileOntology(docs, { edgesOffset: 2, edgesLimit: 3 });
    assert.deepEqual(page.edges, expected.slice(2, 5));
    assert.equal(page.graphHash, full.graphHash);
  });
});

describe('large graph summary aggregation', () => {
  it('compiles 100000 nodes without passing them as function arguments', () => {
    const script = `
      import { compileOntology } from ${JSON.stringify(new URL('./ontology-compiler.mjs', import.meta.url).href)};
      const docs = Array.from({ length: 100000 }, (_, index) => ({
        slug: 'elements/n' + index,
        mtime: index,
        frontmatter: { kind: 'element', uid: '00000000-0000-4000-8000-' + index.toString(16).padStart(12, '0') },
      }));
      const result = compileOntology(docs, { summary: true });
      console.log(JSON.stringify({ count: result.nodeCount, maxMtime: result.maxMtime }));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['--stack-size=512', '--input-type=module', '-e', script], {
      encoding: 'utf8',
    }));
    assert.deepEqual(result, { count: 100000, maxMtime: 99999 });
  });

  it('preserves numeric timestamp coercion and counts mixed relation targets', () => {
    for (const [times, expected] of [
      [[-10, -0, '', '42', undefined, 'invalid'], 42],
      [[-Infinity, NaN, null, -2], 0],
      [[1, Infinity], Infinity],
    ]) {
      const docs = times.map((mtime, index) => timedDoc(`elements/n${index}`, {
        kind: 'element', dependencies: ['elements/n0', 'missing'], elements: ['src/file.ts'],
      }, mtime));
      const result = compileOntology(docs);
      assert.equal(result.maxMtime, expected);
      assert.equal(result.resolvedEdgeCount, docs.length);
      assert.equal(result.externalEdgeCount, docs.length);
      assert.equal(result.unresolvedEdgeCount, docs.length);
      assert.equal(result.referencedOnlyCount, 2);
    }
    assert.equal(compileOntology([]).maxMtime, 0);
  });
});

describe('literal graph dictionary keys', () => {
  it('counts and indexes prototype-named domains and slugs as own JSON properties', () => {
    const names = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];
    const docs = names.map(name => doc(name, { kind: 'domain', domain: name, dependencies: names }));
    const plain = compileOntology(docs);
    for (const name of names) assert.equal(plain.byDomain[name], 1);
    const indexed = compileOntology(docs, { includeIndexes: true });
    assert.equal(indexed.graphHash, plain.graphHash);
    const delivered = JSON.parse(JSON.stringify(indexed));
    for (const name of names) {
      assert.deepEqual(delivered.indexes.byDomain[name], [name]);
      assert.equal(delivered.indexes.slugToUid[name], docs.find(item => item.slug === name).frontmatter.uid);
      assert.equal(delivered.indexes.out[name].length, names.length + 1);
      assert.equal(delivered.indexes.in[name].length, names.length + 1);
      assert.ok(Object.hasOwn(delivered.indexes.out, name));
    }
    assert.equal(Object.getPrototypeOf(indexed.indexes.out), Object.prototype);
    assert.equal(Object.getPrototypeOf(indexed.indexes.in), Object.prototype);
    assert.equal(Object.getPrototypeOf(indexed.indexes.slugToUid), Object.prototype);
  });
});
