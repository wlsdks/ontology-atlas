import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { runJsonRpcProcess } from '../../scripts/lib/mcp-test-rpc.mjs';
import { compareText } from './compare-text.mjs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(currentDir, 'index.js');
const GRAPH_HASH_MODULE = resolve(currentDir, 'project-source/project-source-graph-hash.mjs');
const LOCALES = ['ko_KR.UTF-8', 'en_US.UTF-8'];
const MIXED_NAMES = ['b', '가', 'a', 'Z', 'z', '_x', '-x'];

function launchEnv(locale) {
  const env = { ...process.env, LANG: locale, LC_ALL: locale };
  delete env.LANGUAGE;
  delete env.LC_COLLATE;
  return env;
}

function withLocale(locale, source) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    env: launchEnv(locale),
    encoding: 'utf8',
  }).trim();
}

function frontmatterFile(slug, kind, title) {
  return `---\nslug: ${slug}\nkind: ${kind}\ntitle: ${title}\nuid: ${uidFor(slug)}\n---\n\nBody.\n`;
}

function uidFor(slug) {
  const code = [...slug].reduce((sum, char) => sum + char.codePointAt(0), 0);
  return `00000000-0000-4000-8000-${String(code).padStart(12, '0')}`;
}

async function listConceptSlugs(vaultRoot, locale) {
  const { responses } = await runJsonRpcProcess({
    command: process.execPath,
    args: [SERVER_ENTRY],
    env: { ...launchEnv(locale), OATLAS_VAULT: vaultRoot },
    requests: [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_concepts', arguments: {} } },
    ],
    timeoutMs: 30_000,
  });
  const response = responses.find((candidate) => candidate.id === 2);
  assert.ok(response?.result, `list_concepts answered under ${locale}`);
  const rows = response.result.structuredContent.concepts ?? response.result.structuredContent.nodes;
  return rows.map((row) => row.slug);
}

describe('text order does not depend on the launching locale', () => {
  it('sorts a mixed list into one fixed order', () => {
    assert.deepEqual([...MIXED_NAMES].sort(compareText), ['_x', '-x', 'a', 'b', 'z', 'Z', '가']);
  });

  it('the launch locales really do disagree when left unpinned', () => {
    const unpinned = "console.log(JSON.stringify(['b','가','a'].sort((a, b) => a.localeCompare(b))))";
    assert.notEqual(withLocale(LOCALES[0], unpinned), withLocale(LOCALES[1], unpinned));
  });

  it('compareText gives the same order under a Korean and an English launch', () => {
    const pinned = `
      import { compareText } from ${JSON.stringify(`file://${join(currentDir, 'compare-text.mjs')}`)};
      console.log(JSON.stringify(${JSON.stringify(MIXED_NAMES)}.sort(compareText)));
    `;
    assert.equal(withLocale(LOCALES[0], pinned), withLocale(LOCALES[1], pinned));
  });

  it('the project source graph hash is the same under both launches', () => {
    const hashing = `
      import { buildProjectSourceGraphHash } from ${JSON.stringify(`file://${GRAPH_HASH_MODULE}`)};
      const docs = ${JSON.stringify(
        MIXED_NAMES.map((slug) => ({
          slug,
          frontmatter: { kind: 'capability', title: slug, relates: [...MIXED_NAMES].reverse() },
        })),
      )};
      console.log(buildProjectSourceGraphHash('project', docs));
    `;
    assert.equal(withLocale(LOCALES[0], hashing), withLocale(LOCALES[1], hashing));
  });

  it('list_concepts returns one order under a Korean and an English launch', async () => {
    const vaultRoot = mkdtempSync(join(tmpdir(), 'ontology-atlas-sort-locale-'));
    try {
      writeFileSync(join(vaultRoot, 'project.md'), frontmatterFile('project', 'project', 'Project'));
      for (const slug of ['alpha', 'zeta', '가람', '나무']) {
        writeFileSync(join(vaultRoot, `${slug}.md`), frontmatterFile(slug, 'domain', slug));
      }
      const [korean, english] = await Promise.all(LOCALES.map((locale) => listConceptSlugs(vaultRoot, locale)));
      assert.deepEqual(english, ['alpha', 'project', 'zeta', '가람', '나무']);
      assert.deepEqual(korean, english);
    } finally {
      rmSync(vaultRoot, { recursive: true, force: true });
    }
  });
});
