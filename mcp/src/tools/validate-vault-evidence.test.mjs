import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

/**
 * `validate-vault.mjs` resolves the vault and its repository at import time, so both
 * exist first.
 */
const root = realpathSync(mkdtempSync(join(tmpdir(), 'ontology-atlas-evidence-text-')));
const vault = join(root, 'vault');
mkdirSync(join(vault, 'capabilities'), { recursive: true });
mkdirSync(join(root, 'src'));
execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main']);
execFileSync('git', ['-C', root, 'config', 'user.name', 'Atlas Test']);
execFileSync('git', ['-C', root, 'config', 'user.email', 'atlas@example.test']);
execFileSync('git', ['-C', root, 'config', 'commit.gpgsign', 'false']);
process.env.OATLAS_VAULT = vault;
const { validateVaultReport } = await import('./validate-vault.mjs');

after(() => rmSync(root, { recursive: true, force: true }));

let clock = Date.parse('2026-11-01T00:00:00Z');
function commit(message) {
  clock += 60_000;
  const date = new Date(clock).toISOString();
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, 'commit', '-qm', message], {
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

function concept(slug, path) {
  writeFileSync(
    join(vault, 'capabilities', `${slug}.md`),
    `---\nkind: capability\nslug: capabilities/${slug}\ntitle: ${slug}\npath: ${path}\n---\n\nPays once.\n`,
  );
}

function verdictOf(slug) {
  const drift = validateVaultReport({ repoRoot: root }).evidenceDrift;
  assert.equal(drift.checked, true, drift.reason);
  if (drift.stale.some((row) => row.slug === `capabilities/${slug}`)) return 'stale';
  if (drift.missing.some((row) => row.slug === `capabilities/${slug}`)) return 'missing';
  return 'not-stale';
}

test('a comment-only commit to a cited file keeps the concept current; a code commit makes it stale', () => {
  writeFileSync(join(root, 'src', 'pay.ts'), 'import { a } from "./a";\n// Pays.\nexport const pay = () => a("https://pay.example/1");\n');
  concept('pay', 'src/pay.ts');
  commit('record pay');

  writeFileSync(
    join(root, 'src', 'pay.ts'),
    'import { a } from "./lib/a";\n/** Pays the order once. */\nexport const pay = () =>\n  a("https://pay.example/1"); // one call\n',
  );
  commit('reword the comment and move the import');
  assert.equal(verdictOf('pay'), 'not-stale');
  const drift = validateVaultReport({ repoRoot: root }).evidenceDrift;
  assert.equal(drift.counts.current, 1);
  assert.equal(drift.counts.stale, 0);

  writeFileSync(
    join(root, 'src', 'pay.ts'),
    'import { a } from "./lib/a";\n/** Pays the order once. */\nexport const pay = () =>\n  a("https://pay.example/2"); // one call\n',
  );
  commit('change the string after //');
  assert.equal(verdictOf('pay'), 'stale');
});

test('a concept stays stale when its cited file cannot be read at the document commit', () => {
  // The document is committed before the file exists, so its commit holds no blob.
  concept('ship', 'src/ship.ts');
  commit('record ship');
  writeFileSync(join(root, 'src', 'ship.ts'), '// Ships.\nexport const ship = 1;\n');
  commit('add ship');
  assert.equal(verdictOf('ship'), 'stale');

  // A binary file is never read as text.
  writeFileSync(join(root, 'src', 'logo.ts'), Buffer.from([0x2f, 0x2f, 0x00, 0x01]));
  concept('logo', 'src/logo.ts');
  commit('record logo');
  writeFileSync(join(root, 'src', 'logo.ts'), Buffer.from([0x2f, 0x2f, 0x00, 0x02]));
  commit('change logo');
  assert.equal(verdictOf('logo'), 'stale');
});
