/**
 * Keeps the summary-freshness bridge wired, and records why it is not a degraded surface.
 *
 * The app answers "has this domain's description fallen behind what it holds?" by reading
 * Git history through the `vault_node_revisions` command. Nothing in `DEGRADED_SURFACES`
 * protects it, and nothing in the UI would look wrong if it silently stopped: the row
 * simply never appears, which is indistinguishable from "every domain is current". A
 * capability whose failure mode is invisible needs a gate that watches the wiring itself.
 *
 * ## Why not `DEGRADED_SURFACES`
 *
 * Every row in that registry is a place where the browser is asked to do something and
 * must explain why it cannot, with `/download/` as the destination. This is not that.
 * Nothing is offered here and nothing is withdrawn — the row is a passive advisory that
 * renders when there is something to say, exactly as it does in the app when a vault is
 * current. `surfaces.md` permits "removes the action", and there is no action to remove:
 * no button goes dead, and no sentence claims the vault was checked.
 *
 * It would also be the wrong claim. The signal is not app-only: a web user with a coding
 * agent reaches the same verdict through `validate_vault.summaryFreshness` and the
 * `rejudge_summary_membership` maintenance action, because MCP attaches to the folder
 * rather than to the Atlas screen. A card saying "you cannot see this on the web" would
 * understate the capability, which `surfaces.md` calls the opposite but equal lie.
 *
 * What the web genuinely loses is the map's *confirm on arrival* affordance. That is a
 * screen-level difference the surface contract already permits: the two surfaces share a
 * folder and a parser, not identical screens.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8');
}

describe('summary freshness bridge', () => {
  it('exposes the Rust command the app reads history through', () => {
    const git = read('src-tauri/src/git.rs');
    expect(git, 'the vault_node_revisions command is gone — the app can never see staleness').toContain(
      'pub fn vault_node_revisions',
    );
    expect(
      git,
      'the per-node revision cap is gone; one screen paint could spawn unbounded git processes',
    ).toContain('MAX_FRESHNESS_SLUGS');
    expect(
      git,
      'the slug traversal guard is gone — a slug reaches a `git show` argument and must not be able to climb out of the vault',
    ).toMatch(/contains\("\.\."\)/);
  });

  it('registers that command, without which the app calls into nothing', () => {
    const lib = read('src-tauri/src/lib.rs');
    expect(lib, 'vault_node_revisions is not in the invoke handler').toContain(
      'git::vault_node_revisions',
    );
  });

  it('keeps the client calling the command by the name Rust exports', () => {
    const hook = read('src/entities/vault-session/model/use-summary-freshness.ts');
    expect(hook, 'the invoke name drifted from the Rust command name').toContain(
      '"vault_node_revisions"',
    );
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
    ).toContain('summaryStalenessBySlug');
    // The client/server parity contract only protects the two copies it knows about.
    expect(read('tests/contract/summary-freshness-parity.contract.test.ts')).toContain(
      'summaryStalenessOf',
    );
  });

  it('mounts the row only with a real verdict, so absence never reads as a clean bill', () => {
    const panel = read('src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.tsx');
    expect(panel, 'the freshness row is no longer gated on a verdict').toMatch(
      /summaryStaleness &&[\s\S]{0,200}<SummaryFreshnessRow/,
    );
  });
});
