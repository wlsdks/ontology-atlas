import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { measureBuildDepth, repositorySurvey } from './build-depth.mjs';
import { familyClaimRefusal } from './family-claims.mjs';

const plugin = (name, check) => `export class ${name}Plugin {\n  apply(hooks) {\n    ${check}\n    hooks.afterRelease(() => 1);\n  }\n}\n`;
const FILES = {
  'package.json': '{"name":"release","private":true,"workspaces":["plugins/*"]}',
  'plugins/slack/package.json': '{"name":"slack"}',
  'plugins/slack/src/index.ts': plugin('Slack', 'if (hooks.skip) return;'),
  'plugins/twitter/package.json': '{"name":"twitter"}',
  'plugins/twitter/src/index.ts': plugin('Twitter', 'hooks.count += 1;'),
  'plugins/teams/package.json': '{"name":"teams"}',
  'plugins/teams/src/index.ts': plugin('Teams', 'if (hooks.skip) return;'),
  'lib/transforms/transform.py': 'class Transform:\n    def __call__(self, subject):\n        if self.p < 1:\n            return subject\n        return self.record(subject)\n',
  'lib/transforms/adapter.py': 'class Adapter(Transform):\n    def __call__(self, subject):\n        return subject\n',
  'lib/requests/one.py': 'def authorize(request):\n    if not request:\n        raise ValueError("no request")\n    return request\n',
  'top.py': 'def flush(x):\n    return x\n',
  'more_top.py': 'def flush(y):\n    return y\n',
};

function withRepository(run) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-family-claims-'));
  for (const [path, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  try {
    return run(repositorySurvey(root, join(root, 'atlas')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const SLACK = 'plugins/slack/src/index.ts:L2-L5';
const TWITTER = 'plugins/twitter/src/index.ts:L2-L5';
const TEAMS = 'plugins/teams/src/index.ts:L2-L5';
const domain = (sentence, uncertainty = '- None.') => ({ slug: 'domains/announcements', frontmatter: { kind: 'domain' }, body: `Announces releases.\n\n${sentence}\n\n## Uncertainty\n${uncertainty}\n` });
const flagged = (repo, sentence, uncertainty) => measureBuildDepth([domain(sentence, uncertainty)], repo, null).families.sentences.map((row) => `${row.name} ${row.covered}/${row.members.length}`);

test('a sentence that speaks for every member the server lists holds only for what its cites cover', () => withRepository((repo) => {
  assert.deepEqual(flagged(repo, `These plugins act after the release and skip a skip-labelled merge (${SLACK}).`), ['apply 1/3']);
  assert.deepEqual(flagged(repo, `Every plugin skips a skip-labelled merge (${SLACK}).`), ['apply 1/3']);
  assert.deepEqual(flagged(repo, `Plugins skip a skip-labelled merge (${SLACK}).`), ['apply 1/3'], 'the family\'s plural is a subject for all of them');
  assert.deepEqual(flagged(repo, `Every plugin acts after the release (${SLACK}, ${TWITTER}).`), ['apply 2/3']);
  assert.deepEqual(flagged(repo, 'Every transform records history (lib/transforms/transform.py:L2-L5).'), ['__call__ 1/2'], 'an override is a member');

  assert.deepEqual(flagged(repo, `Every plugin acts after the release (${SLACK}, ${TWITTER}, ${TEAMS}).`), [], 'cites cover every member');
  assert.deepEqual(flagged(repo, `The Slack plugin skips a skip-labelled merge (${SLACK}).`), [], 'narrowed to the member it cites');
  assert.deepEqual(flagged(repo, `Each plugin skips a skip-labelled merge, 1 of 3 checked (${SLACK}).`), [], 'says how many it checked');
  assert.deepEqual(flagged(repo, `Each plugin skips a skip-labelled merge, 2 of 3 checked (${SLACK}).`), ['apply 1/3'], 'a count its cites do not bear out');
  assert.deepEqual(flagged(repo, `Each plugin skips a skip-labelled merge, 1 of 4 checked (${SLACK}).`), ['apply 1/3'], 'a total the server does not list');
  assert.deepEqual(flagged(repo, 'Every request is authorized first (lib/requests/one.py:L1-L3).'), [], 'a name declared once is no family');
  assert.deepEqual(flagged(repo, 'Every flush returns its input (top.py:L1-L2).'), [], 'a cite at the repository root names no family');
  assert.deepEqual(flagged(repo, 'Announces releases.', `- Every plugin skips a skip-labelled merge (${SLACK}).`), [], '## Uncertainty states no claim');
  assert.deepEqual(flagged(repo, `\`\`\`\nEvery plugin skips (${SLACK}).\n\`\`\``), [], 'a fenced block states no claim');
  assert.deepEqual(flagged(repo, `Every member of \`plugins\` acts (${SLACK}).`), [], 'a word in a cite or in code form is not the sentence\'s noun');
  assert.deepEqual(flagged(repo, `Each of the plugins skips a skip-labelled merge (${SLACK}).`), ['apply 1/3'], 'a quantifier reaches its noun past "of the"');
  assert.deepEqual(flagged(repo, `Every apply skips a skip-labelled merge (${SLACK}).`), ['apply 1/3'], 'the member name after a quantifier');
  assert.deepEqual(flagged(repo, `It skips all three skip labels (${SLACK}).`), [], 'a quantifier over something else');
  assert.deepEqual(flagged(repo, `They skip a skip-labelled merge (${SLACK}).`), ['apply 1/3'], 'a subject pronoun');
  assert.deepEqual(flagged(repo, `Skips a merge they label (${SLACK}).`), [], 'a pronoun that is not the subject');
}));

test('the refusal names the members, what its cites cover, and exactly what is accepted', () => withRepository((repo) => {
  const depth = measureBuildDepth([domain(`These plugins skip a skip-labelled merge (${SLACK}).`)], repo, null);
  const message = familyClaimRefusal(depth.families);
  assert.match(message, /^finalize_project_meaning blocked: 1 cited sentence generalises over members the cites do not cover\./);
  assert.match(message, /domains\/announcements: "These plugins skip a skip-labelled merge \(plugins\/slack\/src\/index\.ts:L2-L5\)\." cites 1 of the 3 `apply` the server lists under plugins\/ \(SlackPlugin\.apply \(plugins\/slack\/src\/index\.ts:L2\), TeamsPlugin\.apply \(plugins\/teams\/src\/index\.ts:L2\), TwitterPlugin\.apply \(plugins\/twitter\/src\/index\.ts:L2\)\)/);
  assert.match(message, /accepted: cite read lines of every one, or narrow it to the member it cites \(name that member; no every, each, all or both before "plugins" or "plugin" or "apply", no "plugins" as a word, and no they, these or those as its subject\), or write "1 of 3" checked/);
  assert.match(depth.line, /Family sentences: 1 sentence speaks for every member of a family while citing fewer/);
  assert.equal(familyClaimRefusal(measureBuildDepth([domain(`The Slack plugin skips (${SLACK}).`)], repo, null).families), null);
  assert.equal(measureBuildDepth([domain(`These plugins skip (${SLACK}).`)], null, null).families, null, 'no repository, no member list');
}));
