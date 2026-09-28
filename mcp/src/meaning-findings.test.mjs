/**
 * One firing and one silent case per meaning code. The silent half matters most:
 * a check that flags a node somebody wrote properly gets switched off.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join, sep } from 'node:path';

import { defaultBody } from './schema.mjs';
import {
  boundaryFindings,
  definitionFinding,
  dependencyWitnessFinding,
  epistemicExclusionFinding,
  folderOnlyEvidenceFinding,
  isStarterExampleNode,
  starterExampleFindings,
  uncertaintyFinding,
  meaningFindings,
} from './meaning-findings.mjs';
import { compileOntology } from './ontology-compiler.mjs';
import { queryCompiledOntology } from './ontology-engine.mjs';

const WRITTEN_CAPABILITY = [
  '# Vault Folder Access',
  '',
  'Opens one Markdown folder on the user\'s disk and keeps reading it as the graph,',
  'so nothing about the ontology depends on a server being reachable.',
  '',
  '## Includes',
  '',
  '- Picking a folder and remembering the handle between sessions.',
  '',
  '## Excludes',
  '',
  '- Syncing that folder to another machine; team sync is a separate layer.',
  '',
  '## Uncertainty',
  '',
  '- The Safari fallback was inferred from the feature check, not exercised.',
  '',
].join('\n');

function codes(findings) {
  return findings.map((finding) => finding.code).sort();
}

describe('definition-missing — a label is not a concept', () => {
  it('fires on the starter scaffold every kind ships', () => {
    for (const kind of ['domain', 'capability', 'element']) {
      const finding = definitionFinding({
        kind,
        slug: `${kind}s/fresh`,
        title: 'Fresh',
        body: defaultBody(kind, 'Fresh'),
      });
      assert.ok(finding, `${kind} starter body must be reported`);
      assert.equal(finding.code, 'definition-missing');
      assert.match(finding.message, /patch_concept/);
      assert.match(finding.message, /write succeeded/);
    }
  });

  it('fires when the body opens straight into headings', () => {
    const finding = definitionFinding({
      kind: 'capability',
      slug: 'capabilities/thin',
      title: 'Thin',
      body: '# Thin\n\n## Includes\n\n- Something real and concrete.\n',
    });
    assert.ok(finding);
  });

  it('fires when the kept boilerplate merely has a line appended', () => {
    const body = `${defaultBody('domain', 'Kept')}\nWe also use this for the CLI.\n`;
    assert.ok(definitionFinding({ kind: 'domain', slug: 'domains/kept', title: 'Kept', body }));
  });

  /*
   * The qualification lane's shape: nothing above the first `##`, the definition
   * under `## Definition`.
   */
  it('stays silent when the definition lives under its own heading and nothing precedes it', () => {
    const body = [
      '## Definition',
      '',
      'The `Argument` class for positional arguments, which reads required or optional',
      'from the brackets around the name and variadic from a trailing ellipsis.',
      '',
      '## Evidence',
      '',
      '- `lib/argument.js`',
      '',
    ].join('\n');
    assert.equal(definitionFinding({ kind: 'element', slug: 'elements/argument', title: 'Argument', body }), null);
  });

  it('reads the other headings a definition is written under', () => {
    for (const heading of ['Summary', 'What it is', 'What this is', 'Overview']) {
      const body = `## ${heading}\n\nOne sentence that states what this capability does and where its edge is.\n`;
      assert.equal(
        definitionFinding({ kind: 'capability', slug: 'capabilities/x', title: 'X', body }),
        null,
        heading,
      );
    }
  });

  it('still fires when the definition heading is there but says almost nothing', () => {
    const body = '## Definition\n\nA bottom tab bar widget.\n';
    assert.ok(definitionFinding({ kind: 'element', slug: 'elements/tabs', title: 'Tabs', body }));
  });

  it('stays silent on a body that says what the node is', () => {
    assert.equal(
      definitionFinding({
        kind: 'capability',
        slug: 'capabilities/vault-folder-access',
        title: 'Vault Folder Access',
        body: WRITTEN_CAPABILITY,
      }),
      null,
    );
  });

  /*
   * Length alone cannot tell a terse definition from the title with grammar
   * around it; rule 3a asks for a non-circular sentence, so novel words count.
   */
  it('fires on an eight-word sentence that only restates the title', () => {
    const finding = definitionFinding({
      kind: 'element',
      slug: 'elements/bottom-tab-bar',
      title: 'Bottom Tab Bar',
      body: '## Definition\n\nMobile/web bottom tab navigation widget for the app\n',
    });
    assert.ok(finding);
    assert.match(finding.message, /only restates the title/);
  });

  it('stays silent on a definition of the same length that says something new', () => {
    assert.equal(
      definitionFinding({
        kind: 'capability',
        slug: 'capabilities/option-declaration',
        title: 'Option Declaration',
        body: '## Definition\n\nTurns the declared option list into a value map, recording which source won\n',
      }),
      null,
    );
  });

  it('counts distinct words, so repeating one new word is still a restatement', () => {
    assert.ok(
      definitionFinding({
        kind: 'element',
        slug: 'elements/parser',
        title: 'Parser',
        body: '## Definition\n\nThe parser parses and parses and parses the parsed parse\n',
      }),
    );
  });

  it('does not judge a project or a document body', () => {
    for (const kind of ['project', 'document']) {
      assert.equal(definitionFinding({ kind, slug: `${kind}/x`, title: 'X', body: '' }), null);
    }
  });
});

