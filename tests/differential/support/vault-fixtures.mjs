// The vaults the corpus runs on: two copied from the repository (`samples/storefront` and
// `docs/ontology`) and the rest planted by code, so hostile and oversized shapes never sit in Git.
// Every fixture is a folder `case/` holding a vault (`vaultRel`) and, for the hostile ones, files
// beside it that a path escape would reach.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

/**
 * Every secret a fixture plants (credential files, a repository's `.env`, a file the vault only
 * reaches through a symlink out of it) carries a string of this shape. No server answer may show
 * one unless the request that asked for it holds the same string.
 */
export const SECRET_SENTINEL = /SECRET-SENTINEL-[a-z-]+/g;

/** Planted times sit in 2023, far from the clock the files get when a server writes them. */
export const PLANTED_BASE_MS = 1_700_000_000_000;
/** Whole millisecond, a fraction, and exactly half a millisecond, in turn. */
const PLANTED_FRACTIONS = [0, 0.3125, 0.5];

export const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Fixture Author',
  GIT_AUTHOR_EMAIL: 'author@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture Author',
  GIT_COMMITTER_EMAIL: 'author@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
};

/**
 * The arguments every harness-run `git` starts with: nothing the repository's own settings name is
 * run (a hostile fixture would otherwise run it here).
 */
export const HARDENED_GIT_ARGS = [
  '--no-optional-locks',
  '-c', 'core.fsmonitor=false',
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'filter.x.clean=cat',
  '-c', 'filter.x.smudge=cat',
  '-c', 'diff.external=',
  '-c', 'core.sshCommand=',
];

