import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Gate against an OS-registered custom URL scheme creeping back into the shell.
 *
 * A five-seat PO council rejected `ontology-atlas://` 0/24 on 2026-08-24
 * (`docs/DECISIONS.md`, "PO Council: reject the `ontology-atlas://` OS URL scheme"),
 * with fatal zeros in four rows. The load-bearing reasons are not taste: a uid is
 * prohibited as a URL token by `mcp/README.md` and the spec; a uid link is invisible
 * to `findBacklinks` and renders as a dead span in Atlas's own Markdown viewer; and
 * `is_openable_url` in `src-tauri/src/lib.rs` already restricts *outbound* opening to
 * http/https, so an inbound scheme would put the product on both sides of one recorded
 * threat model.
 *
 * **Why a contract test and not a decision-record trigger.** The council found the
 * blindness that motivates this file: `scripts/check-decision-record.mjs` fires only on
 * added or deleted `app/` routes and two `CONTRACT_FILES`, so registering a scheme in
 * `src-tauri/tauri.conf.json` would sail past `decisions:check` under a green "no
 * council trigger in this change". Adding the Tauri config to that trigger list was the
 * obvious repair and is the wrong one — it would demand a decision record for every
 * window size, icon, and bundle tweak, and a gate that cries on everything is one people
 * learn to silence. This gate instead enforces the decision that was actually made, and
 * stays silent about everything else in the file.
 *
 * **Why registration is what gets banned, not the idea.** The council recorded a
 * falsifier and re-entry conditions; the scheme may legitimately return. The route back
 * is to overturn the record first, per `.claude/rules/forbidden.md` — "If a change
 * appears to require breaking a rule, explain why in the pull request and change the rule
 * itself first. Do not create a silent exception in code." Deleting this file is part of
 * that overturn, and deleting it is a diff a reviewer can see. A registration slipped
 * into a config value is not.
 */

const repoRoot = join(import.meta.dirname, '..', '..');

function read(relativePath: string): string {
  const absolute = join(repoRoot, relativePath);
  // A missing file must fail loudly rather than pass by absence: this gate exists to
  // notice an addition, and "the file moved" would otherwise read as "nothing was added".
  expect(existsSync(absolute), `${relativePath} must exist for this gate to mean anything`).toBe(
    true,
  );
  return readFileSync(absolute, 'utf8');
}

describe('the rejected ontology-atlas:// URL scheme stays unregistered', () => {
  it('registers no custom URL scheme in the Tauri bundle config', () => {
    const config = JSON.parse(read('src-tauri/tauri.conf.json'));

    // Tauri v2 spells scheme registration as a deep-link plugin block, and the macOS
    // bundler also accepts raw `CFBundleURLTypes` through `bundle.macOS`. Both are checked
    // because a gate that knows one spelling is a gate that can be walked around.
    expect(config.plugins?.['deep-link'], 'deep-link plugin config registers a URL scheme').toBe(
      undefined,
    );
    expect(
      JSON.stringify(config.bundle ?? {}),
      'bundle config must not declare CFBundleURLTypes',
    ).not.toMatch(/CFBundleURLTypes/i);
  });

  it('declares no URL scheme in the macOS Info.plist', () => {
    expect(read('src-tauri/Info.plist')).not.toMatch(/CFBundleURLTypes/i);
  });

  it('carries no deep-link plugin dependency on either side', () => {
    expect(read('src-tauri/Cargo.toml')).not.toMatch(/tauri-plugin-deep-link/);
    expect(read('package.json')).not.toMatch(/@tauri-apps\/plugin-deep-link/);
  });

  it('leaves no ontology-atlas:// address in shipped source or config', () => {
    // The council's OUT list bans "any second address vocabulary in vault Markdown".
    // Minted links are the irreversible half of the decision — a registration can be
    // withdrawn, but an address already written into someone's notes cannot.
    for (const path of [
      'src-tauri/tauri.conf.json',
      'src-tauri/src/lib.rs',
      'mcp/src/ontology-engine.mjs',
    ]) {
      expect(read(path), `${path} must not mint an ontology-atlas:// address`).not.toMatch(
        /ontology-atlas:\/\//,
      );
    }
  });
});
