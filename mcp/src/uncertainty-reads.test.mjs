import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractUncertaintyReads, orderUncertaintyReads } from './uncertainty-reads.mjs';

// The extractor reads one thing: the `## Uncertainty` section every node in a
// constructed vault carries. Its whole value is that the row it returns can be
// checked against the sentence it quotes, so every case here pins both.

function body(uncertainty, lead = 'A capability that does something.') {
  return `${lead}\n\n## Uncertainty\n${uncertainty}\n`;
}

function extract(uncertainty, options = {}) {
  return extractUncertaintyReads({
    slug: options.slug ?? 'capabilities/thing',
    kind: options.kind ?? 'capability',
    path: options.path ?? 'src/thing.ts',
    body: body(uncertainty),
  });
}

describe('extractUncertaintyReads — what the author did not read, as a read', () => {
  it('reads nothing outside an uncertainty-family section', () => {
    const rows = extractUncertaintyReads({
      slug: 'capabilities/thing',
      kind: 'capability',
      path: 'src/thing.ts',
      body: '## Includes\n- `src/other.ts` was not read.\n',
    });
    assert.deepEqual(rows, []);
  });

  it('reads the family synonyms the construction rules accept', () => {
    for (const heading of ['Uncertainty', 'Open questions', 'Unknowns', 'Not checked', 'Confidence']) {
      const rows = extractUncertaintyReads({
        slug: 'capabilities/thing',
        kind: 'capability',
        path: 'src/thing.ts',
        body: `Lead.\n\n## ${heading}\n- \`src/parser.ts\` was not read.\n`,
      });
      assert.equal(rows.length, 1, `heading ${heading} produced no row`);
      assert.deepEqual(rows[0].paths, ['src/parser.ts']);
    }
  });

  it('skips the starter placeholder, so an unfilled scaffold queues no reads', () => {
    const rows = extract('- <what you did not read or could not check>');
    assert.deepEqual(rows, []);
  });

  /*
   * "Lines 1–110 of 2790 were read" names what WAS read. Until 2026-09-23 the
   * queue handed back 1–110 as the next read, sending the reader over ground
   * already covered; the lines still to read are 111–2790.
   */
  it('turns a bounded partial read into the lines still unread', () => {
    const [row] = extract(
      '- Of `mcp/src/ontology-engine.mjs`, lines 1–110 of 2790 were read; the rest was not read.',
    );
    assert.equal(row.kind, 'unread-range');
    assert.deepEqual(row.paths, ['mcp/src/ontology-engine.mjs']);
    assert.deepEqual(row.ranges, [{ path: 'mcp/src/ontology-engine.mjs', from: 111, to: 2790 }]);
    assert.deepEqual(row.readRanges, [{ path: 'mcp/src/ontology-engine.mjs', from: 1, to: 110 }]);
  });

  it('keeps a read span with no known end as what was read, never as the next read', () => {
    const [hyphen] = extract('- `src/parse.ts` lines 45-74 were read; nothing else was read.');
    assert.deepEqual(hyphen.ranges, []);
    assert.deepEqual(hyphen.readRanges, [{ path: 'src/parse.ts', from: 45, to: 74 }]);
    const [unread] = extract('- Lines 45-74 of `src/parse.ts` were not read.');
    assert.deepEqual(unread.ranges, [{ path: 'src/parse.ts', from: 45, to: 74 }]);
    const [single] = extract('- `src/parse.ts` line 42 was read; the parse methods were not read.');
    assert.deepEqual(single.readRanges, [{ path: 'src/parse.ts', from: 42, to: 42 }]);
    assert.equal(single.kind, 'unread-file');
  });

  it('gives a range the nearest file written before it when a statement names two', () => {
    const [row] = extract(
      '- `src/a.ts` was read in full; of `src/b.ts`, lines 10–20 were read and the rest was not read.',
    );
    assert.deepEqual(row.paths, ['src/a.ts', 'src/b.ts']);
    assert.deepEqual(row.readRanges, [{ path: 'src/b.ts', from: 10, to: 20 }]);
    assert.match(row.slug, /capabilities\/thing/);
  });

  /*
   * Measured on a Rust trial vault (2026-09-23): six of nineteen Uncertainty
   * lines said "read only in outline" and fell to `other`, one of them holding
   * the answer a sealed reader then missed; "from line 276 to line 470" was
   * split into two one-line spans; and "lines 138-414 of src/cli.rs" was filed
   * under an earlier file in the same sentence.
   */
  /*
   * This repository's own vault (2026-09-23): 49 of 107 Uncertainty lines fell
   * to `other`, most of them "read from the module header", "by layout" or "was
   * never exercised". Each names a body nobody read or a thing nobody ran.
   */
  it('reads a surface-only read, an unexercised ability and an editor-style citation', () => {
    const header = extract('- Read from the module header. It was never exercised in this vault.', {
      path: 'mcp/src/x.mjs',
    })[0];
    assert.equal(header.kind, 'unread-file');
    assert.deepEqual(header.paths, ['mcp/src/x.mjs']);
    assert.equal(extract("- Read from the feature's file layout only.")[0].kind, 'unread-file');
    assert.equal(extract('- No turn was run and no provider was contacted.')[0].kind, 'not-executed');
    assert.equal(extract('- Whether every mapping exists was not checked.')[0].kind, 'unverified-claim');
    // `file:line` is how this vault cites what it read: the file is found, and
    // nothing is queued as unread on the strength of a citation.
    const cited = extract('- Read today: the literal at `mcp/src/rules.mjs:677` and `:733`.')[0];
    assert.deepEqual(cited.paths, ['mcp/src/rules.mjs']);
    assert.deepEqual(cited.ranges, []);
  });

  it('reads the phrasing a builder actually writes', () => {
    const outlined = extract(
      '- `Options::from_cli_arguments` runs from line 276 to line 470 and was read only in outline, so some individual flag conversions were not checked line by line.',
      { path: 'src/options.rs' },
    )[0];
    assert.equal(outlined.kind, 'unread-range');
    assert.deepEqual(outlined.ranges, [{ path: 'src/options.rs', from: 276, to: 470 }]);

    const ownFile = extract(
      '- It did not read tests/, src/error.rs, the src/util/ helpers, or lines 138-414 of src/cli.rs.',
      { path: 'README.md' },
    )[0];
    assert.deepEqual(ownFile.ranges, [{ path: 'src/cli.rs', from: 138, to: 414 }]);

    const through = extract(
      '- Only lines 18-137 were read directly; the remaining flag declarations through line 414 were seen as an outline and not checked one by one.',
      { path: 'src/cli.rs' },
    )[0];
    assert.equal(through.kind, 'unread-range');
    assert.deepEqual(through.ranges, [{ path: 'src/cli.rs', from: 138, to: 414 }]);
    assert.deepEqual(through.readRanges, [{ path: 'src/cli.rs', from: 18, to: 137 }]);

    const onlyRead = extract(
      '- Only lines 141-220 of the `run` method were read; the part that decides when enough runs have happened sits further down the file and was not read directly.',
      { path: 'src/benchmark/mod.rs' },
    )[0];
    assert.equal(onlyRead.kind, 'unread-file');
    assert.deepEqual(onlyRead.ranges, []);
    assert.deepEqual(onlyRead.readRanges, [{ path: 'src/benchmark/mod.rs', from: 141, to: 220 }]);

    for (const sentence of [
      '- The full list of warning variants was read as an outline only.',
      '- Read as an outline only; nothing else was opened.',
      '- The whole of scheduler.rs was read only in outline.',
    ]) {
      assert.equal(extract(sentence, { path: 'src/x.rs' })[0].kind, 'unread-file', sentence);
    }
  });

  it('classifies a whole unread file, an unopened area, an unrun command and a name-only claim', () => {
    assert.equal(extract('- The parse methods were not read.')[0].kind, 'unread-file');
    assert.equal(extract('- `src-tauri` was never opened.')[0].kind, 'unopened-area');
    assert.equal(extract('- The command was not run in this scan.')[0].kind, 'not-executed');
    assert.equal(extract('- It was never run against this vault.')[0].kind, 'not-executed');
    assert.equal(
      extract('- The contract test corroborates by heading name only.')[0].kind,
      'unverified-claim',
    );
    assert.equal(extract('- Whether this matters to a reader is unverified.')[0].kind, 'unverified-claim');
    assert.equal(extract('- No host was configured during this scan.')[0].kind, 'other');
  });

  it('inherits the node path only where the phrasing is about reading', () => {
    const unread = extract('- The parse methods were not read.');
    assert.deepEqual(unread[0].paths, ['src/thing.ts']);
    const unopened = extract('- Nothing under the native layer was ever opened.');
    assert.deepEqual(unopened[0].paths, []);
    const other = extract('- No host was configured during this scan.');
    assert.deepEqual(other[0].paths, []);
  });

  it('takes a path from a token only when it carries both a separator and an extension', () => {
    const [bare] = extract('- docs/FEATURES.md was not read, and neither was FEATURES.md.');
    assert.deepEqual(bare.paths, ['docs/FEATURES.md']);
  });

  it('takes a backticked folder or bare file name, and refuses a backticked identifier', () => {
    const [row] = extract(
      '- Read `analyze_repo_structure` by name; `src-tauri/` and `schema.mjs` were not read.',
    );
    assert.deepEqual(row.paths, ['src-tauri/', 'schema.mjs']);
  });

  it('does not mistake a sentence-final word or a URL for a file', () => {
    const [row] = extract(
      '- The published spec at https://example.com/spec.html was not read, and neither was this.',
    );
    assert.deepEqual(row.paths, ['src/thing.ts']);
  });

  it('quotes the author and drops the list marker', () => {
    const [row] = extract('- The parse methods were not read.');
    assert.equal(row.statement, 'The parse methods were not read.');
  });

  it('returns one row per statement', () => {
    const rows = extract('- `src/a.ts` was not read.\n- `src/b.ts` was not read.');
    assert.deepEqual(rows.map((row) => row.paths[0]), ['src/a.ts', 'src/b.ts']);
  });

  it('refuses a call with no slug rather than inventing one', () => {
    assert.deepEqual(extractUncertaintyReads({ kind: 'capability', body: body('- x was not read.') }), []);
    assert.deepEqual(extractUncertaintyReads(), []);
  });
});

