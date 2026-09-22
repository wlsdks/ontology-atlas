import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// `ontology-atlas growth` renders one more group than it used to: the reads
// each node's own `## Uncertainty` section asks for. The command is a thin
// wrapper over `query_ontology({operation:'growth_plan'})`, so this runs the
// real command against a real vault — a rendering test over a stubbed payload
// would prove the formatter and nothing about the group arriving.

const execFileAsync = promisify(execFile);
const CLI_ENTRY = resolve(dirname(fileURLToPath(import.meta.url)), '../index.mjs');

let tmp;
let vault;

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'ontology-atlas-growth-test-')));
  vault = join(tmp, 'vault');
  mkdirSync(vault, { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeNode(slug, frontmatter, lines) {
  const filePath = join(vault, `${slug}.md`);
  mkdirSync(dirname(filePath), { recursive: true });
  const yaml = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`);
  writeFileSync(filePath, `---\n${yaml.join('\n')}\n---\n\n${lines.join('\n')}\n`, 'utf8');
}

function writeSmallVault() {
  writeNode(
    'domains/vault',
    {
      uid: 'c1111111-1111-4111-8111-111111111111',
      kind: 'domain',
      title: 'Vault',
      capabilities: '[capabilities/folder-access]',
    },
    [
      '# Vault',
      '',
      'Owns how a person chooses one Markdown folder and keeps reading it as the graph.',
      '',
      '## Includes',
      '',
      '- Choosing the folder and remembering it between sessions.',
      '',
      '## Excludes',
      '',
      '- Copying it anywhere else; team sync is a separate layer.',
      '',
      '## Uncertainty',
      '',
      '- `src-tauri/` was never opened, so the native half is described from the bridge.',
    ],
  );
  writeNode(
    'capabilities/folder-access',
    {
      uid: 'c2222222-2222-4222-8222-222222222222',
      kind: 'capability',
      title: 'Folder Access',
      domain: 'domains/vault',
      path: 'mcp/src/index.js',
    },
    [
      '# Folder Access',
      '',
      'Opens one Markdown folder from the terminal and keeps reading it as the graph.',
      '',
      '## Includes',
      '',
      '- Opening the folder and reporting what it found.',
      '',
      '## Excludes',
      '',
      '- Writing to it; that is a separate door.',
      '',
      '## Uncertainty',
      '',
      '- Of `mcp/src/index.js`, lines 1–110 of 2790 were read; the rest was not read, and the'
        + ' remaining operations were taken from the tool description rather than the code itself.',
    ],
  );
}

/** The command colours its output; the assertions are about the words. */
function plain(text) {
  return String(text).replace(/\u001B\[[0-9;]*m/g, '');
}

async function runGrowthCommand(args) {
  return execFileAsync(process.execPath, [CLI_ENTRY, 'growth', vault, ...args], {
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 16 * 1024 * 1024,
  });
}

describe('ontology-atlas growth — next reads', () => {
  it('prints one line per unread file, with the author’s own sentence', async () => {
    writeSmallVault();
    const { stdout: raw } = await runGrowthCommand([]);
    const stdout = plain(raw);

    // A vault with nothing to write still has a page to read: `0 actions` must
    // not swallow the group.
    assert.match(stdout, /growth plan · 0 actions/);
    assert.match(stdout, /nextReads:2/);
    assert.match(stdout, /next reads .*2\/2/);
    assert.match(stdout, /capabilities\/folder-access .*unread-range .*mcp\/src\/index\.js/);
    assert.match(stdout, /domains\/vault .*unopened-area .*src-tauri\//);
    // The sentence is quoted, truncated rather than paraphrased.
    assert.match(stdout, /Of `mcp\/src\/index\.js`, lines 1–110 of 2790 were read/);
    assert.match(stdout, /…/);
  });

  it('passes the shape contract and carries the rows in --json', async () => {
    writeSmallVault();
    const { stdout } = await runGrowthCommand(['--json']);
    const parsed = JSON.parse(stdout);

    assert.equal(parsed.summary.nextReads, 2);
    assert.equal(parsed.nextReads.reason, null);
    assert.deepEqual(parsed.nextReads.rows.map((row) => row.kind), ['unread-range', 'unopened-area']);
    assert.deepEqual(parsed.nextReads.rows[0].ranges, [
      { path: 'mcp/src/index.js', from: 111, to: 2790 },
    ]);
    assert.match(
      parsed.nextReads.rows[0].proposedAction,
      /^Read mcp\/src\/index\.js \(lines 111–2790\), then patch_concept/,
    );
  });
});
