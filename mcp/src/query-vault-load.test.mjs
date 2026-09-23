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
    // An isolated process gives the server one explicit root. Count actual
    // descriptor opens rather than elapsed time or references to loader names.
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
