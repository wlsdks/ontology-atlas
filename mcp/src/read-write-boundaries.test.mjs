import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { runJsonRpcProcess } from '../../scripts/lib/mcp-test-rpc.mjs';
import { unwritableSlugIssue } from './schema.mjs';

const SERVER_ENTRY = resolve(dirname(fileURLToPath(import.meta.url)), 'index.js');
const OUTSIDE_MARKER = 'MARKER-OUTSIDE-VAULT';
const character = (codePoint) => String.fromCharCode(codePoint);
const scratchRoots = [];

after(() => {
  for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
});

function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-boundaries-'));
  scratchRoots.push(root);
  return root;
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

async function callTools(vault, calls, env = {}) {
  const { responses } = await runJsonRpcProcess({
    command: process.execPath,
    args: [SERVER_ENTRY],
    env: { ...process.env, OATLAS_VAULT: vault, OATLAS_REPO_ROOT: vault, ...env },
    requests: [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'boundaries', version: '1' } },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      ...calls.map(([name, args], index) => ({
        jsonrpc: '2.0',
        id: index + 2,
        method: 'tools/call',
        params: { name, arguments: args },
      })),
    ],
    timeoutMs: 20_000,
  });
  return calls.map((_, index) => {
    const result = responses.find((response) => response.id === index + 2)?.result;
    return { isError: result?.isError === true, text: String(result?.content?.[0]?.text ?? '') };
  });
}

function snapshot(root) {
  const files = new Map();
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.name === '.ontology-atlas') continue;
      if (entry.isDirectory()) visit(path);
      else files.set(relative(root, path), createHash('sha256').update(readFileSync(path)).digest('hex'));
    }
  };
  visit(root);
  return files;
}

describe('read_source reads only regular files inside the vault sources folder', () => {
  const base = scratch();
  const vault = join(base, 'vault');
  const outside = join(base, 'outside');
  write(join(outside, 'marker.txt'), `${OUTSIDE_MARKER}\n`);
  write(join(outside, 'blob.bin'), Buffer.from([0, 1, 2, 66, 73, 78]));
  write(join(vault, 'project.md'), '---\nkind: project\ntitle: P\nuid: 11111111-1111-4111-8111-111111111111\n---\n\nbody\n');
  write(join(vault, 'sources', 'plain.txt'), 'first line\nsecond line\n');
  write(join(vault, 'sources', '.git', 'config.txt'), 'MARKER-HIDDEN\n');
  write(join(vault, 'sources', 'credentials.json'), 'MARKER-CREDENTIAL\n');
  symlinkSync('../../outside/marker.txt', join(vault, 'sources', 'relative-link.txt'));
  symlinkSync(join(outside, 'marker.txt'), join(vault, 'sources', 'absolute-link.txt'));
  symlinkSync('../../outside/blob.bin', join(vault, 'sources', 'binary-named-text.txt'));
  symlinkSync('../../outside', join(vault, 'sources', 'linked-folder'));

  it('refuses every symbolic link, even in read-only mode, and never returns the target bytes', async () => {
    const paths = [
      'sources/relative-link.txt',
      'sources/absolute-link.txt',
      'sources/binary-named-text.txt',
      'sources/linked-folder/marker.txt',
    ];
    const results = await callTools(vault, paths.map((path) => ['read_source', { path }]), { OATLAS_READ_ONLY: '1' });
    for (const [index, result] of results.entries()) {
      assert.equal(result.isError, true, `${paths[index]} must be refused: ${result.text.slice(0, 200)}`);
      assert.match(result.text, /symbolic link/, `${paths[index]} must name the link rule`);
      assert.doesNotMatch(result.text, /MARKER-OUTSIDE-VAULT/, `${paths[index]} leaked the outside file`);
    }
  });

  it('refuses a hidden file or a credential-named file under sources, like the repository reader', async () => {
    const paths = ['sources/.git/config.txt', 'sources/credentials.json'];
    const results = await callTools(vault, paths.map((path) => ['read_source', { path }]));
    for (const [index, result] of results.entries()) {
      assert.equal(result.isError, true, `${paths[index]} must be refused: ${result.text.slice(0, 200)}`);
      assert.match(result.text, /hidden file or has a credential-like name/, `${paths[index]} must name the rule`);
      assert.doesNotMatch(result.text, /MARKER-(HIDDEN|CREDENTIAL)/, `${paths[index]} was read`);
    }
  });

  it('still reads a regular file under sources with its hash', async () => {
    const [result] = await callTools(vault, [['read_source', { path: 'sources/plain.txt' }]]);
    assert.equal(result.isError, false, result.text.slice(0, 200));
    const answer = JSON.parse(result.text);
    assert.deepEqual(answer.units.map((unit) => unit.text), ['first line', 'second line']);
    assert.equal(answer.sha256, createHash('sha256').update('first line\nsecond line\n').digest('hex'));
  });
});

