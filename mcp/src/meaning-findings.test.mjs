/**
 * Meaning findings — one firing case and one silent case per code.
 *
 * The silent half is the load-bearing half. A body check that flags a node
 * somebody actually wrote is a check the reader turns off, and then the door is
 * open again; every code below therefore has to prove it stays quiet on a body
 * that answered the question.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
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
   * The shape the qualification lane actually writes, measured 2026-09-21:
   * nothing above the first `##`, the definition under `## Definition`. The
   * first version of this check read only the lead and accused 15 of 16 nodes
   * in a freshly built vault and 72 of 109 in this repository's own — every one
   * of them defined. A check that is wrong on its debut is one the reader
   * switches off, and then the door is open again.
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
   * The review falsifier, and a fair one: length alone cannot tell a terse
   * definition from the title with grammar wrapped around it. Construction
   * rule 3a asks for a *non-circular* sentence, so the check counts the words
   * the title does not already supply.
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
    // A slot is not an answer. Letting the template satisfy this would mean the
    // default write silences the one question the default write cannot answer.
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
   * Written by a real builder against a real repository, 2026-09-21. All three
   * say what the writer did not get to, and all three sat under `## Excludes`
   * on a project node — the one place a reader handed the vault without the
   * source cannot check the claim, and does repeat it as an established fact.
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
    // Both of these sit under `## Excludes` beside the three above and are
    // genuine: they say what the product does not do, not what nobody read.
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
   * A vault is ordinary Markdown an agent writes, so `path:` is untrusted
   * input. Rejecting an absolute path was not enough — `../` resolves out of
   * the tree just as well, and the two things this check does next are read a
   * directory and put one of its filenames into a tool response.
   */
  it('refuses to leave the repository through `../`, so nothing outside it is listed', (t) => {
    const root = repo();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    // A real directory beside the repository, holding a filename that must not
    // appear anywhere in a response.
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
    // Positive control: the same call one directory in still fires, so the null
    // above is the clamp and not a typo in the fixture.
    assert.ok(
      folderOnlyEvidenceFinding({
        kind: 'capability',
        slug: 'capabilities/inside',
        frontmatter: { path: 'mcp/src' },
        repoRoot: root,
      }),
    );
    // A `../` that climbs and comes back is inside, and is still judged.
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
    // A path that is not on disk is `validate_vault`'s pathDrift answer; saying
    // it twice is what teaches a reader to skim the channel.
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
 * A declared dependency the citing file never mentions.
 *
 * Measured 2026-09-22 on this repository's own vault: 70 of 85 file-to-file
 * `depends_on` edges are witnessed by the citing file naming the cited one, and
 * 15 are not. The silent half of this block is the load-bearing half twice over.
 * Once for the usual reason — a check that accuses a witnessed edge is a check
 * somebody turns off. And once for a reason peculiar to this code: the absence
 * of an import is not proof of independence, so every input this cannot be sure
 * about has to produce silence rather than a guess.
 */
describe('dependency-unwitnessed — the file cited does not name the file depended on', () => {
  /**
   * Two source files, and the deliberate asymmetry between them: `consumer.ts`
   * imports the helper by name, `stranger.ts` does not mention it at all.
   */
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
     * The one file that proves the path branch is load-bearing. For an ordinary
     * name the two spellings collapse: `src/lib/helper.ts` *contains*
     * `helper` delimited by `/` and `.`, so the whole-word rule alone already
     * sees it. A dotfile has no basename left once the extension rule runs, and
     * a config file is exactly the kind of dependency the message says an import
     * would never witness.
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
    // The target rides in `key`, so the gate's own notice key is per edge.
    assert.equal(finding.key, 'elements/helper');
    assert.deepEqual(finding.refs, ['elements/helper']);
    assert.match(finding.message, /src\/stranger\.ts/);
    assert.match(finding.message, /src\/lib\/helper\.ts/);
    // An import is evidence; its absence is not proof of independence, so the
    // sentence must offer the witness before it offers the deletion.
    assert.match(finding.message, /not.*proof of independence/);
    assert.match(finding.message, /replace_relation/);
    assert.match(finding.message, /remove_relation/);
  });

  /**
   * The witness the message asks for, read where the message says to put it.
   *
   * Corrected 2026-09-22. The first version told the writer to name the file and
   * the line in the `why`, then read only the source node's own `path:` — so a
   * repair turn that gave twelve edges an exact witness cleared none of them.
   * These four cases pin the rule that replaced it: the `why`'s file paths are
   * candidates, and they are candidates on the same terms as any other file.
   */
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
   * Measured on this repository's own vault: five of twelve repaired edges named
   * a real witness file by a path relative to `src/` or to the module's own
   * folder. Nothing resolves that from the repository root, and guessing which
   * file was meant is how an advisory starts accusing the wrong one — so the
   * finding stands and the message says "repository-relative" out loud.
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
    // The barrel named the way an editor shows it from src/ (no root segment)
    // resolves from the citing file's ancestor and clears the finding: the
    // first repair turn wrote every witness that way and cleared nothing.
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
    // The same sentence with the root on it clears it too.
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
   * A `why` is an English sentence, and a word in it is not a file to open. The
   * fixture makes that bite: `notes` really is a readable file at the fixture
   * root, and it really does name the target — so a rule that treated every
   * whitespace token as a path would clear this edge on the strength of a word
   * in a sentence. A separator AND an extension are both required.
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
   * A `why` is a sentence somebody wrote, so its paths are untrusted input on
   * exactly the same terms as `path:` — the clamp is what stops a rationale
   * from making this check open an arbitrary file on the machine.
   */
  it('a `why` naming a path outside the repository is ignored', (t) => {
    const root = repoWithSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const outside = join(root, '..', `outside-${randomUUID()}`);
    mkdirSync(outside, { recursive: true });
    // The escaping file WOULD witness the edge if it were ever read.
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
    // Positive control on the same pair: a file that does not name the config
    // still fires, so the silence above is the path spelling and not the
    // dotfile being exempt.
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
   * A folder has no text to read, so asking whether it mentions anything has no
   * answer. `folder-only-evidence` already tells this node what to do about the
   * same `path:`, and saying it twice under two codes trains a reader to skim.
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
   * `path:` is a value an agent wrote, so both ends are untrusted input. An
   * escaping target must not cause a file outside the repository to be opened,
   * named, or judged.
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
    // Positive control, so the empty array above is the clamp and not a typo.
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
   * `depends_on:` is a legal authoring alias for `dependencies:`. Reading only
   * the canonical key would judge an `add_relation` edge and say nothing about a
   * hand-written one, which is the same vault answered two ways.
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
   * Omitting `previousFrontmatter` is how the whole-vault passes ask the same
   * question at a different moment: the write door judges what a write added,
   * a validator somebody chose to run judges everything.
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
   * The decision's falsifier, met on this repository's own vault on
   * 2026-09-23: a frame loop that never imports the camera module still
   * cleared its edge because the word "camera" sat inside hook names. A
   * witness is an import, not a word. The multi-line import is the shape
   * three of the twelve first-round edges actually had — the closing
   * `} from '…'` line carries the path and does not begin with `import`.
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
   * Measured on a Rust trial vault (2026-09-23): every edge into a `mod.rs`
   * was unwitnessed because `use crate::export::…` names the folder, and
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
   * The first repair turn on this vault wrote one witness as a line range,
   * `lib/barrel.ts:3-9`, and the check dropped the token because only `:42`
   * and `:42:7` were stripped. An editor's `#L3-L9` is the same address.
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
 * The `init` starter examples, once the vault has outgrown them.
 *
 * Measured 2026-09-22 on two unfamiliar repositories: both builders wrote a real
 * map through the first-run door and left all three scaffold nodes standing,
 * wired only to each other, with "Example domain" on the map beside the real
 * domains. The silent half here is the half that keeps the check honest — a
 * brand-new vault is *nothing but* starters, and a product that scolds a person
 * for the file it just wrote them is worse than one that says nothing.
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
    // Only the domain: no real capability or element has arrived yet, so those
    // two starters are still the instructions.
    assert.deepEqual(findings.map((row) => row.slug), ['domains/example-domain']);
    const [finding] = findings;
    assert.equal(finding.code, 'starter-example-node');
    assert.deepEqual(finding.refs, ['domains/billing']);
    assert.match(finding.message, /domains\/billing/);
    assert.match(finding.message, /delete_concept/);
    assert.match(finding.message, /rename_concept/);
    // The repair names the kind's own folder, not the kind with an `s` glued on.
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
   * A vault straight out of `init`. Every node in it is a starter, which is the
   * product's own doing — nothing here is wrong yet, and `pnpm --dir cli test`
   * plus the init integration cases stay clean because of this branch.
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
   * The generalized shape: somebody copied the starter instead of renaming it.
   * Both halves are required, and these cases pin which half does what. Neither
   * half alone is allowed to accuse a real node, and the residual overlap — a
   * real node about examples, named "Example …", addressed `example-…` — is
   * accepted rather than papered over.
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
    // The three template addresses are recognised without any title at all: the
    // scaffold's own `title:` is what a builder most often edits first.
    assert.equal(
      isStarterExampleNode({ slug: 'elements/example-element', kind: 'element', title: 'Retry policy' }),
      true,
    );
  });

  /*
   * A starter somebody rewrote the prose of is still a starter address on the
   * map. Letting an edited body clear the check would reward exactly the
   * half-finished state this exists to name — what changes is only whether the
   * message says the body is untouched.
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
   * The read path. This is the one meaning question that needs neither a body
   * nor a repository root, so unlike its four neighbours it must answer on a
   * plain `maintenance_plan` call over a compiled artifact with no `sourceDocs`
   * at all — which is precisely the state the measured vaults were in.
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
