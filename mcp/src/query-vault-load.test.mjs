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
    writeFileSync(join(root, 'note.md'), 'An ordinary document without a graph kind.\n');
    const graphModule = new URL('./tools/graph.mjs', import.meta.url).href;
    const validationModule = new URL('./tools/validate-vault.mjs', import.meta.url).href;
    // An isolated process gives the server one explicit root. Count actual
    // descriptor opens rather than elapsed time or references to loader names.
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
      const path = root + '/capabilities/a.md';
      const raw = fs.readFileSync(path, 'utf8');
      fs.writeFileSync(path, raw.replace('title: "capabilities/a"', 'title: "Updated title"'));
      fs.utimesSync(path, 1, 1);
      const updated = await queryOntologyTool({ operation: 'node_profile', slug: 'capabilities/a' });
      fs.rmSync(root + '/project-q.md');
      const afterDelete = await queryOntologyTool({ operation: 'overview' });
      reads.clear();
      const standalone = validateVaultTool();
      console.log(JSON.stringify({ observations, scanned: brief.health.validation.scanned,
        updatedTitle: updated.node.title, remainingNodes: afterDelete.graph.nodes,
        standaloneScanned: standalone.scanned, standaloneReads: [...reads.values()] }));
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