describe('boundary-missing — one finding per missing side', () => {
  it('fires for both sides on the starter scaffold, whose bullets are still slots', () => {
    const findings = boundaryFindings({
      kind: 'capability',
      slug: 'capabilities/fresh',
      title: 'Fresh',
      body: defaultBody('capability', 'Fresh'),
    });
    assert.deepEqual(findings.map((finding) => finding.key).sort(), ['excludes', 'includes']);
    assert.deepEqual(codes(findings), ['boundary-missing', 'boundary-missing']);
  });

  it('fires only for the side that is missing', () => {
    const body = '# Half\n\nThis capability turns a chosen folder into a live ontology graph.\n\n## Includes\n\n- Reading frontmatter from every Markdown file.\n';
    const findings = boundaryFindings({ kind: 'capability', slug: 'capabilities/half', title: 'Half', body });
    assert.deepEqual(findings.map((finding) => finding.key), ['excludes']);
  });

  it('reads the synonyms a vault already uses, and reads them on the right side', () => {
    const body = [
      '# Scoped',
      '',
      'This domain owns how a person chooses and keeps one local vault folder.',
      '',
      '## In scope',
      '',
      '- Choosing the folder, and remembering it.',
      '',
      '## Out of scope',
      '',
      '- Anything that leaves the machine.',
      '',
    ].join('\n');
    assert.deepEqual(boundaryFindings({ kind: 'domain', slug: 'domains/scoped', title: 'Scoped', body }), []);
  });

  it('does not judge an element body', () => {
    assert.deepEqual(
      boundaryFindings({ kind: 'element', slug: 'elements/parser', title: 'Parser', body: '' }),
      [],
    );
  });
});

