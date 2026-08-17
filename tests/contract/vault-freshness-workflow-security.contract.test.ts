import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const WORKFLOW = readFileSync('.github/workflows/vault-freshness.yml', 'utf8');

function runBodies(source: string): string[] {
  const lines = source.split('\n');
  const bodies: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index].match(/^ {8}run:\s*(.*)$/);
    if (!start) continue;
    const body = [start[1]];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      if (next.trim() && !/^ {10,}/.test(next)) break;
      body.push(next);
      index += 1;
    }
    bodies.push(body.join('\n'));
  }
  return bodies;
}

describe('vault freshness reusable workflow security', () => {
  it('passes caller-controlled inputs through the environment, never through shell source', () => {
    expect(WORKFLOW).toContain("VAULT_DIR: ${{ inputs.vault-dir || 'docs/ontology' }}");
    expect(runBodies(WORKFLOW).length).toBeGreaterThan(0);
    expect(runBodies(WORKFLOW).join('\n')).not.toContain('${{');
    expect(WORKFLOW).toContain('node scripts/validate-vault.mjs "$VAULT_DIR"');
    expect(WORKFLOW).toContain('--vault "$VAULT_DIR"');
  });

  it('does not leave the workflow token in Git configuration for PR-controlled scripts', () => {
    expect(WORKFLOW).toMatch(
      /uses: actions\/checkout@[a-f0-9]{40}[\s\S]*?with:\n\s+fetch-depth: 0\n\s+persist-credentials: false/,
    );
  });
});
