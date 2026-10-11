#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import {
  collectAnchors,
  collectHtmlLinks,
  collectMarkdownLinks,
  collectProseDocRefs,
  headingAnchorSlug,
  isExternalTarget,
  isHistoricalDoc,
  linkFragment,
  stripFencedBlocks,
} from './lib/doc-links.mjs';
import { checkFile, listMarkdownFiles, parseArgs, resolveLinkTarget, usage } from './check-doc-links.mjs';

function withRepo(files, fn) {
  const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-doc-links-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      const full = join(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('markdown link extraction', () => {
  it('ignores links written inside fenced code blocks', () => {
    // A document embedding a not-yet-created gif inside a ```markdown fence must not read as a
    // violation, so fences are stripped.
    const markdown = ['[real](./a.md)', '```markdown', '[example](./nope.md)', '```', '[after](./b.md)'].join('\n');

    assert.deepEqual(
      collectMarkdownLinks(markdown).map((link) => link.target),
      ['./a.md', './b.md'],
    );
    assert.equal(stripFencedBlocks(markdown)[2], '');
  });

  it('ignores link syntax quoted as inline code', () => {
    assert.deepEqual(collectMarkdownLinks('write it as `[text](path.md)` in prose'), []);
  });

  it('records the line number so the report points at the defect', () => {
    assert.deepEqual(collectMarkdownLinks('x\n\n[a](./b.md)'), [{ line: 3, target: './b.md' }]);
  });

  it('treats protocol and protocol-relative targets as external', () => {
    assert.equal(isExternalTarget('https://example.com'), true);
    assert.equal(isExternalTarget('mailto:a@b.c'), true);
    assert.equal(isExternalTarget('//cdn.example.com/x'), true);
    assert.equal(isExternalTarget('./local.md'), false);
  });
});

describe('prose path citations', () => {
  it('only claims repo-anchored or explicitly relative `.md` paths', () => {
    const markdown = [
      'see `docs/ARCHITECTURE.md` and `../README.md`',
      'the vault holds `capabilities/login.md`',
      'a glob like `src/**/*.md` is not a citation',
    ].join('\n');

    assert.deepEqual(
      collectProseDocRefs(markdown).map((ref) => ref.target),
      ['docs/ARCHITECTURE.md', '../README.md'],
    );
  });

  it('marks `./` and `../` citations as file-relative', () => {
    const [repoAnchored, fileRelative] = collectProseDocRefs('`docs/a.md` `../b.md`');

    assert.equal(repoAnchored.relative, false);
    assert.equal(fileRelative.relative, true);
  });

  it('exempts the append-only historical record, where naming a deleted file is the point', () => {
    assert.equal(isHistoricalDoc('docs/CHANGELOG.md'), true);
    assert.equal(isHistoricalDoc('mcp/CHANGELOG.md'), true);
    assert.equal(isHistoricalDoc('docs/DECISIONS.md'), true);
    assert.equal(isHistoricalDoc('docs/archive/SIGMA-PLAYBOOK.md'), true);
    assert.equal(isHistoricalDoc('docs/audits/X.md'), true);
    assert.equal(isHistoricalDoc('docs/FEATURES.md'), false);
    assert.equal(isHistoricalDoc('AGENTS.md'), false);
  });
});

describe('link resolution', () => {
  it('resolves a root-absolute link as a docs-vault slug before a repo path', () => {
    withRepo({ 'docs/guide/cli.md': '# cli', 'docs/guide/relations.md': '# rel' }, (root) => {
      const from = join(root, 'docs/guide/relations.md');

      assert.equal(resolveLinkTarget(from, '/guide/cli', root), join(root, 'docs/guide/cli.md'));
      assert.equal(resolveLinkTarget(from, '/nope', root), join(root, 'nope'));
    });
  });

  it('drops the anchor before resolving and skips same-document anchors', () => {
    withRepo({ 'a.md': '# a', 'b.md': '# b' }, (root) => {
      const from = join(root, 'a.md');

      assert.equal(resolveLinkTarget(from, './b.md#section', root), join(root, 'b.md'));
      assert.equal(resolveLinkTarget(from, '#section', root), null);
    });
  });
});

describe('checkFile', () => {
  it('reports a broken link and a broken citation, and stays quiet when both resolve', () => {
    withRepo(
      {
        'docs/FEATURES.md': '[gone](./missing.md)\n\nsee `docs/ARCHITECTURE.md`\n',
        'docs/ok.md': '[here](./FEATURES.md)\n\nsee `docs/FEATURES.md`\n',
      },
      (root) => {
        const problems = checkFile(join(root, 'docs/FEATURES.md'), { root });

        assert.deepEqual(
          problems.map((problem) => [problem.kind, problem.target]),
          [
            ['link', './missing.md'],
            ['cited path', 'docs/ARCHITECTURE.md'],
          ],
        );
        assert.deepEqual(checkFile(join(root, 'docs/ok.md'), { root }), []);
      },
    );
  });

  it('still checks links in historical docs — a dead link is dead wherever it lives', () => {
    withRepo({ 'docs/CHANGELOG.md': '[gone](./missing.md) and `docs/deleted.md`\n' }, (root) => {
      const problems = checkFile(join(root, 'docs/CHANGELOG.md'), { root });

      assert.deepEqual(
        problems.map((problem) => problem.kind),
        ['link'],
      );
    });
  });

  it('reports missing local HTML image sources and srcset candidates', () => {
    withRepo(
      {
        'README.md': [
          '<picture>',
          '  <source srcset="public/brand/missing-dark.svg 2x" />',
          '  <img src="public/brand/missing-light.svg" alt="Brand" />',
          '</picture>',
          '<img src="https://example.com/remote.svg" alt="Remote" />',
        ].join('\n'),
      },
      (root) => {
        const problems = checkFile(join(root, 'README.md'), { root });

        assert.deepEqual(
          problems.map((problem) => [problem.kind, problem.target]),
          [
            ['asset', 'public/brand/missing-dark.svg'],
            ['asset', 'public/brand/missing-light.svg'],
          ],
        );
      },
    );
  });
});


describe('heading anchors', () => {
  /**
   * Every expectation here was read off GitHub's own rendered `id=` for the same
   * heading, not derived from the rule. The rule this replaced collapsed runs of
   * whitespace and dropped `_`, which is why `docs/DESIGN-SYSTEM.md` shipped 13
   * table-of-contents links that resolved nowhere.
   */
  it('matches the ids GitHub renders, including the double hyphen an em dash leaves', () => {
    assert.equal(headingAnchorSlug('Library index — readable page titles'), 'library-index--readable-page-titles');
    assert.equal(headingAnchorSlug('Topology node focus & scale (ego popover)'), 'topology-node-focus--scale-ego-popover');
    assert.equal(headingAnchorSlug('Trailing spaces   collapse?'), 'trailing-spaces---collapse');
  });

  it('keeps `_` and strips backticks, emphasis and apostrophes the way GitHub does', () => {
    assert.equal(headingAnchorSlug('2.2 Direct `is_a` / `broader` test'), '22-direct-is_a--broader-test');
    assert.equal(headingAnchorSlug('snake_case and ~strike~ and **bold** text'), 'snake_case-and-strike-and-bold-text');
    assert.equal(headingAnchorSlug("Absolute rules (Don'ts)"), 'absolute-rules-donts');
  });

  it('keeps Hangul, because these documents have Korean headings', () => {
    assert.equal(headingAnchorSlug('한글 제목 — 대시 포함'), '한글-제목--대시-포함');
  });

  it('suffixes a repeated heading the way GitHub disambiguates it', () => {
    assert.deepEqual([...collectAnchors('## Same\n## Same\n## Same')], ['same', 'same-1', 'same-2']);
  });

  it('collects explicit ids and ignores headings inside fences', () => {
    const markdown = ['## Real', '```md', '## Fenced', '```', '<a name="Hand-Written"></a>'].join('\n');
    const anchors = collectAnchors(markdown);
    assert.equal(anchors.has('real'), true);
    assert.equal(anchors.has('fenced'), false);
    assert.equal(anchors.has('hand-written'), true);
  });

  it('reads the fragment of a target, decoded, and nothing when there is none', () => {
    assert.equal(linkFragment('cli/README.md#set-up-from-a-source-checkout'), 'set-up-from-a-source-checkout');
    assert.equal(linkFragment('#%ED%95%9C%EA%B8%80'), '한글');
    assert.equal(linkFragment('./plain.md'), null);
    assert.equal(linkFragment('./trailing.md#'), null);
  });

  it('finds anchors in raw HTML hrefs, which is how the README nav row is written', () => {
    assert.deepEqual(collectHtmlLinks('<a href="#status--read-this-before-installing">Status</a>'), [
      { line: 1, target: '#status--read-this-before-installing' },
    ]);
  });
});

describe('checkFile anchors', () => {
  it('reports a renamed section on the target side, which a file-existence check cannot see', () => {
    withRepo({
      'docs/a.md': '[jump](./b.md#gone) and [ok](./b.md#kept)',
      'docs/b.md': '## Kept',
    }, (root) => {
      const problems = checkFile(join(root, 'docs/a.md'), { root });
      assert.deepEqual(problems.map((problem) => [problem.kind, problem.target]), [['anchor', './b.md#gone']]);
    });
  });

  it('checks same-document anchors and raw HTML hrefs too', () => {
    withRepo({
      'docs/a.md': ['# Title', '[here](#title)', '[nowhere](#missing)', '<a href="#title">x</a>', '<a href="#gone">y</a>'].join('\n'),
    }, (root) => {
      const problems = checkFile(join(root, 'docs/a.md'), { root });
      assert.deepEqual(problems.map((problem) => problem.target), ['#missing', '#gone']);
    });
  });

  it('reports a missing file once, without a second anchor complaint about it', () => {
    withRepo({ 'docs/a.md': '[x](./missing.md#section)' }, (root) => {
      const problems = checkFile(join(root, 'docs/a.md'), { root });
      assert.deepEqual(problems.map((problem) => problem.kind), ['link']);
    });
  });

  it('leaves a fragment on a non-markdown target alone', () => {
    withRepo({ 'docs/a.md': '[x](../src/thing.ts#L12)', 'src/thing.ts': 'export const thing = 1;\n' }, (root) => {
      assert.deepEqual(checkFile(join(root, 'docs/a.md'), { root }), []);
    });
  });
});

describe('walker and CLI', () => {
  it('skips dependency and build directories at any depth while scanning committed Claude rules', () => {
    withRepo(
      {
        'docs/a.md': '# a',
        'node_modules/pkg/README.md': '# dep',
        'mcp/node_modules/pkg/README.md': '# nested dep',
        'out/index.md': '# build output',
        '.claude/rules/current.md': '# current rule',
      },
      (root) => {
        assert.deepEqual(
          listMarkdownFiles(root).map((file) => file.slice(root.length + 1)),
          ['.claude/rules/current.md', 'docs/a.md'],
        );
      },
    );
  });

  it('keeps external URL checks opt-in so a third-party outage never reds this gate', () => {
    assert.equal(parseArgs([]).external, false);
    assert.equal(parseArgs(['--external']).external, true);
    assert.match(parseArgs(['--nope']).error, /unknown argument/);
    assert.match(usage(), /--external/);
  });
});