describe('uncertainty-missing — a body with no unknown claims completeness', () => {
  it('fires when no section records what was not checked', () => {
    const body = [
      '# Folder Access',
      '',
      'Opens one Markdown folder on disk and keeps reading it as the ontology graph.',
      '',
      '## Includes',
      '',
      '- Choosing the folder and remembering it.',
      '',
    ].join('\n');
    const finding = uncertaintyFinding({ kind: 'capability', slug: 'capabilities/folder-access', title: 'Folder Access', body });
    assert.ok(finding);
    assert.equal(finding.code, 'uncertainty-missing');
    assert.equal(finding.key, 'uncertainty');
    assert.match(finding.message, /## Uncertainty/);
    assert.match(finding.message, /patch_concept/);
    assert.match(finding.message, /nothing here blocks it/);
  });

  it('stays silent once the section says something, under any of its names', () => {
    for (const heading of ['Uncertainty', 'Open questions', 'Unknowns', 'Not checked', 'Confidence']) {
      const body = `# X\n\nOne sentence that states what this capability does and where its edge is.\n\n## ${heading}\n\n- The second caller was inferred from imports, not read.\n`;
      assert.equal(
        uncertaintyFinding({ kind: 'capability', slug: 'capabilities/x', title: 'X', body }),
        null,
        heading,
      );
    }
  });

  it('still fires when the section is there but holds only the scaffold placeholder', () => {
    // A slot is not an answer, or the default write would silence the question it
    // cannot have answered.
    const finding = uncertaintyFinding({
      kind: 'element',
      slug: 'elements/parser',
      title: 'Parser',
      body: defaultBody('element', 'Parser'),
    });
    assert.ok(finding);
  });

  it('does not judge a project or a document body', () => {
    for (const kind of ['project', 'document']) {
      assert.equal(uncertaintyFinding({ kind, slug: `${kind}/x`, title: 'X', body: '' }), null);
    }
  });
});

describe('epistemic-exclusion — an evidence limit is not a product boundary', () => {
  it('fires on an exclusion that states what the scan did not see', () => {
    const body = [
      '# Scanned',
      '',
      'This capability answers which files a chosen vault folder contains right now.',
      '',
      '## Includes',
      '',
      '- Walking the folder once per request.',
      '',
      '## Excludes',
      '',
      '- Remote vaults, which are not mentioned in this scan.',
      '',
    ].join('\n');
    const finding = epistemicExclusionFinding({
      kind: 'capability',
      slug: 'capabilities/scanned',
      title: 'Scanned',
      body,
    });
    assert.ok(finding);
    assert.equal(finding.code, 'epistemic-exclusion');
    assert.equal(finding.key, 'excludes');
    assert.match(finding.message, /not mentioned in this scan/);
    assert.match(finding.message, /Uncertainty|Open questions/);
    assert.match(finding.message, /patch_concept/);
  });

  /*
   * Three exclusions a real builder wrote under `## Excludes`, each saying what
   * the writer did not get to; a source-hidden reader repeats them as facts.
   */
  it('fires on the three shapes a real build produced', () => {
    const bullets = [
      'the test suite and the examples folder, which this survey did not inspect',
      '`typings/index.d.ts`, the TypeScript surface, which was not read',
      '`index.js`, the package front door, which was read but is not carried as a node in this first pass',
    ];
    const body = ['# Argv toolkit', '', '## Excludes', '', ...bullets.map((row) => `- ${row}`), ''].join('\n');
    const finding = epistemicExclusionFinding({ kind: 'project', slug: 'argv-toolkit', title: 'Argv toolkit', body });
    assert.ok(finding);
    assert.equal(finding.count, 3);
    assert.deepEqual(finding.refs, bullets);
  });

  it('stays silent on product boundaries from the same vault', () => {
    // Genuine product boundaries beside the three above.
    const bullets = [
      'flags, which are options rather than positional arguments',
      'deciding the exit code and printing the failure, which is error reporting',
    ];
    const body = ['# Arguments', '', '## Excludes', '', ...bullets.map((row) => `- ${row}`), ''].join('\n');
    assert.equal(
      epistemicExclusionFinding({ kind: 'capability', slug: 'capabilities/arguments', title: 'Arguments', body }),
      null,
    );
  });

  it('stays silent on a real product boundary', () => {
    assert.equal(
      epistemicExclusionFinding({
        kind: 'capability',
        slug: 'capabilities/vault-folder-access',
        title: 'Vault Folder Access',
        body: WRITTEN_CAPABILITY,
      }),
      null,
    );
  });

  it('judges a project body too — an exclusion nobody can check is worst there', () => {
    const body = [
      '# Atlas',
      '',
      'A local-first ontology workbench for one person and their own repository.',
      '',
      '## Excludes',
      '',
      '- Billing, which was not established by this scan.',
      '',
    ].join('\n');
    const finding = epistemicExclusionFinding({ kind: 'project', slug: 'atlas', title: 'Atlas', body });
    assert.ok(finding);
    assert.equal(finding.count, 1);
  });
});

describe('folder-only-evidence — drift on a folder cannot be checked', () => {
  function repo() {
    const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-meaning-findings-'));
    mkdirSync(join(root, 'mcp', 'src'), { recursive: true });
    writeFileSync(join(root, 'mcp', 'src', 'index.js'), '// entry\n');
    writeFileSync(join(root, 'mcp', 'src', 'vault.mjs'), '// vault\n');
    return root;
  }

  it('fires on a cited directory and names the file to open first', (t) => {
    const root = repo();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const finding = folderOnlyEvidenceFinding({
      kind: 'capability',
      slug: 'capabilities/mcp-server',
      frontmatter: { path: 'mcp/src' },
      repoRoot: root,
    });
    assert.ok(finding);
    assert.equal(finding.code, 'folder-only-evidence');
    assert.equal(finding.key, 'path');
    assert.match(finding.message, /mcp\/src\/index\.js/);
    assert.match(finding.message, /patch_concept/);
  });

  it('stays silent when the cited path is a file', (t) => {
    const root = repo();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.equal(
      folderOnlyEvidenceFinding({
        kind: 'element',
        slug: 'elements/vault-writer',
        frontmatter: { path: 'mcp/src/vault.mjs' },
        repoRoot: root,
      }),
      null,
    );
  });

  /*
   * Security: `path:` is untrusted, and `../` escapes as well as an absolute path;
   * the check lists a directory and echoes a filename.
   */
  it('refuses to leave the repository through `../`, so nothing outside it is listed', (t) => {
    const root = repo();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    // A real directory beside the repository whose filename must never appear.
    const outside = join(root, '..', `outside-${randomUUID()}`);
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'private-notes.txt'), 'not for a tool response\n');
    t.after(() => rmSync(outside, { recursive: true, force: true }));

    const escape = `../${outside.split(sep).pop()}`;
    assert.equal(
      folderOnlyEvidenceFinding({
        kind: 'capability',
        slug: 'capabilities/escape',
        frontmatter: { path: escape },
        repoRoot: root,
      }),
      null,
    );
    // Positive control: one directory in still fires, so the null above is the clamp.
    assert.ok(
      folderOnlyEvidenceFinding({
        kind: 'capability',
        slug: 'capabilities/inside',
        frontmatter: { path: 'mcp/src' },
        repoRoot: root,
      }),
    );
    assert.ok(
      folderOnlyEvidenceFinding({
        kind: 'capability',
        slug: 'capabilities/roundtrip',
        frontmatter: { path: 'mcp/../mcp/src' },
        repoRoot: root,
      }),
    );
  });

  it('stays silent when the root is ungrounded or the path is absent', (t) => {
    const root = repo();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.equal(
      folderOnlyEvidenceFinding({
        kind: 'capability',
        slug: 'capabilities/mcp-server',
        frontmatter: { path: 'mcp/src' },
        repoRoot: null,
      }),
      null,
    );
    // A missing path is validate_vault's pathDrift answer; saying it twice teaches skimming.
    assert.equal(
      folderOnlyEvidenceFinding({
        kind: 'capability',
        slug: 'capabilities/gone',
        frontmatter: { path: 'mcp/gone' },
        repoRoot: root,
      }),
      null,
    );
  });
});