describe('write tools never touch agent instruction files or hidden folders', () => {
  const vault = scratch();
  write(join(vault, 'AGENTS.md'), '# This folder is an Ontology Atlas vault\n\nCall the MCP server first.\n');
  write(join(vault, 'CLAUDE.md'), '# Ontology Atlas vault\n\n@AGENTS.md\n');
  write(join(vault, 'README.md'), '---\nuid: 33333333-3333-4333-8333-333333333333\nslug: README\nkind: vault-readme\ntitle: My vault\n---\n\n# My vault\n');
  write(join(vault, '.claude', 'skills', 'atlas-grow', 'SKILL.md'), '---\nname: atlas-grow\n---\n\n# /atlas-grow\n');
  write(join(vault, 'project.md'), '---\nkind: project\ntitle: P\nuid: 11111111-1111-4111-8111-111111111111\n---\n\nbody\n');
  write(join(vault, 'domains', 'd.md'), '---\nkind: domain\ntitle: D\nuid: 22222222-2222-4222-8222-222222222222\n---\n\nbody\n');

  it('refuses each write, rename and delete that names one, and leaves every file byte-identical', async () => {
    const before = snapshot(vault);
    const calls = [
      ['patch_concept', { slug: 'AGENTS', body: 'MARKER-PATCHED-BODY\n' }],
      ['patch_concept', { slug: 'CLAUDE', frontmatter: { marker: 'MARKER' }, body: 'MARKER-PATCHED-BODY\n' }],
      ['patch_concept', { slug: '.claude/skills/atlas-grow/SKILL', frontmatter: { marker: 'MARKER' }, body: 'MARKER-PATCHED-BODY' }],
      ['add_concept', { slug: '.claude/commands/marker', kind: 'document', title: 'marker', body: 'MARKER-CREATED' }],
      ['add_concept', { slug: '.git/info/notes', kind: 'project', title: 'p', body: 'x' }],
      ['add_concept', { slug: 'domains/claude', kind: 'document', title: 'nested', body: 'nested instructions' }],
      ['add_concept', { slug: 'domains/../GEMINI', kind: 'document', title: 'g', body: 'x' }],
      ['patch_concept', { slug: 'README', body: 'replaced' }],
      ['rename_concept', { oldSlug: 'domains/d', newSlug: 'Agents.override', confirm: true }],
      ['delete_concept', { slug: 'AGENTS', confirm: true, force: true }],
    ];
    const results = await callTools(vault, calls);
    for (const [index, result] of results.entries()) {
      assert.equal(result.isError, true, `${calls[index][0]} ${calls[index][1].slug ?? calls[index][1].newSlug} was allowed`);
      assert.match(result.text, /write tool never/, `${calls[index][0]} must name the write rule: ${result.text.slice(0, 200)}`);
    }
    assert.deepEqual(snapshot(vault), before);
  });

  it('refuses a slug that carries a line break or an invisible character, in add and rename', async () => {
    const before = snapshot(vault);
    const calls = [
      ['add_concept', { slug: 'domains/two\nlines', kind: 'domain', title: 'Two lines' }],
      ['add_concept', { slug: `domains/zero${character(0x200b)}width`, kind: 'domain', title: 'Zero width' }],
      ['rename_concept', { oldSlug: 'domains/d', newSlug: 'domains/d]]\n\nMARKER-LINE\n\n[[x', confirm: true }],
    ];
    const results = await callTools(vault, calls);
    for (const [index, result] of results.entries()) {
      assert.equal(result.isError, true, `${calls[index][0]} was allowed`);
      assert.match(result.text, /control or invisible formatting character/, `${calls[index][0]} must name the rule`);
    }
    assert.deepEqual(snapshot(vault), before);
  });

  it('still writes an ordinary node', async () => {
    const [created, patched] = await callTools(vault, [
      ['add_concept', { slug: 'domains/payments', kind: 'domain', title: 'Payments' }],
      ['patch_concept', { slug: 'domains/d', frontmatter: { title: 'D renamed' } }],
    ]);
    assert.equal(created.isError, false, created.text.slice(0, 200));
    assert.equal(patched.isError, false, patched.text.slice(0, 200));
    assert.match(readFileSync(join(vault, 'domains', 'payments.md'), 'utf8'), /title: Payments/);
  });
});