describe('orderUncertaintyReads — the queue, and the sentence that clears a row', () => {
  it('orders by kind first, then slug, and keeps the author order inside one node', () => {
    const rows = [
      ...extract('- No host was configured during this scan.', { slug: 'capabilities/z' }),
      ...extract('- The command was not run.', { slug: 'capabilities/c' }),
      ...extract('- `src/b.ts` was not read.', { slug: 'capabilities/b' }),
      ...extract('- `src/a.ts` lines 1–9 of 900 were read.', { slug: 'capabilities/a' }),
      ...extract('- `src/y.ts` was never opened.', { slug: 'capabilities/y' }),
      ...extract('- Corroborated by heading name only.', { slug: 'capabilities/x' }),
    ];
    assert.deepEqual(
      orderUncertaintyReads(rows).map((row) => row.kind),
      ['unread-range', 'unread-file', 'unopened-area', 'not-executed', 'unverified-claim', 'other'],
    );
  });

  it('sorts by slug inside one kind and keeps statement order inside one slug', () => {
    const rows = [
      ...extract('- `src/two.ts` was not read.\n- `src/one.ts` was not read.', {
        slug: 'capabilities/b',
      }),
      ...extract('- `src/zero.ts` was not read.', { slug: 'capabilities/a' }),
    ];
    assert.deepEqual(
      orderUncertaintyReads(rows).map((row) => row.paths[0]),
      ['src/zero.ts', 'src/two.ts', 'src/one.ts'],
    );
  });

  it('names the file, the span and the write that closes the question', () => {
    const [row] = orderUncertaintyReads(
      extract('- Of `src/parse.ts`, lines 1–110 of 2790 were read; the rest was not read.'),
    );
    assert.equal(
      row.proposedAction,
      'Read src/parse.ts (lines 111–2790), then patch_concept capabilities/thing to state what it' +
        ' settled or to move the statement out of Uncertainty.',
    );
  });

  it('says "beyond" a read span whose end it does not know', () => {
    const [row] = orderUncertaintyReads(
      extract('- Only lines 141-220 were read; the rest was not read.', { path: 'src/b.rs' }),
    );
    assert.match(row.proposedAction, /^Read src\/b\.rs beyond lines 141–220, which were already read, then/);
  });

  it('drops the span when the author gave none', () => {
    const [row] = orderUncertaintyReads(extract('- `src/parse.ts` was not read.'));
    assert.equal(
      row.proposedAction,
      'Read src/parse.ts, then patch_concept capabilities/thing to state what it settled or to' +
        ' move the statement out of Uncertainty.',
    );
  });

  it('says so rather than pointing at a file when the statement names none', () => {
    const [row] = orderUncertaintyReads(extract('- No host was configured during this scan.'));
    assert.equal(
      row.proposedAction,
      'Read the source behind capabilities/thing, then patch_concept capabilities/thing to state' +
        ' what it settled or to move the statement out of Uncertainty.',
    );
  });
});