describe('meaningFindings — only what this write touched', () => {
  it('reports nothing when neither the body nor the path was written', () => {
    assert.deepEqual(
      meaningFindings({
        kind: 'capability',
        slug: 'capabilities/fresh',
        frontmatter: { title: 'Fresh' },
        body: defaultBody('capability', 'Fresh'),
      }),
      [],
    );
  });

  it('reports the body codes when the body was written', () => {
    const findings = meaningFindings({
      kind: 'capability',
      slug: 'capabilities/fresh',
      frontmatter: { title: 'Fresh' },
      body: defaultBody('capability', 'Fresh'),
      bodyWritten: true,
    });
    assert.deepEqual(codes(findings), [
      'boundary-missing',
      'boundary-missing',
      'definition-missing',
      'uncertainty-missing',
    ]);
  });

  it('reports nothing on a body that answered every question', () => {
    assert.deepEqual(
      meaningFindings({
        kind: 'capability',
        slug: 'capabilities/vault-folder-access',
        frontmatter: { title: 'Vault Folder Access' },
        body: WRITTEN_CAPABILITY,
        bodyWritten: true,
      }),
      [],
    );
  });
});

/**
 * A declared dependency the citing file never mentions. The silent cases matter
 * twice here: a missing import is not proof of independence, so every uncertain
 * input must produce silence rather than a guess.
 */
