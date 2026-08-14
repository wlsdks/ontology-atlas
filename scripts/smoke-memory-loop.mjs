#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callMcpTool } from '../cli/src/lib/mcp-call.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI = join(ROOT, 'cli', 'src', 'index.mjs');

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf-8',
  });
  if (options.allowFailure) return result;
  assert.equal(
    result.status,
    0,
    `${cmd} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function slugSet(rows) {
  return new Set(rows.map((row) => row.slug));
}

const startedAt = Date.now();
const temp = mkdtempSync(join(tmpdir(), 'ontology-atlas-memory-loop-'));
const project = join(temp, 'repo');
const vault = join(project, 'ontology');

mkdirSync(join(project, 'src', 'features', 'capture'), { recursive: true });
mkdirSync(join(project, 'src', 'features', 'search'), { recursive: true });
mkdirSync(join(project, 'src', 'shared'), { recursive: true });
writeFileSync(
  join(project, 'package.json'),
  JSON.stringify(
    {
      name: 'memory-loop-proof-app',
      type: 'module',
      scripts: { test: 'node --test' },
    },
    null,
    2,
  ),
);
writeFileSync(
  join(project, 'README.md'),
  [
    '# Memory Loop Proof App',
    '',
    '## Capture',
    '',
    'Capture project notes from local files.',
    '',
    '## Search',
    '',
    'Search captured notes without a server.',
    '',
  ].join('\n'),
);
writeFileSync(
  join(project, 'src', 'shared', 'store.ts'),
  'export const notes = new Map<string, string>();\n',
);
writeFileSync(
  join(project, 'src', 'features', 'capture', 'index.ts'),
  "import { notes } from '../../shared/store';\nexport function capture(id: string, body: string) { notes.set(id, body); }\n",
);
writeFileSync(
  join(project, 'src', 'features', 'search', 'index.ts'),
  "import { notes } from '../../shared/store';\nexport function search(q: string) { return [...notes.entries()].filter(([, body]) => body.includes(q)); }\n",
);

const init = run('node', [CLI, 'init', 'ontology'], { cwd: project });
const initOutput = init.stdout.replace(/\u001b\[[0-9;]*m/g, '');
assert.match(initOutput, /bootstrap \. --vault \.\/ontology/);
assert.equal(existsSync(join(project, '.mcp.json')), true);
assert.equal(existsSync(join(project, '.codex', 'config.toml')), true);

const bootstrap = run('node', [CLI, 'bootstrap', '.', '--vault', './ontology', '--json'], {
  cwd: project,
  allowFailure: true,
});
assert.equal(bootstrap.status, 3);
const bootstrapJson = JSON.parse(bootstrap.stdout);
assert.equal(bootstrapJson.mode, 'review');
assert.equal(bootstrapJson.writeEligible, false);
assert.equal(bootstrapJson.reason, 'approval_required');
assert.equal(bootstrapJson.next.writes, 0);
assert.equal(existsSync(join(vault, 'memory-loop-proof-app.md')), false);
assert.equal(existsSync(join(vault, 'capabilities', 'capture.md')), false);
assert.equal(existsSync(join(vault, 'capabilities', 'search.md')), false);

run('node', [CLI, 'validate', vault], { cwd: project });

const workspaceBrief = await callMcpTool(vault, 'query_ontology', {
  operation: 'workspace_brief',
});
assert.equal(workspaceBrief.operation, 'workspace_brief');
assert.ok(workspaceBrief.summary.nodes >= 3);
assert.ok(Array.isArray(workspaceBrief.health.checks));
assert.ok(workspaceBrief.health.checks.length > 0);

const agentBrief = await callMcpTool(vault, 'query_ontology', {
  operation: 'agent_brief',
});
assert.equal(agentBrief.operation, 'agent_brief');
assert.match(agentBrief.handoffPrompt, /shared codebase graph memory/);
assert.match(agentBrief.handoffPrompt, /Run these first-contact MCP calls in order/);
assert.ok(agentBrief.firstCalls.some((call) => call.arguments?.operation === 'workspace_brief'));
assert.ok(agentBrief.playbooks.some((playbook) => playbook.id === 'graph_traversal'));

const conceptRows = await callMcpTool(vault, 'list_concepts', { kind: 'capability', limit: 20 });
const capabilitySlugs = slugSet(conceptRows.nodes ?? []);
assert.equal(capabilitySlugs.has('capabilities/example-capability'), true);

const captureProfile = await callMcpTool(vault, 'query_ontology', {
  operation: 'node_profile',
  slug: 'capabilities/example-capability',
});
assert.equal(captureProfile.operation, 'node_profile');
assert.equal(captureProfile.node.slug, 'capabilities/example-capability');

run('git', ['init', '-q'], { cwd: project });
run('git', ['-c', 'user.name=ontology-atlas smoke', '-c', 'user.email=smoke@example.invalid', 'add', '.'], {
  cwd: project,
});
run(
  'git',
  [
    '-c',
    'user.name=ontology-atlas smoke',
    '-c',
    'user.email=smoke@example.invalid',
    'commit',
    '-q',
    '-m',
    'baseline memory loop',
  ],
  { cwd: project },
);

mkdirSync(join(project, 'src', 'features', 'export'), { recursive: true });
writeFileSync(
  join(project, 'src', 'features', 'export', 'index.ts'),
  "import { notes } from '../../shared/store';\nexport function exportNotes() { return JSON.stringify([...notes.entries()]); }\n",
);

const changedFiles = run('git', ['status', '--short', '--untracked-files=all'], { cwd: project })
  .stdout.trim()
  .split('\n')
  .map((line) => line.replace(/^\?\?\s+/, '').trim())
  .filter(Boolean);
assert.deepEqual(changedFiles, ['src/features/export/index.ts']);

const proposal = await callMcpTool(vault, 'analyze_repo_structure', {
  rootPath: project,
});
assert.equal(proposal.framework, 'fsd');
assert.ok(
  proposal.capabilities.some(
    (candidate) =>
      candidate.slug === 'capabilities/export' &&
      candidate.evidence?.source === 'src/features/export',
  ),
  'analyze_repo_structure should propose the new code capability without mutating the vault',
);

const afterProposalRows = await callMcpTool(vault, 'list_concepts', {
  kind: 'capability',
  limit: 50,
});
const afterProposalSlugs = slugSet(afterProposalRows.nodes ?? []);
assert.equal(afterProposalSlugs.has('capabilities/export'), false);

const elapsedMs = Date.now() - startedAt;
assert.ok(elapsedMs < 10 * 60 * 1000, `memory loop smoke exceeded 10 minutes: ${elapsedMs}ms`);

console.log(
  `memory loop smoke passed: ${project}\n` +
    `  loop: init -> bootstrap -> validate -> workspace_brief -> agent_brief -> node_profile -> sync proposal\n` +
    `  proposal: capabilities/export from ${changedFiles[0]}\n` +
    `  elapsed: ${elapsedMs}ms`,
);
