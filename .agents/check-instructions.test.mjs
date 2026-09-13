import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { partitionFindings, inspectTree } from './check-instructions.mjs';

test('permits independent harness resources without suppressing integrity failures', () => {
  const findings = [
    { check: 'skill-copy', code: 'skill-copy-diverged', path: 'example/SKILL.md' },
    { check: 'skill-copy', code: 'skill-copy-file-missing', path: 'example/guides/phase.md' },
    { check: 'agent-copy', code: 'agent-copy-diverged', path: 'reviewer.md' },
    { check: 'skill-copy', code: 'skill-copy-file-missing', path: 'example/SKILL.md' },
    { check: 'skill-copy', code: 'skill-copy-diverged', path: 'example/scripts/run.mjs' },
    { check: 'agent-copy', code: 'agent-copy-file-missing', path: 'reviewer.md' },
    { check: 'at-refs', code: 'missing-at-ref', path: 'example/SKILL.md' },
    { check: 'agent-language', code: 'non-english', path: 'reviewer.md' },
    { check: 'codex-size-cap', code: 'oversized', path: 'AGENTS.md' },
    { check: 'mcp-grants', code: 'undeclared-mcp-server', path: 'reviewer.md' },
    { check: 'skill-copy', code: 'new-unknown-failure', path: 'example/SKILL.md' },
  ];
  const result = partitionFindings(findings);
  assert.deepEqual(result.expected, findings.slice(0, 6));
  assert.deepEqual(result.failures, findings.slice(6));
});

test('checks actual discovery and references, including newly added phase documents', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-instruction-'));
  const put = (path, text) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  try {
    assert.match(inspectTree(root, '.agents').failures.join('\n'), /empty/);
    put('.agents/skills/example/SKILL.md', '---\nname: example\ndescription: Build the requested fixture.\n---\n[Phase](guides/phase.md)\n');
    put('.agents/agents/reviewer.md', '---\nname: reviewer\ndescription: Review the fixture.\naccess: read-only\n---\n');
    assert.match(inspectTree(root, '.agents').failures.join('\n'), /guides\/phase.md/);
    put('.agents/skills/example/guides/phase.md', '[Missing](missing.md)\n');
    assert.match(inspectTree(root, '.agents').failures.join('\n'), /missing.md/);
    put('.agents/skills/example/guides/phase.md', 'Complete the phase.\n');
    assert.deepEqual(inspectTree(root, '.agents').failures, []);
    put('.agents/agents/reviewer.md', '---\nname: wrong\ndescription: Review.\naccess: read-only\n---\n');
    assert.match(inspectTree(root, '.agents').failures.join('\n'), /identity/);
    put('.agents/agents/reviewer.md', '---\nname: reviewer\ndescription: Review.\nmodel: opus\naccess: read-only\n---\n');
    assert.match(inspectTree(root, '.agents').failures.join('\n'), /host/);
    put('.agents/agents/reviewer.md', '---\nname: reviewer\ndescription: Review.\naccess: unrestricted\n---\n');
    assert.match(inspectTree(root, '.agents').failures.join('\n'), /access/);
    put('.agents/skills/example/SKILL.md', 'No frontmatter.\n');
    assert.match(inspectTree(root, '.agents').failures.join('\n'), /metadata/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