describe('dependency-unwitnessed — the file cited does not name the file depended on', () => {
  /** `consumer.ts` imports the helper by name; `stranger.ts` never mentions it. */
  function repoWithSources() {
    const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-dependency-witness-'));
    mkdirSync(join(root, 'src', 'lib'), { recursive: true });
    mkdirSync(join(root, 'src', 'empty'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'lib', 'helper.ts'),
      'export function helper() { return 1; }\n',
    );
    writeFileSync(
      join(root, 'src', 'consumer.ts'),
      "import { helper } from './lib/helper';\n\nexport const used = helper();\n",
    );
    writeFileSync(join(root, 'src', 'lib', '.toolrc'), '{ "on": true }\n');
    /*
     * The file that makes the verbatim-path branch necessary: a dotfile has no
     * basename left after the extension rule, and a config file is exactly the
     * dependency no import would witness.
     */
    writeFileSync(
      join(root, 'src', 'quoted.ts'),
      "const config = await load('src/lib/.toolrc');\nexport default config;\n",
    );
    writeFileSync(
      join(root, 'src', 'stranger.ts'),
      'export const nothing = "this file mentions no other file at all";\n',
    );
    writeFileSync(
      join(root, 'src', 'bystander.ts'),
      'export const unrelated = "a real file that knows nothing about the target";\n',
    );
    // The barrel shape: a third file that witnesses the edge neither end shows.
    writeFileSync(
      join(root, 'src', 'lib', 'barrel.ts'),
      "export { helper } from './helper';\n",
    );
    return root;
  }

  const TARGETS = { 'elements/helper': 'src/lib/helper.ts' };
  const resolveTargetPath = (ref) => TARGETS[ref] ?? null;

  it('scans source imports once for many dependencies and releases the parsed source after each call', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const dependencies = Array.from({ length: 12 }, (_, index) => `elements/dependency-${index}`);
    const source = dependencies.slice(0, -1)
      .map((ref) => `import './lib/${ref.split('/').pop()}';`).join('\n')
      + '\nconst note = "dependency-11 is only a word";\n';
    writeFileSync(join(root, 'src', 'consumer.ts'), source);
    const input = {
      slug: 'capabilities/consumer',
      frontmatter: { path: 'src/consumer.ts', dependencies },
      repoRoot: root,
      resolveTargetPath: (ref) => `src/lib/${ref.split('/').pop()}.ts`,
    };
    const matchAll = String.prototype.matchAll;
    let scans = 0;
    t.mock.method(String.prototype, 'matchAll', function (pattern) {
      if (String(this) === source) scans += 1;
      return matchAll.call(this, pattern);
    });
    assert.deepEqual(dependencyWitnessFinding(input).map((row) => row.key), [dependencies.at(-1)]);
    assert.ok(scans > 0, 'the fixture must parse imports, not take the literal-path shortcut');
    assert.ok(scans < dependencies.length * 2,
      `${scans} source scans for ${dependencies.length} dependencies; reuse the parsed imports within one call`);
    const firstScans = scans;
    assert.deepEqual(dependencyWitnessFinding(input).map((row) => row.key), [dependencies.at(-1)]);
    assert.ok(scans > firstScans, 'source text must not be retained in a process-wide cache');
  });

  it('keeps source and rationale imports distinct and rereads changed files on the next call', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const input = {
      slug: 'capabilities/consumer',
      frontmatter: {
        path: 'src/consumer.ts',
        dependencies: ['elements/helper', 'elements/second', 'elements/absent'],
        relation_notes: { 'elements/second': 'Wired by src/lib/barrel.ts:1.' },
      },
      repoRoot: root,
      resolveTargetPath: (ref) => `src/lib/${ref.split('/').pop()}.ts`,
    };
    writeFileSync(join(root, 'src', 'lib', 'barrel.ts'), "export { second } from './second';\n");
    assert.deepEqual(dependencyWitnessFinding(input).map((row) => row.key), ['elements/absent']);
    writeFileSync(join(root, 'src', 'lib', 'barrel.ts'), 'export const second = "a bare word";\n');
    assert.deepEqual(dependencyWitnessFinding(input).map((row) => row.key), ['elements/second', 'elements/absent']);
    writeFileSync(join(root, 'src', 'consumer.ts'), "import './lib/second';\n");
    assert.deepEqual(dependencyWitnessFinding(input).map((row) => row.key), ['elements/helper', 'elements/absent']);
  });

  it('fires on an edge this write added, naming both files and both repairs', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const findings = dependencyWitnessFinding({
      slug: 'capabilities/stranger',
      frontmatter: { path: 'src/stranger.ts', dependencies: ['elements/helper'] },
      previousFrontmatter: { path: 'src/stranger.ts', dependencies: [] },
      repoRoot: root,
      resolveTargetPath,
    });
    assert.equal(findings.length, 1);
    const [finding] = findings;
    assert.equal(finding.code, 'dependency-unwitnessed');
    assert.equal(finding.key, 'elements/helper');
    assert.deepEqual(finding.refs, ['elements/helper']);
    assert.match(finding.message, /src\/stranger\.ts/);
    assert.match(finding.message, /src\/lib\/helper\.ts/);
    // The witness must be offered before the deletion.
    assert.match(finding.message, /not.*proof of independence/);
    assert.match(finding.message, /replace_relation/);
    assert.match(finding.message, /remove_relation/);
  });

  /**
   * File paths in the edge's `why` are witness candidates on the same terms as any
   * other file, since the message tells the writer to put the witness there.
   */
  it('a whole-vault pass keeps no cited file text once each document is judged', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-witness-pass-'));
    try {
      mkdirSync(join(root, 'src'));
      const count = 24;
      const padding = `// ${'x'.repeat(1024 * 1024)}\n`;
      for (let index = 0; index < count; index += 1) {
        const imports = index % 2 === 0 ? `import './m-${(index + 1) % count}';\n` : '';
        writeFileSync(join(root, 'src', `m-${index}.ts`), `${imports}${padding}`);
      }
      const script = `
        import { dependencyWitnessFinding } from ${JSON.stringify(new URL('./meaning-findings.mjs', import.meta.url).href)};
        const heap = () => { globalThis.gc(); globalThis.gc(); return process.memoryUsage().heapUsed; };
        const before = heap();
        globalThis.moduleNamesByPath = new Map();
        let findings = 0;
        for (let index = 0; index < ${count}; index += 1) {
          findings += dependencyWitnessFinding({
            slug: 'capabilities/m-' + index,
            frontmatter: { path: 'src/m-' + index + '.ts', dependencies: ['capabilities/m-' + ((index + 1) % ${count})] },
            repoRoot: ${JSON.stringify(root)},
            resolveTargetPath: (ref) => 'src/' + ref.split('/').pop() + '.ts',
            moduleNamesByPath: globalThis.moduleNamesByPath,
          }).length;
        }
        console.log(JSON.stringify({ retained: heap() - before, findings }));
      `;
      const measured = JSON.parse(execFileSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], {
        encoding: 'utf8',
      }));
      assert.equal(measured.findings, count / 2);
      assert.ok(measured.retained < 1024 * 1024, `the pass kept ${measured.retained} bytes after reading ${count} MiB`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a `why` naming a file that does import the target clears the finding', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.deepEqual(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: {
          path: 'src/stranger.ts',
          dependencies: ['elements/helper'],
          relation_notes: {
            'elements/helper': 'The screen reaches it through `src/consumer.ts`:1, which imports it.',
          },
        },
        repoRoot: root,
        resolveTargetPath,
      }),
      [],
    );
  });

  it('a `why` naming a real file that never mentions the target does not clear it', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.equal(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: {
          path: 'src/stranger.ts',
          dependencies: ['elements/helper'],
          relation_notes: { 'elements/helper': 'See `src/bystander.ts` for the wiring.' },
        },
        repoRoot: root,
        resolveTargetPath,
      }).length,
      1,
      'naming a file is not the same as that file carrying the witness',
    );
  });

  /*
   * A path relative to `src/` or the module folder resolves nowhere from the root,
   * and guessing the intended file would accuse the wrong one, so the finding
   * stands and the message says "repository-relative".
   */
  it('a `why` naming the witness relative to the wrong root does not clear it', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.equal(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: {
          path: 'src/stranger.ts',
          dependencies: ['elements/helper'],
          // A path that resolves nowhere, from the root or from any ancestor
          // of the citing file, is dropped and the finding stands.
          relation_notes: { 'elements/helper': 're-exported from `nowhere/barrel.ts`:1.' },
        },
        repoRoot: root,
        resolveTargetPath,
      }).length,
      1,
    );
    // A barrel path written relative to src/ resolves from the citing file's
    // ancestor and clears the finding.
    assert.deepEqual(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: {
          path: 'src/stranger.ts',
          dependencies: ['elements/helper'],
          relation_notes: { 'elements/helper': 're-exported from `lib/barrel.ts`:1.' },
        },
        repoRoot: root,
        resolveTargetPath,
      }),
      [],
    );
    assert.deepEqual(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: {
          path: 'src/stranger.ts',
          dependencies: ['elements/helper'],
          relation_notes: { 'elements/helper': 're-exported from `src/lib/barrel.ts`:1.' },
        },
        repoRoot: root,
        resolveTargetPath,
      }),
      [],
    );
  });

  /*
   * The fixture file `notes` is readable that names the target, so treating every
   * word as a path would clear this edge: a separator and an extension are both
   * required.
   */
  it('a `why` that is prose only does not clear it, even when a word names a real file', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, 'notes'), 'src/lib/helper.ts is imported all over this repository.\n');
    assert.equal(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: {
          path: 'src/stranger.ts',
          dependencies: ['elements/helper'],
          relation_notes: { 'elements/helper': 'The stranger needs the helper at runtime, see notes.' },
        },
        repoRoot: root,
        resolveTargetPath,
      }).length,
      1,
    );
  });

  /*
   * Security: paths in a `why` are untrusted like `path:`; the clamp stops a
   * rationale from making the check open an arbitrary file.
   */
  it('a `why` naming a path outside the repository is ignored', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const outside = join(root, '..', `outside-${randomUUID()}`);
    mkdirSync(outside, { recursive: true });
    // The escaping file would witness the edge if it were ever read.
    writeFileSync(join(outside, 'witness.ts'), "import './lib/helper';\n");
    t.after(() => rmSync(outside, { recursive: true, force: true }));
    const escape = `../${outside.split(sep).pop()}/witness.ts`;
    assert.equal(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: {
          path: 'src/stranger.ts',
          dependencies: ['elements/helper'],
          relation_notes: { 'elements/helper': `Proved by \`${escape}\`.` },
        },
        repoRoot: root,
        resolveTargetPath,
      }).length,
      1,
    );
  });

  it('stays silent on an edge that was already on disk before this write', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.deepEqual(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: { path: 'src/stranger.ts', dependencies: ['elements/helper'] },
        previousFrontmatter: { path: 'src/stranger.ts', dependencies: ['elements/helper'] },
        repoRoot: root,
        resolveTargetPath,
      }),
      [],
    );
  });

  it('stays silent when the citing file names the target by its basename', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.deepEqual(
      dependencyWitnessFinding({
        slug: 'capabilities/consumer',
        frontmatter: { path: 'src/consumer.ts', dependencies: ['elements/helper'] },
        repoRoot: root,
        resolveTargetPath,
      }),
      [],
    );
  });

  it('stays silent when the citing file names the target path in full', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.deepEqual(
      dependencyWitnessFinding({
        slug: 'capabilities/quoted',
        frontmatter: { path: 'src/quoted.ts', dependencies: ['elements/toolrc'] },
        repoRoot: root,
        resolveTargetPath: (ref) => (ref === 'elements/toolrc' ? 'src/lib/.toolrc' : null),
      }),
      [],
    );
    // Positive control: a file not naming the config still fires, so the silence
    // above is the path spelling, not a dotfile exemption.
    assert.equal(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: { path: 'src/stranger.ts', dependencies: ['elements/toolrc'] },
        repoRoot: root,
        resolveTargetPath: (ref) => (ref === 'elements/toolrc' ? 'src/lib/.toolrc' : null),
      }).length,
      1,
    );
  });

  /*
   * A folder has no text to read, and `folder-only-evidence` already reports the
   * same `path:`.
   */
  it('stays silent when the citing node cites a directory rather than a file', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.deepEqual(
      dependencyWitnessFinding({
        slug: 'capabilities/folder',
        frontmatter: { path: 'src/empty', dependencies: ['elements/helper'] },
        repoRoot: root,
        resolveTargetPath,
      }),
      [],
    );
  });

  /*
   * Security: both ends' `path:` are untrusted; an escaping target must not be
   * opened, named or judged.
   */
  it('stays silent when the target path climbs out of the repository', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const outside = join(root, '..', `outside-${randomUUID()}`);
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'private-notes.txt'), 'not for a tool response\n');
    t.after(() => rmSync(outside, { recursive: true, force: true }));
    const escape = `../${outside.split(sep).pop()}/private-notes.txt`;
    assert.deepEqual(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: { path: 'src/stranger.ts', dependencies: ['elements/outside'] },
        repoRoot: root,
        resolveTargetPath: (ref) => (ref === 'elements/outside' ? escape : null),
      }),
      [],
    );
    // Positive control: the empty array above is the clamp, not a fixture typo.
    assert.equal(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: { path: 'src/stranger.ts', dependencies: ['elements/helper'] },
        repoRoot: root,
        resolveTargetPath,
      }).length,
      1,
    );
  });

  it('stays silent with no repository root — an ungrounded root measures the wrong tree', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.deepEqual(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: { path: 'src/stranger.ts', dependencies: ['elements/helper'] },
        repoRoot: null,
        resolveTargetPath,
      }),
      [],
    );
  });

  it('stays silent when the target node cites no implementation file of its own', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.deepEqual(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: { path: 'src/stranger.ts', dependencies: ['domains/meaning'] },
        repoRoot: root,
        resolveTargetPath,
      }),
      [],
    );
  });

  /*
   * The `depends_on:` key is an authoring alias; reading only the canonical key would
   * judge an add_relation edge and ignore a hand-written one.
   */
  it('reads the `depends_on:` alias as the same edge', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.equal(
      dependencyWitnessFinding({
        slug: 'capabilities/stranger',
        frontmatter: { path: 'src/stranger.ts', depends_on: ['elements/helper'] },
        repoRoot: root,
        resolveTargetPath,
      }).length,
      1,
    );
  });

  /*
   * Without `previousFrontmatter` (the whole-vault passes) every declared edge is
   * judged.
   */
  it('judges every declared edge when no previous frontmatter is supplied', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const findings = dependencyWitnessFinding({
      slug: 'capabilities/stranger',
      frontmatter: {
        path: 'src/stranger.ts',
        dependencies: ['elements/helper', 'elements/second'],
      },
      repoRoot: root,
      resolveTargetPath: (ref) =>
        ref === 'elements/second' ? 'src/lib/helper.ts' : resolveTargetPath(ref),
    });
    assert.deepEqual(findings.map((row) => row.key).sort(), ['elements/helper', 'elements/second']);
  });

  /*
   * A witness is an import, not a word: "camera" inside hook names must not clear
   * an edge. The closing `} from '…'` line of a multi-line import carries the
   * path and does not begin with `import`.
   */
  it('a bare word does not witness; an import does, even split across lines', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(
      join(root, 'src', 'mention.ts'),
      'export const useHelperCamera = () => "helper is a word here, not a module";\n',
    );
    writeFileSync(
      join(root, 'src', 'multiline.ts'),
      "import {\n  helper,\n} from './lib/helper';\n\nexport const used = helper();\n",
    );
    const finding = (path) =>
      dependencyWitnessFinding({
        slug: 'capabilities/edge',
        frontmatter: { path, dependencies: ['elements/helper'] },
        repoRoot: root,
        resolveTargetPath,
      });
    assert.equal(finding('src/mention.ts').length, 1, 'a word in an identifier is not a witness');
    assert.deepEqual(finding('src/multiline.ts'), [], 'a multi-line import is one');
  });

  /*
   * Rust's `use crate::export::…` names the folder of a `mod.rs`, and
   * `use super::{relative_speed, Benchmark}` hides the module inside braces.
   */
  it('Rust module paths witness the mod.rs they reach, braces included', (t) => {
    const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-dependency-witness-rust-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'src', 'export'), { recursive: true });
    mkdirSync(join(root, 'src', 'benchmark'), { recursive: true });
    writeFileSync(join(root, 'src', 'export', 'mod.rs'), 'pub struct ExportManager;\n');
    writeFileSync(join(root, 'src', 'benchmark', 'relative_speed.rs'), 'pub fn compute() {}\n');
    writeFileSync(
      join(root, 'src', 'benchmark', 'scheduler.rs'),
      'use super::{relative_speed, Benchmark};\nuse crate::export::{\n    ExportManager,\n};\n',
    );
    const targets = {
      'capabilities/export': 'src/export/mod.rs',
      'capabilities/speed': 'src/benchmark/relative_speed.rs',
    };
    assert.deepEqual(
      dependencyWitnessFinding({
        slug: 'capabilities/scheduling',
        frontmatter: {
          path: 'src/benchmark/scheduler.rs',
          dependencies: ['capabilities/export', 'capabilities/speed'],
        },
        repoRoot: root,
        resolveTargetPath: (ref) => targets[ref] ?? null,
      }),
      [],
    );
  });

  /*
   * A line range `lib/barrel.ts:3-9` and an editor's `#L3-L9` are the same address.
   */
  it('a `why` witness carrying a line range still resolves', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const suffix of [':1-3', ':1\u20133', '#L1-L3', '#L1']) {
      assert.deepEqual(
        dependencyWitnessFinding({
          slug: 'capabilities/stranger',
          frontmatter: {
            path: 'src/stranger.ts',
            dependencies: ['elements/helper'],
            relation_notes: { 'elements/helper': `re-exported from \`src/lib/barrel.ts${suffix}\`.` },
          },
          repoRoot: root,
          resolveTargetPath,
        }),
        [],
        suffix,
      );
    }
  });
});

