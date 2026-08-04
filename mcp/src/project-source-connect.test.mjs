/**
 * Project source connect — inference, minting, sidecar round trip, remedy.
 *
 * The defect these cover: the receipt vocabulary named `connect_source` as the
 * next action and nothing anywhere could perform it. Each test below fails if
 * one of the four halves goes missing again — nomination, scoring, persistence,
 * prescription.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  PROJECT_SOURCE_MANIFEST_FILES,
  inferProjectSourceProposal,
  rankProjectSourceCandidates,
  rateProjectSourceCandidate,
} from './project-source-inference.mjs';
import { collectProjectSourceCandidates, inferProjectSourceRoot } from './project-source-discovery.mjs';
import { deriveProjectSourceWitnessesFromDocs } from './project-source-witnesses.mjs';
import {
  PROJECT_SOURCE_STATE_RELATIVE_PATH,
  buildProjectSourceReceipt,
  readProjectSourceBindings,
  readProjectSourceView,
  removeProjectSourceBindings,
  writeProjectSourceBinding,
} from './project-source-receipt.mjs';
import { projectSourceRemedy } from './project-source-remedy.mjs';

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ontology-atlas-connect-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function gitInit(path) {
  execFileSync('git', ['-C', path, 'init', '-q'], { stdio: 'ignore' });
  execFileSync('git', ['-C', path, 'config', 'user.email', 'test@example.com'], { stdio: 'ignore' });
  execFileSync('git', ['-C', path, 'config', 'user.name', 'test'], { stdio: 'ignore' });
}

describe('candidate ranking', () => {
  it('prefers the enclosing git repository over a nearer manifest', () => {
    const ranked = rankProjectSourceCandidates([
      { rootPath: '/repo/app', kind: 'folder', marker: 'ancestor_project_manifest', ancestorDepth: 1, evidence: ['package.json'] },
      { rootPath: '/repo', kind: 'git', marker: 'enclosing_git_repository', ancestorDepth: 2, evidence: ['.git'] },
    ]);
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0].rootPath, '/repo');
  });

  it('prefers the nearest manifest when there is no repository', () => {
    const ranked = rankProjectSourceCandidates([
      { rootPath: '/outer', kind: 'folder', marker: 'ancestor_project_manifest', ancestorDepth: 4, evidence: ['package.json'] },
      { rootPath: '/outer/inner', kind: 'folder', marker: 'ancestor_project_manifest', ancestorDepth: 1, evidence: ['package.json'] },
    ]);
    assert.equal(ranked[0].rootPath, '/outer/inner');
  });

  it('drops malformed candidates instead of ranking them', () => {
    assert.deepEqual(rankProjectSourceCandidates([{ rootPath: '/x', marker: 'nope' }, null, 3]), []);
  });
});

describe('confidence', () => {
  const gitCandidate = { rootPath: '/repo', kind: 'git', marker: 'enclosing_git_repository', ancestorDepth: 1, evidence: [] };
  const manifestCandidate = { ...gitCandidate, marker: 'ancestor_project_manifest', kind: 'folder' };

  it('is high only when a repository is nominated and its declared paths land', () => {
    assert.equal(rateProjectSourceCandidate(gitCandidate, { total: 10, supported: 9, missing: 1 }), 'high');
    assert.equal(rateProjectSourceCandidate(gitCandidate, { total: 10, supported: 6, missing: 4 }), 'medium');
    assert.equal(rateProjectSourceCandidate(gitCandidate, { total: 10, supported: 1, missing: 9 }), 'low');
  });

  it('never reaches high on a manifest guess', () => {
    assert.equal(rateProjectSourceCandidate(manifestCandidate, { total: 10, supported: 10, missing: 0 }), 'medium');
    assert.equal(rateProjectSourceCandidate(manifestCandidate, { total: 10, supported: 5, missing: 5 }), 'low');
  });

  it('reports no proposal rather than a low-confidence guess when nothing is nominated', () => {
    const proposal = inferProjectSourceProposal({ vaultRootPath: '/v', candidates: [] });
    assert.equal(proposal.status, 'none');
    assert.equal(proposal.reason, 'no_enclosing_source');
    assert.equal(proposal.candidate, null);
  });
});

describe('discovery', () => {
  it('nominates the git repository the vault lives inside', () => {
    gitInit(root);
    const vault = join(root, 'docs', 'ontology');
    mkdirSync(vault, { recursive: true });
    const proposal = inferProjectSourceRoot(vault);
    assert.equal(proposal.status, 'proposed');
    assert.equal(proposal.reason, 'enclosing_git_repository');
    assert.equal(proposal.candidate.ancestorDepth, 2);
  });

  it('falls back to the nearest ancestor manifest with no git', () => {
    writeFileSync(join(root, 'package.json'), '{}\n');
    const vault = join(root, 'vault');
    mkdirSync(vault, { recursive: true });
    const proposal = inferProjectSourceRoot(vault);
    assert.equal(proposal.status, 'proposed');
    assert.equal(proposal.reason, 'ancestor_project_manifest');
    assert.deepEqual(proposal.candidate.evidence, ['package.json']);
  });

  it('never nominates the filesystem root or the home directory', () => {
    const { candidates } = collectProjectSourceCandidates(root);
    for (const candidate of candidates) {
      assert.notEqual(candidate.rootPath, '/');
      assert.notEqual(candidate.rootPath, process.env.HOME);
    }
  });

  it('recognises every documented manifest marker (the list is not decorative)', () => {
    assert.ok(PROJECT_SOURCE_MANIFEST_FILES.length >= 10);
    for (const manifest of PROJECT_SOURCE_MANIFEST_FILES) {
      const box = mkdtempSync(join(tmpdir(), 'ontology-atlas-manifest-'));
      try {
        writeFileSync(join(box, manifest), '');
        const vault = join(box, 'vault');
        mkdirSync(vault);
        assert.equal(inferProjectSourceRoot(vault).status, 'proposed', manifest);
      } finally {
        rmSync(box, { recursive: true, force: true });
      }
    }
  });
});

describe('witnesses', () => {
  const docs = [
    { slug: 'music-streaming', frontmatter: { kind: 'project', title: 'Music', path: 'src/app' } },
    {
      slug: 'capabilities/play',
      frontmatter: { kind: 'capability', title: 'Play', path: 'src/play', elements: ['src/play/engine.ts', 'elements/not-a-path'] },
    },
    { slug: 'elements/engine', frontmatter: { kind: 'element', title: 'src/play/engine.ts' } },
    { slug: 'domains/audio', frontmatter: { kind: 'domain', title: 'Audio' } },
  ];

  it('collects declared paths once, in a stable order', () => {
    const witnesses = deriveProjectSourceWitnessesFromDocs({ projectSlug: 'music-streaming', docs });
    // Sorted by witness id, so the same vault always mints the same receipt.
    assert.deepEqual(
      witnesses.map((witness) => witness.id),
      ['capabilities/play:element:src/play/engine.ts', 'capabilities/play:path', 'music-streaming:path'],
    );
    assert.equal(witnesses.find((witness) => witness.path === 'src/app').role, 'entrypoint');
    assert.equal(witnesses.find((witness) => witness.path === 'src/play/engine.ts').role, 'implementation');
  });

  it('never turns a slug reference into a source claim', () => {
    const witnesses = deriveProjectSourceWitnessesFromDocs({ projectSlug: 'music-streaming', docs });
    assert.equal(witnesses.some((witness) => witness.path === 'elements/not-a-path'), false);
  });
});

describe('receipt minting', () => {
  const probe = {
    sourceId: 'sha256:abc',
    kind: 'git',
    revision: 'deadbeef',
    fingerprint: 'sha256:def',
    dirty: false,
    truncated: false,
    files: ['src/play/engine.ts', 'README.md'],
  };

  it('verifies a project whose declared paths all exist', () => {
    const receipt = buildProjectSourceReceipt({
      projectSlug: 'p',
      graphHash: 'project-graph-v1:00000000',
      probe,
      witnesses: [{ id: 'a', nodeSlug: 'capabilities/play', role: 'implementation', path: 'src/play/engine.ts' }],
      measuredAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(receipt.status, 'verified_current');
    assert.equal(receipt.topGap, null);
    assert.equal(receipt.nextAction.id, 'use_current_evidence');
  });

  it('names the first missing node instead of a bare failure', () => {
    const receipt = buildProjectSourceReceipt({
      projectSlug: 'p',
      graphHash: 'project-graph-v1:00000000',
      probe,
      witnesses: [{ id: 'a', nodeSlug: 'capabilities/gone', role: 'implementation', path: 'src/gone.ts' }],
    });
    assert.equal(receipt.status, 'review_required');
    assert.deepEqual(receipt.topGap, { id: 'declared_source_path_missing', nodeSlug: 'capabilities/gone' });
    assert.deepEqual(receipt.nextAction, { id: 'repair_source_path', target: 'capabilities/gone' });
  });

  it('asks for evidence when the ontology declares no paths at all', () => {
    const receipt = buildProjectSourceReceipt({
      projectSlug: 'p',
      graphHash: 'project-graph-v1:00000000',
      probe,
      witnesses: [],
    });
    assert.equal(receipt.status, 'needs_evidence');
    assert.equal(receipt.nextAction.id, 'record_source_role');
  });
});

describe('sidecar round trip', () => {
  const receipt = () => buildProjectSourceReceipt({
    projectSlug: 'p',
    graphHash: 'project-graph-v1:00000000',
    probe: {
      sourceId: 'sha256:abc',
      kind: 'git',
      revision: 'deadbeef',
      fingerprint: 'sha256:def',
      dirty: false,
      truncated: false,
      files: ['src/a.ts'],
    },
    witnesses: [{ id: 'a', nodeSlug: 'capabilities/a', role: 'implementation', path: 'src/a.ts' }],
    measuredAt: '2026-01-01T00:00:00.000Z',
  });
  const binding = (projectSlug = 'p') => ({
    projectSlug,
    sourceId: 'sha256:abc',
    rootPath: '/private/fixture/root',
    kind: 'git',
    boundAt: '2026-01-01T00:00:00.000Z',
    receipt: { ...receipt(), projectSlug },
  });

  it('connects, then disconnects back to the unbound diagnosis', () => {
    assert.equal(readProjectSourceView(root, 'p').status, 'not_measured');
    assert.equal(writeProjectSourceBinding(root, binding()).status, 'written');
    assert.equal(readProjectSourceView(root, 'p', 'project-graph-v1:00000000').status, 'verified_current');

    const removed = removeProjectSourceBindings(root, 'p');
    assert.equal(removed.status, 'removed');
    assert.equal(removed.removed, 1);
    const after = readProjectSourceView(root, 'p');
    assert.equal(after.status, 'not_measured');
    assert.deepEqual(after.nextAction, { id: 'connect_source' });
  });

  it('keeps other projects when one is replaced or removed', () => {
    writeProjectSourceBinding(root, binding('p'));
    writeProjectSourceBinding(root, binding('q'));
    writeProjectSourceBinding(root, binding('p'));
    assert.equal(readProjectSourceBindings(root).bindings.length, 2);
    removeProjectSourceBindings(root, 'p');
    const remaining = readProjectSourceBindings(root).bindings;
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].projectSlug, 'q');
  });

  it('refuses to clobber a malformed sidecar unless repair is stated', () => {
    mkdirSync(join(root, '.ontology-atlas'), { recursive: true });
    writeFileSync(join(root, PROJECT_SOURCE_STATE_RELATIVE_PATH), '{ not json');
    assert.equal(writeProjectSourceBinding(root, binding()).status, 'blocked_malformed');
    assert.equal(writeProjectSourceBinding(root, binding(), { repair: true }).status, 'written');
  });

  it('keeps the private absolute root out of git', () => {
    writeProjectSourceBinding(root, binding());
    assert.match(readFileSync(join(root, '.ontology-atlas', '.gitignore'), 'utf8'), /^\*$/m);
  });
});

describe('remedy', () => {
  const ACTION_IDS = [
    'connect_source',
    'repair_source_binding',
    'measure_source',
    'record_source_role',
    'repair_source_path',
    'review_inventory_limit',
    'remeasure_source',
    'use_current_evidence',
  ];

  it('maps every action id in the receipt vocabulary — none may be a dead name', () => {
    for (const id of ACTION_IDS) {
      const remedy = projectSourceRemedy({ projectSlug: 'p', nextAction: { id } });
      assert.equal(remedy.actionId, id);
      if (id === 'use_current_evidence') {
        assert.equal(remedy.resolvable, false, id);
        assert.equal(remedy.tool, null, id);
      } else {
        assert.equal(remedy.resolvable, true, id);
        assert.ok(remedy.tool?.name, id);
        assert.ok(remedy.cli?.command, id);
      }
    }
  });

  it('offers the undo alongside every source binding write', () => {
    const remedy = projectSourceRemedy({ projectSlug: 'p', nextAction: { id: 'connect_source' } });
    assert.equal(remedy.tool.name, 'connect_project_source');
    assert.equal(remedy.tool.arguments.confirm, true);
    assert.equal(remedy.undo.tool.name, 'disconnect_project_source');
  });

  it('carries the offending node into a path repair', () => {
    const remedy = projectSourceRemedy({
      projectSlug: 'p',
      nextAction: { id: 'repair_source_path', target: 'capabilities/gone' },
    });
    assert.equal(remedy.tool.name, 'patch_concept');
    assert.equal(remedy.tool.arguments.slug, 'capabilities/gone');
    assert.equal(remedy.requiresHuman, 'authoring');
  });
});
