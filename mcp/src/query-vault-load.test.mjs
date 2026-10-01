import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('graph read requests load every vault document once and observe edits on the next request', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-query-vault-load-')));
  const docs = [
    ['project-p', { kind: 'project', domains: ['domains/p'] }],
    ['domains/p', { kind: 'domain', capabilities: ['capabilities/a'] }],
    ['capabilities/a', { kind: 'capability', domain: 'domains/p' }],
    ['project-q', { kind: 'project', domains: [] }],
  ];
  try {
    mkdirSync(join(root, 'domains'));
    mkdirSync(join(root, 'capabilities'));
    for (const [slug, frontmatter] of docs) {
      const raw = ['---', ...Object.entries({ uid: randomUUID(), slug, title: slug, ...frontmatter })
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`), '---', 'Recorded meaning.',
      ].join('\n');
      const path = join(root, `${slug}.md`);
      writeFileSync(path, raw);
      utimesSync(path, 1, 1);
    }
    writeFileSync(join(root, 'note.md'), '---\ntitle: Note\nmalformed header\n---\nA non-node document.\n');
    const graphModule = new URL('./tools/graph.mjs', import.meta.url).href;
    const validationModule = new URL('./tools/validate-vault.mjs', import.meta.url).href;
    // An isolated process with one explicit root; counts actual descriptor opens,
    // not time or loader names.
    const script = `
      import fs from 'node:fs';
      import crypto from 'node:crypto';
      import { syncBuiltinESMExports } from 'node:module';
      import { isAbsolute, relative, sep } from 'node:path';
      const root = process.env.OATLAS_VAULT;
      const originalOpen = fs.openSync;
      const reads = new Map();
      fs.openSync = function(path, ...args) {
        if (typeof path === 'string' && path.endsWith('.md')) {
          const local = relative(root, path);
          if (!isAbsolute(local) && local !== '..' && !local.startsWith('..' + sep)) {
            reads.set(local, (reads.get(local) ?? 0) + 1);
          }
        }
        return originalOpen.call(this, path, ...args);
      };
      const originalCreateHash = crypto.createHash;
      let graphInputs = [];
      crypto.createHash = function(...args) {
        const hash = originalCreateHash(...args);
        const originalUpdate = hash.update;
        hash.update = function(data, ...options) {
          if (typeof data === 'string' && data.startsWith('{')) {
            try {
              const value = JSON.parse(data);
              if (Array.isArray(value.nodes) && Array.isArray(value.edges)
                && Array.isArray(value.aliases) && Array.isArray(value.issues)) graphInputs.push(value);
            } catch {}
          }
          return originalUpdate.call(this, data, ...options);
        };
        return hash;
      };
      syncBuiltinESMExports();
      const { queryOntologyTool } = await import(${JSON.stringify(graphModule)});
      const { validateVaultTool } = await import(${JSON.stringify(validationModule)});
      const operations = ['overview', 'health', 'workspace_brief', 'agent_brief',
        'growth_plan', 'maintenance_plan', 'builder_context', 'meaning_repair_review'];
      const observations = [];
      let brief;
      for (const operation of operations) {
        reads.clear();
        const result = await queryOntologyTool({ operation, project: 'project-p',
          ...(operation === 'builder_context' ? { slug: 'capabilities/a' } : {}),
          ...(operation === 'meaning_repair_review' ? {
            reviewRevision: 'sha256:' + '0'.repeat(64),
            expectedGraphHash: 'project-graph-v1:00000000',
            expectedSourceFingerprint: 'unavailable',
          } : {}), limit: 5 });
        observations.push({ operation, reads: [...reads.values()] });
        if (operation === 'agent_brief') brief = result;
      }
      const measureBrief = async (project) => {
        graphInputs = [];
        const value = await queryOntologyTool({ operation: 'agent_brief', project, limit: 5 });
        return { compiles: graphInputs.length, nodes: graphInputs.flatMap((input) => input.nodes),
          project: value.projectSlug, maxMtime: value.graph.maxMtime,
          compileIssues: value.health.checks.find((check) => check.id === 'compile_issues').count,
          validationErrors: value.health.validation.summary.errorFiles };
      };
      const warm = await measureBrief('project-p');
      const switched = await measureBrief('project-q');
      const returned = await measureBrief('project-p');
      const path = root + '/capabilities/a.md';
      const raw = fs.readFileSync(path, 'utf8');
      fs.writeFileSync(path, raw.replace('title: "capabilities/a"', 'title: "Updated title"'));
      fs.utimesSync(path, 1, 1);
      const updated = await queryOntologyTool({ operation: 'node_profile', slug: 'capabilities/a' });
      const changed = await measureBrief('project-p');
      fs.utimesSync(path, 2, 2);
      const touched = await measureBrief('project-p');
      fs.rmSync(root + '/project-q.md');
      const afterDelete = await queryOntologyTool({ operation: 'overview' });
      const withNote = await measureBrief('project-p');
      reads.clear();
      const standalone = validateVaultTool();
      const standaloneReads = [...reads.values()];
      fs.rmSync(root + '/note.md');
      const full = await measureBrief('project-p');
      const fullWarm = await measureBrief('project-p');
      console.log(JSON.stringify({ observations, scanned: brief.health.validation.scanned,
        updatedTitle: updated.node.title, remainingNodes: afterDelete.graph.nodes,
        standaloneScanned: standalone.scanned, standaloneReads,
        warm, switched, returned, changed, touched, withNote, full, fullWarm }));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root },
    }));
    assert.equal(result.observations.length, 8);
    for (const { operation, reads } of result.observations) {
      assert.equal(reads.length, 5, `${operation} must read the full vault, including non-node documents`);
      assert.deepEqual(reads, [1, 1, 1, 1, 1], `${operation} must not reopen the vault during one request`);
    }
    assert.equal(result.scanned, 5, 'project-scoped briefs must still validate the entire vault');
    assert.equal(result.updatedTitle, 'Updated title', 'same-mtime edits must invalidate the graph');
    assert.equal(result.remainingNodes, 3, 'a later request must observe deletions');
    assert.equal(result.standaloneScanned, 4);
    assert.deepEqual(result.standaloneReads, [1, 1, 1, 1], 'standalone validation must still perform a fresh read');
    assert.equal(result.warm.compiles, 0, 'an unchanged project must reuse its compiled artifact');
    assert.equal(result.switched.compiles, 1);
    assert.equal(result.switched.project, 'project-q', 'project scopes must never share the wrong artifact');
    assert.equal(result.returned.compiles, 1, 'retain at most one separate project projection per parent');
    assert.equal(result.changed.compiles, 1, 'changed bytes must invalidate a project projection');
    assert.equal(result.changed.nodes.find((node) => node.slug === 'capabilities/a').title, 'Updated title');
    assert.equal(result.touched.compiles, 2, 'a changed mtime must refresh both artifacts even when graphHash is unchanged');
    assert.equal(result.touched.maxMtime, 2000);
    assert.equal(result.withNote.compiles, 1, 'non-node documents prevent whole-artifact reuse');
    assert.equal(result.withNote.compileIssues, 0, 'outside diagnostics must not leak into the selected project');
    assert.equal(result.withNote.validationErrors, 1, 'whole-vault validation must still report the outside error');
    assert.equal(result.full.compiles, 1, 'identical full-scope inputs need only the parent compilation');
    assert.equal(result.fullWarm.compiles, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('write-side maintenance and project-source tools read each vault document once per call', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-write-vault-load-')));
  const sourceRoot = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-write-vault-source-')));
  writeFileSync(join(sourceRoot, 'index.js'), 'export const ready = true;\n');
  try {
    mkdirSync(join(root, 'domains'));
    mkdirSync(join(root, 'capabilities'));
    for (const [slug, frontmatter] of [
      ['project', { kind: 'project', domains: ['domains/p'] }],
      ['domains/p', { kind: 'domain', capabilities: ['capabilities/a'] }],
      ['capabilities/a', { kind: 'capability', domain: 'domains/p' }],
    ]) {
      writeFileSync(join(root, `${slug}.md`), ['---', ...Object.entries({ uid: randomUUID(), slug, title: slug, ...frontmatter })
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`), '---', 'Recorded meaning.',
      ].join('\n'));
    }
    const maintenanceModule = new URL('./tools/maintenance.mjs', import.meta.url).href;
    const projectSourceModule = new URL('./tools/project-source.mjs', import.meta.url).href;
    const script = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { isAbsolute, relative, sep } from 'node:path';
      const root = process.env.OATLAS_VAULT;
      const originalOpen = fs.openSync;
      const reads = new Map();
      fs.openSync = function(path, ...args) {
        if (typeof path === 'string' && path.endsWith('.md')) {
          const local = relative(root, path);
          if (!isAbsolute(local) && local !== '..' && !local.startsWith('..' + sep)) {
            reads.set(local, (reads.get(local) ?? 0) + 1);
          }
        }
        return originalOpen.call(this, path, ...args);
      };
      syncBuiltinESMExports();
      const { compactPostWriteMaintenance } = await import(${JSON.stringify(maintenanceModule)});
      const { connectProjectSourceTool, finalizeProjectMeaningTool } = await import(${JSON.stringify(projectSourceModule)});
      const observe = (run) => {
        reads.clear();
        let outcome = 'returned';
        try { run(); } catch (error) { outcome = error.message.slice(0, 80); }
        return { outcome, reads: [...reads.values()] };
      };
      const projectMtime = fs.statSync(root + '/project.md').mtimeMs;
      console.log(JSON.stringify({
        maintenance: observe(() => compactPostWriteMaintenance()),
        connect: observe(() => connectProjectSourceTool({ projectSlug: 'project', rootPath: process.env.SOURCE_ROOT })),
        finalize: observe(() => finalizeProjectMeaningTool({ projectSlug: 'project', expected_mtime: projectMtime })),
      }));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root, SOURCE_ROOT: sourceRoot },
    }));
    assert.equal(result.maintenance.outcome, 'returned');
    assert.equal(result.connect.outcome, 'returned');
    assert.match(result.finalize.outcome, /finalize_project_meaning blocked: current project witness inventory/);
    for (const [tool, { reads }] of Object.entries(result)) {
      assert.deepEqual(reads, [1, 1, 1], `${tool} must read each document once`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('find_neighbors lists each vault directory once however many references it resolves', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-neighbors-listing-')));
  try {
    mkdirSync(join(root, 'domains'));
    mkdirSync(join(root, 'capabilities'));
    const capabilities = Array.from({ length: 12 }, (_, index) => `capabilities/c-${index}`);
    const write = (slug, frontmatter) => writeFileSync(join(root, `${slug}.md`), [
      '---',
      ...Object.entries({ uid: randomUUID(), slug, title: slug, ...frontmatter })
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
      '---',
      'Recorded meaning.',
    ].join('\n'));
    write('project', { kind: 'project', domains: ['domains/core'] });
    write('domains/core', { kind: 'domain', capabilities });
    capabilities.forEach((slug, index) => write(slug, {
      kind: 'capability',
      domain: 'domains/core',
      depends_on: [capabilities[(index + 1) % capabilities.length], capabilities[(index + 5) % capabilities.length]],
    }));
    const readModule = new URL('./tools/read.mjs', import.meta.url).href;
    const script = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const listings = new Map();
      const originalReaddir = fs.readdirSync;
      fs.readdirSync = function(path, ...args) {
        const key = String(path);
        listings.set(key, (listings.get(key) ?? 0) + 1);
        return originalReaddir.call(this, path, ...args);
      };
      syncBuiltinESMExports();
      const { findNeighborsTool } = await import(${JSON.stringify(readModule)});
      listings.clear();
      const result = findNeighborsTool({ slug: 'capabilities/c-3' });
      console.log(JSON.stringify({ edges: result.totalEdges, listings: [...listings.values()] }));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root },
    }));
    assert.equal(result.edges, 6, 'its domain and two dependencies out, three edges in');
    assert.deepEqual(result.listings, [1, 1, 1], 'the root, domains/ and capabilities/ are each listed once');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('single concept reads reuse the request inventory and refresh it on the next request', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-concept-load-')));
  const uid = randomUUID();
  const raw = (dependency) => `---\nuid: ${uid}\nkind: capability\ntitle: A\ndependencies: [${dependency}]\n---\nDefinition.`;
  try {
    writeFileSync(join(root, 'a.md'), raw('missing'));
    utimesSync(join(root, 'a.md'), 1, 1);
    writeFileSync(join(root, 'b.md'), `---\nuid: ${randomUUID()}\nkind: element\ntitle: B\n---\nTarget.`);
    const script = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { relative } from 'node:path';
      const root = process.env.OATLAS_VAULT, originalOpen = fs.openSync, counts = new Map();
      fs.openSync = function(path, ...args) {
        if (typeof path === 'string' && path.startsWith(root + '/') && path.endsWith('.md')) {
          const name = relative(root, path); counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        return originalOpen.call(this, path, ...args);
      };
      syncBuiltinESMExports();
      const { getConcept } = await import(${JSON.stringify(new URL('./tools/read.mjs', import.meta.url).href)});
      const observe = () => {
        counts.clear(); const result = getConcept({ slug: 'a', body: 'full' });
        return { counts: Object.fromEntries(counts), warnings: result.warnings ?? [], body: result.body };
      };
      const before = observe(), previous = fs.statSync(root + '/a.md');
      fs.writeFileSync(root + '/a.md', ${JSON.stringify(raw('b'))});
      fs.utimesSync(root + '/a.md', previous.atime, previous.mtime);
      const after = observe();
      console.log(JSON.stringify({ before, after }));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root },
    }));
    for (const value of [result.before, result.after]) {
      assert.deepEqual(value.counts, { 'a.md': 2, 'b.md': 1 });
      assert.equal(value.body.trim(), 'Definition.');
    }
    assert.ok(result.before.warnings.some(issue => issue.code === 'dangling-graph-reference'));
    assert.ok(!result.after.warnings.some(issue => issue.code === 'dangling-graph-reference'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unresolved graph references do not rescan every slug for each missing target', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-reference-index-')));
  try {
    const script = `
      const { groupDanglingIssuesBySlug } = await import(${JSON.stringify(new URL('./tools/vault-nodes.mjs', import.meta.url).href)});
      const docs = Array.from({ length: 1000 }, (_, i) => ({ slug: 'domain/part/n' + i,
        frontmatter: { dependencies: ['missing-' + i] } }));
      const original = String.prototype.endsWith; let candidateChecks = 0;
      String.prototype.endsWith = function(search, ...args) {
        if (typeof search === 'string' && search.startsWith('/missing-')) candidateChecks++;
        return original.call(this, search, ...args);
      };
      let issues;
      try { issues = groupDanglingIssuesBySlug(docs); }
      finally { String.prototype.endsWith = original; }
      const examples = groupDanglingIssuesBySlug([
        { slug: 'caller', frontmatter: { dependencies: ['domain/target', 'target', 'alias', 'unknown', 'omain/target', 'src/file.ts'], elements: ['src/file.ts'] } },
        { slug: 'first/domain/target', frontmatter: { slug: 'alias' } },
        { slug: 'second/domain/target', frontmatter: {} },
      ]);
      console.log(JSON.stringify({ candidateChecks, issueCount: [...issues.values()].reduce((n, list) => n + list.length, 0), examples: [...examples.values()].flat() }));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root },
    }));
    assert.equal(result.issueCount, 1000);
    assert.ok(result.candidateChecks <= 20_000, `missing targets caused ${result.candidateChecks} candidate checks`);
    assert.equal(result.examples.length, 3);
    assert.ok(result.examples.every(issue => issue.code === 'dangling-graph-reference'));
    for (const ref of ['unknown', 'omain/target', 'src/file.ts']) {
      assert.ok(result.examples.some(issue => issue.message.includes(`"${ref}"`)));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scoped graph warnings retain all peer identities without constructing other rows', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-scoped-warnings-')));
  try {
    const script = `
      const { groupDanglingIssuesBySlug } = await import(${JSON.stringify(new URL('./tools/vault-nodes.mjs', import.meta.url).href)});
      const docs = Array.from({ length: 100 }, (_, i) => ({ slug: 'root/n' + i,
        frontmatter: { uid: '00000000-0000-4000-8000-000000000001', slug: 'shared', dependencies: ['missing-' + i] } }));
      const full = groupDanglingIssuesBySlug(docs);
      const expected = full.get('root/n0');
      const original = Array.prototype.filter; let candidateChecks = 0;
      Array.prototype.filter = function(callback, receiver) {
        const tracked = this.length === docs.length && this[0] === 'root/n0';
        return original.call(this, (value, index, array) => {
          if (tracked) candidateChecks++;
          return callback.call(receiver, value, index, array);
        });
      };
      let result, counts;
      try {
        result = groupDanglingIssuesBySlug(docs, new Set(['root/n0']));
        counts = groupDanglingIssuesBySlug(docs, undefined, false);
      }
      finally { Array.prototype.filter = original; }
      console.log(JSON.stringify({ size: result.size, candidateChecks, expected, actual: result.get('root/n0'), counts: [...counts], expectedCounts: [...full].map(([slug, issues]) => [slug, issues.map(({ message, ...issue }) => issue)]) }));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root },
    }));
    assert.equal(result.size, 1);
    assert.deepEqual(result.actual, result.expected);
    assert.deepEqual(result.counts, result.expectedCounts);
    assert.ok(result.candidateChecks <= 1000, `peer filtering visited ${result.candidateChecks} candidates`);
    assert.deepEqual(result.actual.map(issue => issue.code), ['dangling-graph-reference', 'duplicate-slug', 'duplicate-uid']);
    assert.ok(result.actual[2].message.includes('root/n99'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('batch warnings cover rows discovered during reads without expanding unused peers', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-batch-warning-scope-')));
  try {
    for (let i = 0; i < 100; i++) {
      writeFileSync(join(root, `n${i}.md`), `---\nuid: 00000000-0000-4000-8000-000000000001\nkind: element\ntitle: N${i}\n---\nDefinition.`);
    }
    const script = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const { getConceptsBatch } = await import(${JSON.stringify(new URL('./tools/read.mjs', import.meta.url).href)});
      const choices = ['n0', 'n0']; let selectedReads = 0, candidateChecks = 0;
      const originalOpen = fs.openSync;
      fs.openSync = function(path, ...args) {
        if (path === process.env.OATLAS_VAULT + '/n0.md' && ++selectedReads === 2) choices[1] = 'n1';
        return originalOpen.call(this, path, ...args);
      };
      syncBuiltinESMExports();
      const originalFilter = Array.prototype.filter;
      Array.prototype.filter = function(callback, receiver) {
        const tracked = this.length === 100 && typeof this[0] === 'string' && /^n\\d+$/.test(this[0]);
        return originalFilter.call(this, (value, index, array) => {
          if (tracked) candidateChecks++;
          return callback.call(receiver, value, index, array);
        });
      };
      let result;
      try { result = getConceptsBatch({ slugs: choices }); }
      finally { Array.prototype.filter = originalFilter; fs.openSync = originalOpen; syncBuiltinESMExports(); }
      console.log(JSON.stringify({ result, candidateChecks }));
    `;
    const value = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root },
    }));
    assert.deepEqual(value.result.concepts.map(row => row.slug), ['n0', 'n1']);
    for (const row of value.result.concepts) {
      assert.equal(row.ok, true);
      assert.ok(row.warnings.some(issue => issue.code === 'duplicate-uid' && issue.message.includes('n99')));
    }
    assert.ok(value.candidateChecks <= 1000, `batch peer filtering visited ${value.candidateChecks} candidates`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UID batches avoid repeated full-inventory filtering while preserving row order', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-batch-uid-index-')));
  const uid = i => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
  try {
    for (let i = 0; i < 1000; i++) {
      writeFileSync(join(root, `n${i}.md`), `---\nuid: ${uid(i)}\nkind: element\ntitle: N${i}\n---\nDefinition.`);
    }
    const script = `
      const { getConceptsBatch } = await import(${JSON.stringify(new URL('./tools/read.mjs', import.meta.url).href)});
      const uid = i => '00000000-0000-4000-8000-' + i.toString(16).padStart(12, '0');
      const original = Array.prototype.filter; let candidateChecks = 0;
      Array.prototype.filter = function(callback, receiver) {
        const tracked = this.length === 1000 && this[0]?.frontmatter;
        return original.call(this, (value, index, array) => {
          if (tracked) candidateChecks++;
          return callback.call(receiver, value, index, array);
        });
      };
      let result;
      try { result = getConceptsBatch({ uids: Array.from({ length: 50 }, (_, i) => uid(49 - i)) }); }
      finally { Array.prototype.filter = original; }
      console.log(JSON.stringify({ candidateChecks, rows: result.concepts.map(row => ({ ok: row.ok, uid: row.uid, slug: row.slug })) }));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root },
    }));
    assert.ok(result.candidateChecks <= 2000, `UID selection visited ${result.candidateChecks} candidates`);
    assert.deepEqual(result.rows, Array.from({ length: 50 }, (_, i) => ({ ok: true, uid: uid(49 - i), slug: `n${49 - i}` })));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('indexed UID batches preserve primary priority and merged-identity ambiguity', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-batch-uid-lineage-')));
  const uid = i => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
  try {
    for (const [name, primary, merged] of [['a', 1, [1, 1, 3]], ['b', 2, [1, 3]], ['c', 5, [5, 5]]]) {
      writeFileSync(join(root, `${name}.md`), `---\nuid: ${uid(primary)}\nkind: element\ntitle: ${name}\nmerged_uids: ${JSON.stringify(merged.map(uid))}\n---\nDefinition.`);
    }
    const request = { uids: [uid(1), uid(2), uid(3), uid(5), uid(4)] };
    const script = `
      const { getConceptsBatch } = await import(${JSON.stringify(new URL('./tools/read.mjs', import.meta.url).href)});
      console.log(JSON.stringify(getConceptsBatch(${JSON.stringify(request)})));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root },
    }));
    assert.deepEqual(result.concepts.map(row => row.ok ? row.slug : 'error'), ['a', 'b', 'error', 'c', 'error']);
    assert.match(result.concepts[2].error, /Ambiguous merged uid/);
    assert.equal(result.concepts[4].missingUid, uid(4));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