/**
 * The `init` starters a vault has outgrown. The silent half keeps it honest: a new
 * vault is nothing but starters, and scolding a person for the file the product
 * just wrote is worse than silence.
 */
describe('starter-example-node — the scaffold left standing', () => {
  const STARTERS = [
    { slug: 'domains/example-domain', kind: 'domain', title: 'Example domain' },
    { slug: 'capabilities/example-capability', kind: 'capability', title: 'Example capability' },
    { slug: 'elements/example-element', kind: 'element', title: 'Example element' },
  ];

  it('fires on the starter once a real node of the same kind exists', () => {
    const findings = starterExampleFindings([
      ...STARTERS,
      { slug: 'domains/billing', kind: 'domain', title: 'Billing' },
    ]);
    // No real capability or element yet, so those two starters are still instructions.
    assert.deepEqual(findings.map((row) => row.slug), ['domains/example-domain']);
    const [finding] = findings;
    assert.equal(finding.code, 'starter-example-node');
    assert.deepEqual(finding.refs, ['domains/billing']);
    assert.match(finding.message, /domains\/billing/);
    assert.match(finding.message, /delete_concept/);
    assert.match(finding.message, /rename_concept/);
    // The repair names the kind's own folder, not the kind plus an `s`.
    assert.match(finding.message, /newSlug:"domains\/<real-name>"/);
  });

  it('the rename hint uses the kind folder, which is not the kind plus an s', () => {
    const [finding] = starterExampleFindings([
      { slug: 'capabilities/example-capability', kind: 'capability', title: 'Example capability' },
      { slug: 'capabilities/charge-card', kind: 'capability', title: 'Charge a card' },
    ]);
    assert.match(finding.message, /newSlug:"capabilities\/<real-name>"/);
    assert.equal(/capabilitys/.test(finding.message), false);
  });

  /*
   * A vault straight out of `init`: every node is a starter, and the CLI's init
   * integration cases stay clean because of this branch.
   */
  it('stays silent in a vault that holds only the three starters', () => {
    assert.deepEqual(starterExampleFindings(STARTERS), []);
  });

  it('names all three once the vault holds a real node of each kind', () => {
    const findings = starterExampleFindings([
      ...STARTERS,
      { slug: 'domains/billing', kind: 'domain', title: 'Billing' },
      { slug: 'capabilities/charge-card', kind: 'capability', title: 'Charge a card' },
      { slug: 'elements/stripe-client', kind: 'element', title: 'Stripe client' },
    ]);
    assert.deepEqual(findings.map((row) => row.slug), [
      'capabilities/example-capability',
      'domains/example-domain',
      'elements/example-element',
    ]);
  });

  it('stays silent once the example was renamed into a real address', () => {
    assert.deepEqual(
      starterExampleFindings([
        { slug: 'domains/billing', kind: 'domain', title: 'Billing' },
        { slug: 'domains/identity', kind: 'domain', title: 'Identity' },
      ]),
      [],
    );
  });

  /*
   * A copied starter needs both the `example-` address and the "Example" title;
   * neither alone may accuse a real node, and a real node about examples named
   * both ways is an accepted false positive.
   */
  it('reads a copied starter, and needs both the address and the title to do it', () => {
    assert.equal(
      isStarterExampleNode({ slug: 'domains/example-thing', kind: 'domain', title: 'Example thing' }),
      true,
      'a copied scaffold keeps both halves',
    );
    assert.equal(
      isStarterExampleNode({ slug: 'domains/rendering', kind: 'domain', title: 'Example Rendering' }),
      false,
      'a title alone is not an address',
    );
    assert.equal(
      isStarterExampleNode({ slug: 'domains/example-rendering', kind: 'domain', title: 'Rendering' }),
      false,
      'an address alone is not a scaffold',
    );
    // Template addresses need no title: builders edit the scaffold's `title:` first.
    assert.equal(
      isStarterExampleNode({ slug: 'elements/example-element', kind: 'element', title: 'Retry policy' }),
      true,
    );
  });

  /*
   * An edited starter body is still a starter address; only whether the message
   * says "untouched" changes.
   */
  it('still fires when the body was rewritten, and says so only when it was not', () => {
    const untouched = starterExampleFindings([
      { ...STARTERS[0], body: '# Example domain\n\n- Nothing here has been checked against your code yet: this file is a starter, not an observation.\n\n## How to fill it in\n' },
      { slug: 'domains/billing', kind: 'domain', title: 'Billing' },
    ]);
    const rewritten = starterExampleFindings([
      { ...STARTERS[0], body: '# Example domain\n\nA real sentence somebody wrote about this area.\n' },
      { slug: 'domains/billing', kind: 'domain', title: 'Billing' },
    ]);
    assert.equal(untouched.length, 1);
    assert.equal(rewritten.length, 1);
    assert.match(untouched[0].message, /still the starter's own explanation/);
    assert.equal(/still the starter's own explanation/.test(rewritten[0].message), false);
  });

  /**
   * Needs neither bodies nor a repository root, so it must answer a plain
   * maintenance_plan over a compiled artifact with no `sourceDocs`.
   */
  it('queues as `retire_starter_example` on the read path with no bodies loaded', () => {
    const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const docs = [
      { slug: 'domains/example-domain', frontmatter: { uid: uid(1), kind: 'domain', title: 'Example domain' }, body: '', mtime: 1 },
      { slug: 'domains/billing', frontmatter: { uid: uid(2), kind: 'domain', title: 'Billing' }, body: '', mtime: 1 },
    ];
    const plan = queryCompiledOntology(compileOntology(docs), {
      operation: 'maintenance_plan',
      limit: 50,
    });
    const rows = plan.actions.filter((action) => action.kind === 'retire_starter_example');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].node.slug, 'domains/example-domain');
    assert.equal(rows[0].phase, 'review');
    assert.equal(rows[0].severity, 'info');
    // Never executable: the repair deletes somebody's file.
    assert.equal(rows[0].proposedAction, undefined);
  });
});
