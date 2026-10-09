import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FAMILIES,
  collectTokens,
  familyOf,
  filterTokens,
  formatText,
  groupTokens,
  listStyleFiles,
  parseCustomProperties,
  run,
} from './design-tokens.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FIXTURE = `@theme {
  --text-body: 0.78125rem;
  --text-body--line-height: var(--leading-body);
  --leading-body: 1.25rem; /* trailing note --not-a-token: 1px; */
  --radius-chip: 6px;
  --color-canvas: #08090a;
}
:root {
  --shadow-elevation-1: 0 18px 40px var(--color-shadow-a35);
  --motion-fast: 120ms;
  --control-h-md: 32px;
  --topology-chrome-gap: 8px;
  --chrome-tile-size: 36px;
  --font-sans:
    var(--font-pretendard),
    system-ui,
    sans-serif;
}
@media (pointer: coarse) {
  :root {
    --control-h-md: max(32px, var(--touch-target-min));
  }
}
.panel { color: var(--color-canvas); --local: "a;b"; }
@property --gateway-origin { syntax: "<length>"; inherits: true; initial-value: 0px; }
`;

const lineOf = (needle) => FIXTURE.split('\n').findIndex((line) => line.includes(needle)) + 1;

const fixtureTokens = () => parseCustomProperties(FIXTURE, 'app/styles/fixture.css');

describe('parseCustomProperties', () => {
  it('reads declarations in source order and ignores var() references, comments and at-rule preludes', () => {
    assert.deepEqual(
      fixtureTokens().map((token) => token.name),
      [
        '--text-body',
        '--text-body--line-height',
        '--leading-body',
        '--radius-chip',
        '--color-canvas',
        '--shadow-elevation-1',
        '--motion-fast',
        '--control-h-md',
        '--topology-chrome-gap',
        '--chrome-tile-size',
        '--font-sans',
        '--control-h-md',
        '--local',
      ],
    );
  });

  const VALUE_CASES = [
    ['multi-line value joined', '--font-sans', { value: 'var(--font-pretendard), system-ui, sans-serif' }],
    ['quoted semicolon kept', '--local', { value: '"a;b"', context: '.panel' }],
    ['line and file recorded', '--radius-chip', { line: lineOf('--radius-chip'), file: 'app/styles/fixture.css' }],
  ];
  for (const [name, property, expected] of VALUE_CASES) {
    it(`reads a declaration: ${name}`, () => {
      const token = fixtureTokens().find((candidate) => candidate.name === property);
      for (const [key, value] of Object.entries(expected)) assert.equal(token[key], value);
    });
  }

  it('keeps an override apart from its base through the enclosing condition', () => {
    const heights = fixtureTokens().filter((token) => token.name === '--control-h-md');
    assert.deepEqual(
      heights.map((token) => [token.value, token.context]),
      [
        ['32px', ''],
        ['max(32px, var(--touch-target-min))', '@media (pointer: coarse)'],
      ],
    );
  });
});

describe('families', () => {
  const FAMILY_CASES = [
    ['text', '--text-body', '--text-'],
    ['shadow', '--shadow-elevation-1', '--shadow-'],
    ['longest prefix', '--control-h-md', '--control-h-'],
    ['topology', '--topology-chrome-gap', '--topology-'],
    ['unlisted', '--chrome-tile-size', 'other'],
  ];
  for (const [name, property, expected] of FAMILY_CASES) {
    it(`assigns a family: ${name}`, () => assert.equal(familyOf(property), expected));
  }

  it('groups in the listed order and leaves out empty families', () => {
    assert.deepEqual(
      groupTokens(fixtureTokens()).map(([family, members]) => [family, members.length]),
      [
        ['--text-', 2],
        ['--leading-', 1],
        ['--radius-', 1],
        ['--shadow-', 1],
        ['--motion-', 1],
        ['--color-', 1],
        ['--control-h-', 2],
        ['--topology-', 1],
        ['other', 3],
      ],
    );
  });
});

describe('filterTokens', () => {
  const FILTER_CASES = [
    ['with dashes', '--control-h', 2],
    ['without dashes', 'control-h', 2],
    ['full name', '--text-body', 2],
    ['empty prefix', '', 13],
    ['unknown prefix', '--nope-', 0],
  ];
  for (const [name, prefix, expected] of FILTER_CASES) {
    it(`filters by prefix: ${name}`, () => assert.equal(filterTokens(fixtureTokens(), prefix).length, expected));
  }
});

describe('formatText', () => {
  it('names the condition of an override on its line', () => {
    const lines = formatText(filterTokens(fixtureTokens(), '--control-h')).split('\n');
    assert.equal(lines.length, 3);
    assert.match(lines[2], /\[@media \(pointer: coarse\)\]$/);
  });
});

describe('a project on disk', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'design-tokens-'));
  mkdirSync(path.join(root, 'app/styles'), { recursive: true });
  writeFileSync(
    path.join(root, 'app/globals.css'),
    '@import "tailwindcss" source(none);\n@import "./styles/b.css";\n@import "./styles/a.css";\n',
  );
  writeFileSync(path.join(root, 'app/styles/a.css'), ':root { --text-a: 1px; }\n');
  writeFileSync(path.join(root, 'app/styles/b.css'), ':root { --leading-b: 2px; }\n');
  writeFileSync(path.join(root, 'app/styles/c.css'), ':root { --zzz-c: 3px; }\n');
  after(() => rmSync(root, { recursive: true, force: true }));

  const capture = () => {
    const out = { log: [], error: [] };
    return { out, io: { log: (line) => out.log.push(line), error: (line) => out.error.push(line) } };
  };

  it('lists imported parts in import order, then parts the entry does not import', () => {
    assert.deepEqual(listStyleFiles(root), ['app/styles/b.css', 'app/styles/a.css', 'app/styles/c.css']);
    assert.deepEqual(collectTokens(root).map((token) => token.name), ['--leading-b', '--text-a', '--zzz-c']);
  });

  it('prints json for machines', () => {
    const { out, io } = capture();
    assert.equal(run(['--json', '--prefix=--text'], io, root), 0);
    const parsed = JSON.parse(out.log[0]);
    assert.deepEqual(parsed.map(({ name, value, file, family }) => ({ name, value, file, family })), [
      { name: '--text-a', value: '1px', file: 'app/styles/a.css', family: '--text-' },
    ]);
  });

  it('fails loudly on a prefix that matches nothing and on an unknown argument', () => {
    const none = capture();
    assert.equal(run(['--prefix=--absent'], none.io, root), 1);
    assert.match(none.out.error[0], /no custom property starts with --absent/);
    const bad = capture();
    assert.equal(run(['--bogus'], bad.io, root), 2);
  });
});

describe('this repository', () => {
  const tokens = collectTokens(REPO_ROOT);

  it('reads every stylesheet part and fills every ramp family a rule in docs/DESIGN-SYSTEM.md points at', () => {
    assert.ok(listStyleFiles(REPO_ROOT).length >= 10);
    assert.ok(tokens.length > 400, `only ${tokens.length} custom properties were read`);
    const present = new Set(tokens.map((token) => token.family));
    for (const family of FAMILIES.filter((name) => name !== '--elevation-')) {
      assert.ok(present.has(family), `${family} has no token`);
    }
    assert.ok(tokens.some((token) => token.name === '--motion-fast' && /^\d+ms$/.test(token.value)));
  });
});