describe('the unwritable slug rule', () => {
  const refused = [
    'AGENTS', 'agents', 'Agents', 'AGENTS.override', 'CLAUDE', 'claude.local', 'GEMINI', 'domains/CLAUDE',
    'capabilities/agents', `AGENT${character(0x17f)}`, 'README', 'readme', '.claude/commands/x', 'a/.hidden/b', '.git/x',
    'domains/../x', './x', 'a\\.claude\\x', 'AGENTS~1', 'domains/NOTES~12',
    `AGE${character(0x200c)}NTS`, `${character(0xfeff)}AGENTS`, `AGE${character(0xad)}NTS`, 'domains/two\nlines',
    `domains/one${character(0x2028)}two`, `domains/bidi${character(0x202e)}`,
  ];
  const allowed = [
    'capabilities/agent-runtime', 'domains/agents-destination', 'elements/claude-adapter', 'docs/README',
    'project', 'overview', 'services/auth/api', 'capabilities/readme-renderer', 'capabilities/a~b', 'domains/tilde~',
  ];

  it('refuses hidden segments, instruction file names in any case or disguise, short-name tails, and the root README', () => {
    for (const slug of refused) assert.notEqual(unwritableSlugIssue(slug), null, `${slug} should be refused`);
  });

  it('allows node names that only contain those words', () => {
    for (const slug of allowed) assert.equal(unwritableSlugIssue(slug), null, `${slug} should be allowed`);
  });
});

describe('import analysis never walks a source root that leaves the repository', () => {
  const base = scratch();
  const repo = join(base, 'repo');
  write(join(base, 'outside', 'nested', 'leak.js'), "import x from 'OUTSIDE-ONLY-MODULE';\n");
  write(join(repo, 'lib', 'inside.js'), "import y from 'INSIDE-MODULE';\n");
  write(join(repo, 'project.md'), '---\nkind: project\ntitle: P\nuid: 11111111-1111-4111-8111-111111111111\n---\n\nbody\n');
  symlinkSync('../outside', join(repo, 'src'));

  it('skips a symbolic-link source folder and a parent-relative one, and still reads the real folder', async () => {
    const [byDefault, byArgument] = await callTools(repo, [
      ['infer_imports', { reconcile: false }],
      ['infer_imports', { reconcile: false, sourceFolders: ['../outside', 'lib'] }],
    ]);
    for (const result of [byDefault, byArgument]) {
      assert.equal(result.isError, false, result.text.slice(0, 200));
      assert.doesNotMatch(result.text, /OUTSIDE-ONLY-MODULE/, 'a module outside the repository was scanned');
      assert.match(result.text, /INSIDE-MODULE/, 'the real source folder must still be scanned');
    }
  });
});

describe('a rename leaves an agent instruction file that links to the node untouched', () => {
  it('rewrites ordinary referrers, keeps the linking AGENTS.md byte-identical, and names it for a person', async () => {
    const vault = scratch();
    write(join(vault, 'AGENTS.md'), '# Rules\n\nSee [[domains/d]] first.\n');
    write(join(vault, 'project.md'), '---\nkind: project\ntitle: P\nuid: 11111111-1111-4111-8111-111111111111\n---\n\nbody\n');
    write(join(vault, 'domains', 'd.md'), '---\nkind: domain\ntitle: D\nuid: 22222222-2222-4222-8222-222222222222\n---\n\nbody\n');
    write(join(vault, 'domains', 'notes.md'), '---\nkind: document\ntitle: Notes\nuid: 33333333-3333-4333-8333-333333333333\n---\n\nSee [[domains/d]].\n');
    const agentsBefore = readFileSync(join(vault, 'AGENTS.md'));
    const [renamed] = await callTools(vault, [['rename_concept', { oldSlug: 'domains/d', newSlug: 'domains/marker-renamed', confirm: true }]]);
    assert.equal(renamed.isError, false, renamed.text.slice(0, 300));
    assert.deepEqual(readFileSync(join(vault, 'AGENTS.md')), agentsBefore);
    assert.match(JSON.parse(renamed.text).warnings.join(' '), /AGENTS refers to domains\/d/);
    assert.match(readFileSync(join(vault, 'domains', 'notes.md'), 'utf8'), /\[\[domains\/marker-renamed\]\]/);
  });
});
