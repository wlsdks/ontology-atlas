/**
 * Keeps the summary-freshness bridge wired. It is not a degraded surface: nothing is offered or
 * withdrawn, and the same signal reaches web users through `validate_vault.summaryFreshness`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8');
}

describe('summary freshness bridge', () => {
  it('exposes the Rust command the app reads history through', () => {
    const history = read('src-tauri/src/git/history.rs');
    expect(history, 'the vault_node_revisions command is gone — the app can never see staleness').toContain(
      'pub fn vault_node_revisions',
    );
    expect(
      history,
      'the per-node revision cap is gone; one screen paint could spawn unbounded git processes',
    ).toContain('MAX_FRESHNESS_SLUGS');
    expect(
      history,
      'the slug traversal guard is gone — a slug reaches a `git show` argument and must not be able to climb out of the vault',
    ).toMatch(/contains\("\.\."\)/);
  });

  it('registers that command, without which the app calls into nothing', () => {
    const lib = read('src-tauri/src/lib.rs');
    expect(lib, 'vault_node_revisions is not in the invoke handler').toContain(
      'git::history::vault_node_revisions',
    );
    expect(lib).toContain('git::history::vault_node_revision_content');
  });

  it('keeps the client calling the command by the name Rust exports', () => {
    const hook = read('src/entities/vault-session/model/use-summary-freshness.ts');
    const bridge = read('src/shared/lib/git/tauri-git.ts');
    expect(bridge, 'the invoke name drifted from the Rust command name').toContain(
      "'vault_node_revisions'",
    );
    expect(bridge).toContain("'vault_node_revision_content'");
    expect(
      hook,
      'the runtime guard is gone — the browser would attempt a Tauri invoke that cannot exist',
    ).toContain('isTauriVaultRuntime');
  });

  it('keeps the judgement in the shared module rather than a second copy', () => {
    const hook = read('src/entities/vault-session/model/use-summary-freshness.ts');
    expect(
      hook,
      'the hook stopped delegating to the entity module; the rule now exists in a third place',
    ).toContain('createSummaryStalenessScan');
    // The client/server parity contract only protects the two copies it knows about.
    expect(read('tests/contract/analysis/summary-freshness-parity.contract.test.ts')).toContain(
      'summaryStalenessOf',
    );
  });

  it('mounts the row only with a real verdict, so absence never reads as a clean bill', () => {
    const panel = read('src/widgets/ontology-map/ui/OntologyMapDetailPanel.tsx');
    expect(panel, 'the freshness row is no longer gated on a verdict').toMatch(
      /summaryStaleness &&[\s\S]{0,200}<SummaryFreshnessRow/,
    );
  });
});