describe('extractUncertaintyReads — the phrasings this repository actually wrote', () => {
  const REAL = [
    {
      slug: 'domains/meaning-layer',
      statement:
        'Read from the names and layout of `mcp/src/schema.mjs`, `mcp/src/parser.mjs` and' +
        ' `mcp/src/validate.mjs`. The mirrored copies under `cli/src/lib/` were seen referenced in' +
        ' prose but not read line by line, so how completely the three surfaces share one schema is' +
        ' unverified here.',
      kind: 'unread-file',
      firstPath: 'mcp/src/schema.mjs',
    },
    {
      slug: 'ontology-atlas',
      statement:
        'The `src-tauri/` native layer was never opened. Where a capability depends on it, that' +
        ' dependence is described from the web-side bridge rather than from the native code.',
      kind: 'unopened-area',
      firstPath: 'src-tauri/',
    },
    {
      slug: 'elements/cli-mcp-verify',
      statement:
        "Identified from the command file and from the repository's statement that this check" +
        ' independently compares the live list with the initialize announcement. It was not run in' +
        ' this session.',
      kind: 'not-executed',
      firstPath: undefined,
    },
    {
      slug: 'elements/insights-duplicate-pairs',
      statement:
        'Witnessed as an import of the insights page and read by name only. Its scoring was not' +
        ' compared against the duplicate check the agent surface offers before a write, and the two' +
        ' may not agree.',
      kind: 'unverified-claim',
      firstPath: undefined,
    },
    {
      slug: 'capabilities/architecture-conformance',
      statement:
        'Read from `mcp/src/architecture-profile.mjs` and the `inspect_architecture` description;' +
        ' no profile exists in this vault yet, so the capability was never run here, and the' +
        ' app-side architecture screen under `src/views/architecture/` was listed but not opened.',
      kind: 'unopened-area',
      firstPath: 'mcp/src/architecture-profile.mjs',
    },
  ];

  for (const sample of REAL) {
    it(`classifies the ${sample.slug} uncertainty as ${sample.kind}`, () => {
      const rows = extractUncertaintyReads({
        slug: sample.slug,
        kind: 'capability',
        path: null,
        body: body(`- ${sample.statement}`),
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].kind, sample.kind);
      assert.equal(rows[0].paths[0], sample.firstPath);
      assert.equal(rows[0].statement, sample.statement);
    });
  }
});
