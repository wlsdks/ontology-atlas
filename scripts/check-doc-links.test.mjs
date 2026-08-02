#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import {
  collectMarkdownLinks,
  collectProseDocRefs,
  isExternalTarget,
  isHistoricalDoc,
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
    // 실측 사고: 스토리보드 문서가 ```markdown 펜스 안에서 아직 만들지 않은
    // gif 를 예시로 임베드하고 있었다. 펜스를 안 벗기면 그게 위반이 된다.
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
    assert.equal(isHistoricalDoc('docs/archive/DATA-MODEL.md'), true);
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

describe('walker and CLI', () => {
  it('skips dependency and build directories at any depth', () => {
    withRepo(
      {
        'docs/a.md': '# a',
        'node_modules/pkg/README.md': '# dep',
        'mcp/node_modules/pkg/README.md': '# nested dep',
        'out/index.md': '# build output',
      },
      (root) => {
        assert.deepEqual(
          listMarkdownFiles(root).map((file) => file.slice(root.length + 1)),
          ['docs/a.md'],
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