function uid(label) {
  const bytes = createHash('sha256').update(`fixture-uid:${label}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function node({ slug, kind, title, extra = {}, body, lineEnding = '\n', raw }) {
  const fields = { uid: uid(slug), slug, kind, title, ...extra };
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) lines.push(`${key}: ${value}`);
  lines.push('---', '', body ?? `# ${title}\n\nA fixture node about ${title}.`);
  const text = `${lines.join('\n')}\n`.replaceAll('\n', lineEnding);
  return raw ? raw(text) : text;
}

function write(dir, relative, content) {
  const target = path.join(dir, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function git(dir, args, env = {}) {
  execFileSync('git', args, {
    cwd: dir,
    env: { ...process.env, ...GIT_ENV, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function commit(dir, message, isoDate) {
  git(dir, ['add', '--all']);
  git(dir, ['commit', '--no-gpg-sign', '--no-verify', '-m', message], {
    GIT_AUTHOR_DATE: isoDate,
    GIT_COMMITTER_DATE: isoDate,
  });
}

function projectNode(slug, title, domains) {
  return node({
    slug,
    kind: 'project',
    title,
    extra: {
      description: `"${title} is a planted vault for the differential harness."`,
      domains: `[${domains.join(', ')}]`,
    },
  });
}

function domainNode(slug, title, capabilities = []) {
  return node({
    slug,
    kind: 'domain',
    title,
    extra: {
      description: `"${title} is the responsibility these fixtures use."`,
      capabilities: `[${capabilities.join(', ')}]`,
    },
  });
}

function capabilityNode(slug, title, domain, extra = {}) {
  return node({
    slug,
    kind: 'capability',
    title,
    extra: {
      description: `"${title}: what a person can do here."`,
      domain,
      dependencies: '[]',
      elements: '[]',
      ...extra,
    },
  });
}

/** A vault of capabilities `a` and `b` in one domain, where `plant` writes the `b` that breaks identity. */
function identityVault(plant) {
  return {
    vaultRel: 'vault',
    build(dir) {
      const v = (name) => `vault/${name}`;
      write(dir, v('loops.md'), projectNode('loops', 'Loops', ['domains/loops']));
      write(dir, v('domains/loops.md'), domainNode('domains/loops', 'Loops', ['capabilities/a', 'capabilities/b']));
      write(dir, v('capabilities/a.md'), capabilityNode('capabilities/a', 'Capability A', 'domains/loops'));
      plant(dir, v);
    },
  };
}

const FIXTURE_BUILDERS = {
  empty: { vaultRel: 'vault', build: (dir) => mkdirSync(path.join(dir, 'vault'), { recursive: true }) },

  'one-node': {
    vaultRel: 'vault',
    build(dir) {
      write(dir, 'vault/only.md', projectNode('only', 'Only Node', []));
    },
  },

  // A graph built to make walks disagree: two rings sharing a node, a diamond of equal-length
  // paths, a chain, a second component and a node nothing touches.
  tangle: {
    vaultRel: 'vault',
    build(dir) {
      const v = (name) => `vault/${name}`;
      const slugs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].map((name) => `capabilities/${name}`);
      const edges = {
        a: ['b'], b: ['c', 'd'], c: ['a', 'e'], d: ['a', 'e'], e: ['f', 'b'], f: ['g'],
        g: [], h: ['i'], i: ['j'], j: ['h'], k: [], l: ['k', 'a'],
      };
      write(dir, v('tangle.md'), projectNode('tangle', 'Tangle', ['domains/loops', 'domains/rest']));
      write(dir, v('domains/loops.md'), domainNode('domains/loops', 'Loops', slugs.slice(0, 10)));
      write(dir, v('domains/rest.md'), domainNode('domains/rest', 'Rest', slugs.slice(10)));
      for (const [name, targets] of Object.entries(edges)) {
        const domain = 'kl'.includes(name) ? 'domains/rest' : 'domains/loops';
        write(
          dir,
          v(`capabilities/${name}.md`),
          capabilityNode(`capabilities/${name}`, `Capability ${name.toUpperCase()}`, domain, {
            dependencies: `[${targets.map((target) => `capabilities/${target}`).join(', ')}]`,
          }),
        );
      }
    },
  },

  // Four vaults whose identity cannot be told apart: each stops every graph command.
  'identity-uid-missing': identityVault((dir, v) => {
    write(dir, v('capabilities/b.md'), capabilityNode('capabilities/b', 'Capability B', 'domains/loops', {}).replace(/^uid: .*\n/m, ''));
  }),
  'identity-uid-invalid': identityVault((dir, v) => {
    write(dir, v('capabilities/b.md'), capabilityNode('capabilities/b', 'Capability B', 'domains/loops', { uid: 'NOT-A-UID' }));
  }),
  'identity-uid-duplicate': identityVault((dir, v) => {
    write(dir, v('capabilities/b.md'), capabilityNode('capabilities/b', 'Capability B', 'domains/loops', { uid: uid('capabilities/a') }));
  }),
  'identity-merged-collision': identityVault((dir, v) => {
    write(dir, v('capabilities/b.md'), capabilityNode('capabilities/b', 'Capability B', 'domains/loops', { merged_uids: `[${uid('capabilities/a')}]` }));
  }),

  // `capabilities/a` leans on two nodes that collate as one name (U+00AD is ignored by the
  // collation), so which community it joins is decided by something other than their names.
  'communities-ties': {
    vaultRel: 'vault',
    build(dir) {
      const v = (name) => `vault/${name}`;
      const slugs = ['capabilities/a', 'capabilities/ab', 'capabilities/a\u00adb', 'capabilities/c'];
      write(dir, v('ties.md'), projectNode('ties', 'Ties', ['domains/ties']));
      write(dir, v('domains/ties.md'), domainNode('domains/ties', 'Ties', slugs));
      write(dir, v('capabilities/a.md'), capabilityNode('capabilities/a', 'Capability A', 'domains/ties', {
        dependencies: '[capabilities/ab, capabilities/a\u00adb]',
      }));
      write(dir, v('capabilities/ab.md'), capabilityNode('capabilities/ab', 'Capability AB', 'domains/ties', {
        dependencies: '[capabilities/c]',
      }));
      write(dir, v('capabilities/a\u00adb.md'), capabilityNode('capabilities/a\u00adb', 'Capability A soft hyphen B', 'domains/ties'));
      write(dir, v('capabilities/c.md'), capabilityNode('capabilities/c', 'Capability C', 'domains/ties'));
    },
  },

  // A node whose name is a whole number: an object in JavaScript lists such a key before every
  // other, whatever order the keys were added in.
  'numeric-names': {
    vaultRel: 'vault',
    build(dir) {
      const v = (name) => `vault/${name}`;
      write(dir, v('2024.md'), projectNode('2024', 'Year 2024', ['domains/year']));
      write(dir, v('domains/year.md'), domainNode('domains/year', 'Year', ['capabilities/plan']));
      write(dir, v('capabilities/plan.md'), capabilityNode('capabilities/plan', 'Plan', 'domains/year', {
        dependencies: '[capabilities/review]',
      }));
      write(dir, v('capabilities/review.md'), capabilityNode('capabilities/review', 'Review', 'domains/year'));
      write(dir, v('7.md'), node({ slug: '7', kind: 'document', title: 'Seven' }));
    },
  },

  // Cycles, a name two nodes answer to, and references to nothing: the faults that are issues, not
  // refusals, so the graph still compiles.
  'ambiguous-dangling': {
    vaultRel: 'vault',
    build(dir) {
      const v = (name) => `vault/${name}`;
      write(dir, v('capabilities/a.md'), node({
        slug: 'capabilities/a', kind: 'capability', title: 'A',
        extra: { dependencies: '[b, missing-thing]', elements: '[src/code.rs]' },
      }));
      write(dir, v('capabilities/b.md'), node({
        slug: 'capabilities/b', kind: 'capability', title: 'B',
        extra: { dependencies: '[capabilities/a, capabilities/b]' },
      }));
      write(dir, v('domains/shared.md'), node({ slug: 'domains/shared', kind: 'domain', title: 'Shared' }));
      write(dir, v('capabilities/shared.md'), node({ slug: 'capabilities/shared', kind: 'capability', title: 'Shared' }));
      write(dir, v('capabilities/c.md'), node({
        slug: 'capabilities/c', kind: 'capability', title: 'C', extra: { relates: '[shared]' },
      }));
      write(dir, v('notes.md'), 'No frontmatter, so no node.\n');
    },
  },

  // What holds what, made awkward: two projects, nodes two containers hold, containers that hold
  // each other and themselves, a node and a subtree nothing holds, a dependency with a stated
  // reason, and two names whose order depends on the collation.
  'containment-tangle': {
    vaultRel: 'vault',
    build(dir) {
      const v = (name) => `vault/${name}`;
      write(dir, v('walks.md'), projectNode('walks', 'Walks', ['domains/core', 'domains/edge']));
      write(dir, v('second.md'), projectNode('second', 'Second', ['domains/solo']));
      write(dir, v('domains/core.md'), domainNode('domains/core', 'Core', [
        'capabilities/load', 'capabilities/save', 'capabilities/loop-a', 'capabilities/loop-b', 'capabilities/self',
        'capabilities/Zeta', 'capabilities/alpha-gamma',
      ]));
      write(dir, v('domains/edge.md'), domainNode('domains/edge', 'Edge', ['capabilities/ship']));
      write(dir, v('domains/solo.md'), domainNode('domains/solo', 'Solo', ['capabilities/solo-one']));
      write(dir, v('capabilities/load.md'), capabilityNode('capabilities/load', 'Load', 'domains/core', {
        dependencies: '[capabilities/save, capabilities/Zeta, capabilities/alpha-gamma]',
        elements: '[elements/shared]',
        relation_notes: '{ capabilities/save: "Loading needs a saved copy to read." }',
        canvasPosition: '{ x: 120, y: -40.5 }',
      }));
      write(dir, v('capabilities/save.md'), capabilityNode('capabilities/save', 'Save', 'domains/core', {
        elements: '[elements/shared]',
        canvasPosition: '{ x: 10 }',
      }));
      write(dir, v('capabilities/loop-a.md'), capabilityNode('capabilities/loop-a', 'Loop A', 'domains/core', {
        contains: '[capabilities/loop-b]',
      }));
      write(dir, v('capabilities/loop-b.md'), capabilityNode('capabilities/loop-b', 'Loop B', 'domains/core', {
        contains: '[capabilities/loop-a]',
      }));
      write(dir, v('capabilities/self.md'), capabilityNode('capabilities/self', 'Self', 'domains/core', {
        contains: '[capabilities/self]',
      }));
      write(dir, v('capabilities/Zeta.md'), capabilityNode('capabilities/Zeta', 'Zeta', 'domains/core'));
      write(dir, v('capabilities/alpha-gamma.md'), capabilityNode('capabilities/alpha-gamma', 'Alpha Gamma', 'domains/core', {
        dependencies: '[capabilities/save]',
      }));
      write(dir, v('capabilities/ship.md'), capabilityNode('capabilities/ship', 'Ship', 'domains/edge', {
        dependencies: '[capabilities/load, capabilities/save, src/outside.rs]',
        relates: '[capabilities/solo-one]',
      }));
      write(dir, v('capabilities/solo-one.md'), capabilityNode('capabilities/solo-one', 'Solo One', 'domains/solo'));
      write(dir, v('elements/shared.md'), node({ slug: 'elements/shared', kind: 'element', title: 'Shared' }));
      write(dir, v('capabilities/orphan.md'), node({ slug: 'capabilities/orphan', kind: 'capability', title: 'Orphan' }));
      write(dir, v('capabilities/orphan-parent.md'), node({
        slug: 'capabilities/orphan-parent', kind: 'capability', title: 'Orphan Parent',
        extra: { contains: '[capabilities/orphan-child]' },
      }));
      write(dir, v('capabilities/orphan-child.md'), node({ slug: 'capabilities/orphan-child', kind: 'capability', title: 'Orphan Child' }));
      write(dir, v('documents/guide.md'), node({
        slug: 'documents/guide', kind: 'document', title: 'Guide', extra: { describes: '[capabilities/load]' },
      }));
    },
  },

  'edge-names': {
    vaultRel: 'vault',
    build(dir) {
      const v = (name) => `vault/${name}`;
      const domains = ['domains/결제', 'domains/payments', 'domains/Zebra', 'domains/apple', 'domains/😀-smile', 'domains/원장'];
      write(dir, v('atlas-edge.md'), projectNode('atlas-edge', 'Atlas Edge 에지', domains));
      write(dir, v('domains/결제.md'), domainNode('domains/결제', '결제 Payment', ['capabilities/주문-취소']));
      write(dir, v('domains/payments.md'), domainNode('domains/payments', 'Payments', ['capabilities/cancel-order']));
      write(dir, v('domains/Zebra.md'), domainNode('domains/Zebra', 'Zebra'));
      write(dir, v('domains/apple.md'), domainNode('domains/apple', 'apple'));
      write(dir, v('domains/😀-smile.md'), domainNode('domains/😀-smile', '😀 Smile'));
      const nfdName = '원장'.normalize('NFD');
      write(dir, v(`domains/${nfdName}.md`), domainNode(`domains/${nfdName}`, '원장 Ledger'));
      write(dir, v('capabilities/주문-취소.md'), capabilityNode('capabilities/주문-취소', '주문 취소', 'domains/결제', {
        dependencies: '[capabilities/cancel-order]',
      }));
      write(dir, v('capabilities/cancel-order.md'), capabilityNode('capabilities/cancel-order', 'Cancel Order', 'domains/payments'));
      write(dir, v('capabilities/Éclair.md'), capabilityNode('capabilities/Éclair', 'Éclair', 'domains/Zebra'));
      write(dir, v('capabilities/Éclair-nfd.md'), capabilityNode('capabilities/Éclair-nfd', 'Éclair'.normalize('NFD'), 'domains/apple'));
      write(dir, v('capabilities/ä-umlaut.md'), capabilityNode('capabilities/ä-umlaut', 'ä umlaut', 'domains/apple'));
      write(dir, v('capabilities/z-last.md'), capabilityNode('capabilities/z-last', 'Z last', 'domains/Zebra'));
      write(dir, v('capabilities/Apple-upper.md'), capabilityNode('capabilities/Apple-upper', 'Apple Upper', 'domains/apple'));
      write(dir, v('capabilities/가나다.md'), capabilityNode('capabilities/가나다', '가나다 ganada', 'domains/결제', {
        display_ko: '"가나다"',
      }));
      write(dir, v('capabilities/ｆｕｌｌ-width.md'), capabilityNode('capabilities/ｆｕｌｌ-width', 'Ｆｕｌｌ　Ｗｉｄｔｈ', 'domains/Zebra'));
      write(dir, v('capabilities/ten.md'), capabilityNode('capabilities/ten', 'Ten', 'domains/Zebra'));
      write(dir, v('capabilities/Two.md'), capabilityNode('capabilities/Two', 'Two', 'domains/Zebra'));
      write(dir, v('capabilities/one.md'), capabilityNode('capabilities/one', 'One', 'domains/Zebra'));
      // Two ways from `start` to `target` that are equally short, whose names share a prefix.
      write(dir, v('capabilities/start.md'), capabilityNode('capabilities/start', 'Start', 'domains/Zebra', {
        dependencies: '[capabilities/build, capabilities/build-index]',
      }));
      write(dir, v('capabilities/build.md'), capabilityNode('capabilities/build', 'Build', 'domains/Zebra', {
        dependencies: '[capabilities/target]',
      }));
      write(dir, v('capabilities/build-index.md'), capabilityNode('capabilities/build-index', 'Build index', 'domains/Zebra', {
        dependencies: '[capabilities/target]',
      }));
      write(dir, v('capabilities/target.md'), capabilityNode('capabilities/target', 'Target', 'domains/Zebra'));
    },
  },

  'edge-bytes': {
    vaultRel: 'vault',
    build(dir) {
      const v = (name) => `vault/${name}`;
      write(dir, v('edge-bytes.md'), projectNode('edge-bytes', 'Edge Bytes', ['domains/bytes']));
      write(dir, v('domains/bytes.md'), domainNode('domains/bytes', 'Bytes', [
        'capabilities/crlf', 'capabilities/bom', 'capabilities/numbers', 'capabilities/prototype-keys', 'capabilities/no-final-newline', 'capabilities/unicode-separators',
      ]));
      write(dir, v('capabilities/crlf.md'), capabilityNode('capabilities/crlf', 'Carriage Return', 'domains/bytes') .replaceAll('\n', '\r\n'));
      write(dir, v('capabilities/bom.md'), `﻿${capabilityNode('capabilities/bom', 'Byte Order Mark', 'domains/bytes')}`);
      write(
        dir,
        v('capabilities/numbers.md'),
        capabilityNode('capabilities/numbers', 'Numbers', 'domains/bytes', {
          score: '0.125',
          rounding_tie: '2.5',
          negative_tie: '-2.5',
          third: '1.005',
          big: '1e21',
          tiny: '5e-7',
          negative_zero: '-0',
          long_fraction: '0.1234567890123456789',
          whole_double: '3.0',
          quoted_number: '"10"',
        }),
      );
      write(
        dir,
        v('capabilities/prototype-keys.md'),
        [
          '---',
          `uid: ${uid('prototype-keys')}`,
          'slug: capabilities/prototype-keys',
          'kind: capability',
          'title: Prototype Keys',
          'description: "Keys JavaScript treats specially."',
          'domain: domains/bytes',
          'dependencies: []',
          'elements: []',
          '__proto__: polluted',
          'constructor: c',
          'toString: t',
          '10: ten',
          '2: two',
          'b: letter',
          '-1: negative',
          '01: leading-zero',
          '4294967295: beyond-index',
          '---',
          '',
          '# Prototype Keys',
          '',
        ].join('\n'),
      );
      write(dir, v('capabilities/no-final-newline.md'), capabilityNode('capabilities/no-final-newline', 'No Final Newline', 'domains/bytes').trimEnd());
      write(
        dir,
        v('capabilities/unicode-separators.md'),
        node({
          slug: 'capabilities/unicode-separators',
          kind: 'capability',
          title: 'Unicode Separators',
          extra: { description: '"line separator and non breaking and ideographic　space"', domain: 'domains/bytes', dependencies: '[]', elements: '[]' },
          body: 'A B C D　E ​F\n\n```ts\nconst x = 1;\n```\n\n- a\n  - b\n\n| h |\n|---|\n| c |\n',
        }),
      );
      write(dir, v('invalid-utf8.md'), Buffer.concat([Buffer.from(`---\nuid: ${uid('invalid')}\nslug: invalid-utf8\nkind: element\ntitle: `), Buffer.from([0xff, 0xfe, 0x80]), Buffer.from('\n---\n\nbody\n')]));
      write(dir, v('capabilities/nul-byte.md'), `${capabilityNode('capabilities/nul-byte', 'Nul Byte', 'domains/bytes')}\0after\n`);
      write(dir, v('empty-file.md'), '');
      write(dir, v('frontmatter-only.md'), `---\nuid: ${uid('fm-only')}\nslug: frontmatter-only\nkind: element\ntitle: Frontmatter Only\n---`);
      write(dir, v('duplicate-keys.md'), `---\nuid: ${uid('dup')}\nslug: duplicate-keys\nkind: element\ntitle: First\ntitle: Second\n---\n\nbody\n`);
      write(dir, v('notes/plain.md'), '# Plain note with no frontmatter\n\nJust text.\n');
    },
  },

  'edge-hostile': {
    vaultRel: 'vault',
    build(dir) {
      const v = (name) => `vault/${name}`;
      write(dir, v('hostile.md'), projectNode('hostile', 'Hostile', ['domains/inside']));
      write(dir, v('domains/inside.md'), domainNode('domains/inside', 'Inside', ['capabilities/normal']));
      write(dir, v('capabilities/normal.md'), capabilityNode('capabilities/normal', 'Normal', 'domains/inside'));
      write(dir, 'outside/secret.md', node({ slug: 'outside-secret', kind: 'element', title: 'Outside Secret', body: 'SECRET-SENTINEL-outside' }));
      write(dir, 'outside/data.txt', 'SECRET-SENTINEL-outside-text\n');
      symlinkSync('../outside/secret.md', path.join(dir, v('escape-file.md')));
      symlinkSync('../outside', path.join(dir, v('escape-dir')));
      symlinkSync('capabilities/normal.md', path.join(dir, v('inside-link.md')));
      symlinkSync('/etc/hosts', path.join(dir, v('absolute-link.md')));
      symlinkSync('loop-b.md', path.join(dir, v('loop-a.md')));
      symlinkSync('loop-a.md', path.join(dir, v('loop-b.md')));
      write(dir, v('.env'), 'API_KEY=SECRET-SENTINEL-env\n');
      write(dir, v('.env.local'), 'API_KEY=SECRET-SENTINEL-env-local\n');
      write(dir, v('credentials.json'), '{"key":"SECRET-SENTINEL-credentials"}\n');
      write(dir, v('id_rsa'), '-----BEGIN PRIVATE KEY-----\nSECRET-SENTINEL-private-key\n');
      write(dir, v('service-account.json'), '{"private_key":"SECRET-SENTINEL-service-account"}\n');
      write(dir, v('.npmrc'), '//registry.npmjs.org/:_authToken=SECRET-SENTINEL-npmrc\n');
      write(dir, v('secrets.md'), node({ slug: 'secrets', kind: 'element', title: 'Secrets', body: 'a node whose file name looks like a credential' }));
      write(dir, v('.hidden/inside-hidden.md'), node({ slug: 'inside-hidden', kind: 'element', title: 'Inside Hidden' }));
      write(dir, v('.git/config'), '[core]\n\tfsmonitor = touch /tmp/oatlas-differential-must-not-run\n');
      write(dir, v('.ontology-atlasignore'), 'ignored/\n*.skip.md\n');
      write(dir, v('ignored/inside.md'), node({ slug: 'ignored-inside', kind: 'element', title: 'Ignored Inside' }));
      write(dir, v('note.skip.md'), node({ slug: 'skipped', kind: 'element', title: 'Skipped' }));
      write(dir, v('oversized.md'), `${node({ slug: 'oversized', kind: 'element', title: 'Oversized', body: 'x'.repeat(1_600_000) })}`);
      let deep = 'deep';
      for (let level = 0; level < 40; level += 1) deep += `/level-${level}`;
      write(dir, v(`${deep}/bottom.md`), node({ slug: 'bottom', kind: 'element', title: 'Bottom' }));
      write(dir, v('trailing-dot.md.'), 'not a node\n');
      write(dir, v('Capital.MD'), node({ slug: 'capital', kind: 'element', title: 'Capital Extension' }));
    },
  },

  library: {
    vaultRel: 'vault',
    build(dir) {
      const v = (name) => `vault/${name}`;
      write(dir, v('library.md'), projectNode('library', 'Library', ['domains/reading']));
      write(dir, v('domains/reading.md'), domainNode('domains/reading', 'Reading', ['capabilities/annotate', 'capabilities/search']));
      write(dir, v('capabilities/annotate.md'), capabilityNode('capabilities/annotate', 'Annotate', 'domains/reading'));
      write(dir, v('capabilities/search.md'), capabilityNode('capabilities/search', 'Search', 'domains/reading'));
      write(dir, v('sources/notes.md'), '# Source notes\n\nRaw material a wiki page was written from.\n');
      write(dir, v('sources/data.csv'), 'a,b\n1,2\n');
      const sourceHash = createHash('sha256').update('# Source notes\n\nRaw material a wiki page was written from.\n').digest('hex');
      write(
        dir,
        v('wiki/plan.md'),
        [
          '---',
          'title: Reading plan',
          'created_by: agent:claude',
          'compiled_at: 2026-02-01T00:00:00.000Z',
          'sources: [sources/notes.md]',
          `source_hash: { sources/notes.md: ${sourceHash} }`,
          'status: draft',
          'summary: How reading is planned.',
          'describes: [capabilities/annotate]',
          '---',
          '',
          '# Reading plan',
          '',
          'Plan text that points at [[capabilities/annotate]].',
          '',
        ].join('\n'),
      );
      write(dir, v('wiki/broken.md'), '---\ntitle: Broken\nstatus: maybe\n---\n\nNo required fields.\n');
      write(dir, v('wiki/plain.md'), '# No frontmatter at all\n');
      write(
        dir,
        v('.ontology-atlas/library-collections.json'),
        `${JSON.stringify(
          {
            schema: 'ontology-atlas/library-collections/v1',
            folders: [
              {
                id: uid('constellation-one'),
                name: 'Reading week',
                parentId: null,
                order: 0,
                presentation: 'constellation',
                purpose: 'Everything to read this week',
                createdAt: '2026-02-01T00:00:00.000Z',
                updatedAt: '2026-02-02T00:00:00.000Z',
              },
              { id: uid('plain-folder'), name: 'Plain folder', parentId: null, order: 1 },
            ],
            items: [
              {
                id: uid('item-one'),
                folderId: uid('constellation-one'),
                label: 'Annotate',
                order: 0,
                target: { kind: 'ontology', uid: uid('capabilities/annotate'), lastKnownPath: 'capabilities/annotate.md' },
              },
              {
                id: uid('item-two'),
                folderId: uid('constellation-one'),
                label: 'Reading plan',
                order: 1,
                target: { kind: 'wiki', path: 'wiki/plan.md' },
              },
              {
                id: uid('item-three'),
                folderId: uid('constellation-one'),
                label: 'Notes',
                order: 2,
                target: { kind: 'source', path: 'sources/notes.md' },
              },
            ],
          },
          null,
          2,
        )}\n`,
      );
      write(dir, 'outside/absorb-me.md', '# A document to absorb\n\nSome prose about annotating.\n');
    },
  },

  'hostile-git': {
    vaultRel: 'repo/ontology',
    build(dir) {
      write(dir, 'repo/src/app.ts', 'export const app = 1;\n');
      write(dir, 'repo/ontology/hostile-git.md', projectNode('hostile-git', 'Hostile Git', ['domains/inside']));
      write(dir, 'repo/ontology/domains/inside.md', domainNode('domains/inside', 'Inside'));
      git(path.join(dir, 'repo'), ['init', '--quiet', '--initial-branch=main']);
      commit(path.join(dir, 'repo'), 'chore: first commit', '2026-01-10T09:00:00+00:00');
      write(dir, 'repo/ontology/domains/inside.md', domainNode('domains/inside', 'Inside Changed'));
      // Settings a repository can carry that would run a command if a server honoured them.
      writeFileSync(
        path.join(dir, 'repo/.git/config'),
        [
          '[core]',
          '\trepositoryformatversion = 0',
          '\tfilemode = true',
          '\tbare = false',
          '\tfsmonitor = touch ../fsmonitor-ran.txt',
          '\tsshCommand = touch ../ssh-ran.txt',
          '[diff]',
          '\texternal = touch ../diff-ran.txt',
          '[filter "x"]',
          '\tclean = touch ../filter-ran.txt',
          '\tsmudge = touch ../filter-ran.txt',
          '',
        ].join('\n'),
      );
      write(dir, 'repo/.gitattributes', '*.md filter=x\n');
      write(dir, 'repo/.git/hooks/post-index-change', '#!/bin/sh\ntouch ../hook-ran.txt\n');
      chmodSync(path.join(dir, 'repo/.git/hooks/post-index-change'), 0o755);
    },
  },

  // A vault two folders below the top of its repository: a path the server must write with `/`
  // whatever the platform, with one commit that touches the vault and one that does not.
  'nested-docs-repo': {
    vaultRel: 'repo/docs/ontology',
    build(dir) {
      write(dir, 'repo/src/app.ts', 'export const app = 1;\n');
      write(dir, 'repo/docs/ontology/nested.md', projectNode('nested', 'Nested', ['domains/inside']));
      write(dir, 'repo/docs/ontology/domains/inside.md', domainNode('domains/inside', 'Inside'));
      git(path.join(dir, 'repo'), ['init', '--quiet', '--initial-branch=main']);
      commit(path.join(dir, 'repo'), 'chore: first commit', '2026-01-10T09:00:00+00:00');
      write(dir, 'repo/src/app.ts', 'export const app = 2;\n');
      commit(path.join(dir, 'repo'), 'feat: change code beside the vault', '2026-02-10T09:00:00+00:00');
      write(dir, 'repo/docs/ontology/domains/inside.md', domainNode('domains/inside', 'Inside Changed'));
      git(path.join(dir, 'repo'), ['add', 'docs/ontology/domains/inside.md']);
      write(dir, 'repo/src/app.ts', 'export const app = 3;\n');
      git(path.join(dir, 'repo'), ['add', 'src/app.ts']);
      write(dir, 'repo/docs/ontology/untracked.md', '# Untracked\n');
    },
  },

  'miniature-repo': {
    vaultRel: 'repo/ontology',
    build(dir) {
      const r = (name) => `repo/${name}`;
      write(dir, r('package.json'), '{\n  "name": "miniature-shop",\n  "version": "1.0.0",\n  "scripts": { "test": "node --test" },\n  "dependencies": { "left-pad": "1.3.0" }\n}\n');
      write(dir, r('README.md'), '# Miniature Shop\n\nA small shop used by the differential harness.\n\n## Orders\n\nPlacing and cancelling an order.\n\n## Payment\n\nCharging a card.\n');
      write(dir, r('src/order/placement.ts'), "import { charge } from '../payment/charge';\nimport { StockLevel } from '../inventory/stock';\n\nexport function placeOrder(cart: string[]): string {\n  const stock = new StockLevel();\n  stock.reserve(cart);\n  return charge(cart.length);\n}\n");
      write(dir, r('src/order/cancel.ts'), "import { refund } from '../payment/charge';\n\nexport function cancelOrder(id: string): boolean {\n  return refund(id);\n}\n");
      write(dir, r('src/payment/charge.ts'), "export function charge(amount: number): string {\n  return `charged-${amount}`;\n}\n\nexport function refund(id: string): boolean {\n  return id.length > 0;\n}\n");
      write(dir, r('src/inventory/stock.ts'), "export class StockLevel {\n  reserve(items: string[]): void {\n    void items;\n  }\n}\n");
      write(dir, r('src/billing/invoice.py'), "import os\nfrom payment import charge\n\n\ndef issue_invoice(order_id):\n    return charge(order_id)\n");
      write(dir, r('src/core/lib.rs'), "pub mod ledger;\n\npub fn total(values: &[u32]) -> u32 {\n    values.iter().sum()\n}\n");
      write(dir, r('src/core/ledger.rs'), "use crate::total;\n\npub fn balance() -> u32 {\n    total(&[1, 2, 3])\n}\n");
      write(dir, r('src/shipping/Carrier.java'), "package shipping;\n\npublic class Carrier {\n  public String label() { return \"carrier\"; }\n}\n");
      write(dir, r('.env'), 'TOKEN=SECRET-SENTINEL-repo-env\n');
      write(dir, r('ontology/miniature-shop.md'), projectNode('miniature-shop', 'Miniature Shop', ['domains/order', 'domains/payment']));
      write(dir, r('ontology/domains/order.md'), domainNode('domains/order', 'Order', ['capabilities/place-order', 'capabilities/cancel-order']));
      write(dir, r('ontology/domains/payment.md'), domainNode('domains/payment', 'Payment', ['capabilities/charge-card']));
      write(dir, r('ontology/capabilities/place-order.md'), capabilityNode('capabilities/place-order', 'Place Order', 'domains/order', {
        path: 'src/order/placement.ts',
        symbol: 'placeOrder',
        dependencies: '[capabilities/charge-card]',
        cite: '"src/order/placement.ts:L4-L8"',
      }));
      write(dir, r('ontology/capabilities/cancel-order.md'), capabilityNode('capabilities/cancel-order', 'Cancel Order', 'domains/order', {
        path: 'src/order/cancel.ts',
        symbol: 'cancelOrder',
        dependencies: '[capabilities/charge-card]',
      }));
      write(dir, r('ontology/capabilities/charge-card.md'), capabilityNode('capabilities/charge-card', 'Charge Card', 'domains/payment', {
        path: 'src/payment/charge.ts',
        symbol: 'charge',
      }));
      git(path.join(dir, 'repo'), ['init', '--quiet', '--initial-branch=main']);
      commit(path.join(dir, 'repo'), 'chore: first commit', '2026-01-10T09:00:00+00:00');
      write(dir, r('src/payment/charge.ts'), "export function charge(amount: number, currency = 'KRW'): string {\n  return `charged-${amount}-${currency}`;\n}\n\nexport function refund(id: string): boolean {\n  return id.length > 0;\n}\n");
      commit(path.join(dir, 'repo'), 'feat: charge takes a currency', '2026-02-10T09:00:00+00:00');
      write(dir, r('ontology/capabilities/cancel-order.md'), capabilityNode('capabilities/cancel-order', 'Cancel Order', 'domains/order', {
        path: 'src/order/cancel.ts',
        symbol: 'cancelOrder',
        dependencies: '[capabilities/charge-card]',
        description: '"Cancel Order: reworded after the source."',
      }));
      commit(path.join(dir, 'repo'), 'docs: reword cancel order', '2026-03-10T09:00:00+00:00');
      write(dir, r('src/order/placement.ts'), "import { charge } from '../payment/charge';\n\nexport function placeOrder(cart: string[]): string {\n  return charge(cart.length);\n}\n");
      write(dir, r('ontology/notes.md'), '# Uncommitted note\n\nNot a node.\n');
    },
  },
};

export const FIXTURE_NAMES = ['storefront', 'atlas-ontology', ...Object.keys(FIXTURE_BUILDERS)];

export function vaultRelOf(name) {
  if (name === 'storefront' || name === 'atlas-ontology') return 'vault';
  return FIXTURE_BUILDERS[name].vaultRel;
}

/** Writes the fixture's folder tree (without planting times) under `dir`. */
export function buildFixture(name, dir, { repoRoot }) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (name === 'storefront') {
    cpSync(path.join(repoRoot, 'samples', 'storefront'), path.join(dir, 'vault'), { recursive: true });
  } else if (name === 'atlas-ontology') {
    cpSync(path.join(repoRoot, 'docs', 'ontology'), path.join(dir, 'vault'), { recursive: true });
  } else if (FIXTURE_BUILDERS[name]) {
    FIXTURE_BUILDERS[name].build(dir);
  } else {
    throw new Error(`unknown fixture "${name}"; known: ${FIXTURE_NAMES.join(', ')}`);
  }
}

function listFiles(dir, base = dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name === '.git' && dir !== base) continue;
    if (entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, base, found);
    else if (!lstatSync(full).isSymbolicLink()) found.push(path.relative(base, full));
  }
  return found;
}

/** Gives every regular file outside `.git` a planted time; returns the plan so a restore repeats it. */
export function plantMtimes(dir) {
  const plan = {};
  listFiles(dir).forEach((relative, index) => {
    const ms = PLANTED_BASE_MS + index * 1000 + PLANTED_FRACTIONS[index % PLANTED_FRACTIONS.length];
    utimesSync(path.join(dir, relative), ms / 1000, ms / 1000);
    plan[relative] = ms;
  });
  return plan;
}

export function replantMtimes(dir, plan) {
  for (const [relative, ms] of Object.entries(plan)) {
    const target = path.join(dir, relative);
    if (existsSync(target)) utimesSync(target, ms / 1000, ms / 1000);
  }
}
