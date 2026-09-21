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
  epistemicExclusionFinding,
  folderOnlyEvidenceFinding,
  meaningFindings,
} from './meaning-findings.mjs';

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
    assert.deepEqual(codes(findings), ['boundary-missing', 'boundary-missing', 'definition-missing']);
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
