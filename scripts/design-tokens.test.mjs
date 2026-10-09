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
  parseArgs,
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

  it('joins a multi-line value onto one line', () => {
    const font = fixtureTokens().find((token) => token.name === '--font-sans');
    assert.equal(font.value, 'var(--font-pretendard), system-ui, sans-serif');
  });

  it('keeps a semicolon inside a quoted value', () => {
    const local = fixtureTokens().find((token) => token.name === '--local');
    assert.equal(local.value, '"a;b"');
    assert.equal(local.context, '.panel');
  });

  it('records the line and the file of each declaration', () => {
    const chip = fixtureTokens().find((token) => token.name === '--radius-chip');
    assert.equal(chip.line, lineOf('--radius-chip'));
    assert.equal(chip.file, 'app/styles/fixture.css');
  });

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
  it('assigns each name to the longest-listed prefix or to other', () => {
    assert.equal(familyOf('--text-body'), '--text-');
    assert.equal(familyOf('--shadow-elevation-1'), '--shadow-');
    assert.equal(familyOf('--control-h-md'), '--control-h-');
    assert.equal(familyOf('--topology-chrome-gap'), '--topology-');
    assert.equal(familyOf('--chrome-tile-size'), 'other');
  });

  it('groups in the listed order and leaves out empty families', () => {
    assert.deepEqual(
      groupTokens(fixtureTokens()).map(([family]) => family),
      ['--text-', '--leading-', '--radius-', '--shadow-', '--motion-', '--color-', '--control-h-', '--topology-', 'other'],
    );
    const counts = Object.fromEntries(groupTokens(fixtureTokens()).map(([family, members]) => [family, members.length]));
    assert.equal(counts['--text-'], 2);
    assert.equal(counts['--control-h-'], 2);
    assert.equal(counts.other, 3);
  });
});

describe('filterTokens', () => {
  it('matches by prefix with or without the leading dashes', () => {
    assert.equal(filterTokens(fixtureTokens(), '--control-h').length, 2);
    assert.equal(filterTokens(fixtureTokens(), 'control-h').length, 2);
    assert.equal(filterTokens(fixtureTokens(), '--text-body').length, 2);
  });

  it('returns everything for an empty prefix and nothing for an unknown one', () => {
    assert.equal(filterTokens(fixtureTokens(), '').length, fixtureTokens().length);
    assert.deepEqual(filterTokens(fixtureTokens(), '--nope-'), []);
  });
});

describe('formatText', () => {
  it('prints a count heading per family and one line per token with value and file', () => {
    const text = formatText(filterTokens(fixtureTokens(), '--radius'));
    assert.equal(text, `--radius- (1)\n--radius-chip: 6px  app/styles/fixture.css:${lineOf('--radius-chip')}`);
  });

  it('names the condition of an override on its line', () => {
    const lines = formatText(filterTokens(fixtureTokens(), '--control-h')).split('\n');
    assert.equal(lines.length, 3);
    assert.match(lines[2], /\[@media \(pointer: coarse\)\]$/);
  });
});

describe('parseArgs', () => {
  it('reads prefix and json and ignores the separator pnpm forwards', () => {
    assert.deepEqual(parseArgs(['--', '--prefix=text', '--json']), { prefix: 'text', json: true, help: false, unknown: [] });
  });

  it('collects what it does not know', () => {
    assert.deepEqual(parseArgs(['--prefix', 'text']).unknown, ['--prefix', 'text']);
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

  it('finds the stylesheet parts and a plausible number of tokens', () => {
    assert.ok(listStyleFiles(REPO_ROOT).length >= 10);
    assert.ok(tokens.length > 400, `only ${tokens.length} custom properties were read`);
  });

  it('fills every ramp family a rule in docs/DESIGN-SYSTEM.md points at', () => {
    const present = new Set(tokens.map((token) => token.family));
    for (const family of FAMILIES.filter((name) => name !== '--elevation-')) {
      assert.ok(present.has(family), `${family} has no token`);
    }
    assert.ok(tokens.some((token) => token.name === '--motion-fast' && /^\d+ms$/.test(token.value)));
  });
});
