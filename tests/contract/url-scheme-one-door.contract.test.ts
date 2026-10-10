import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The `ontology-atlas://` scheme is registered, and it has exactly one door.
 *
 * ## What this file replaces, and why it is not a deletion
 *
 * `url-scheme-rejected.contract.test.ts` banned OS scheme registration outright, on the
 * 2026-08-24 PO council that refused `ontology-atlas://` 0/24, and its companion record said
 * the scheme "may return only by overturning the council record first". That overturn is the
 * 2026-09-07 record "The installed app answers one address, and it only fills in a form"; this
 * file is the narrowed gate that record leaves behind, renamed so its name states what it now
 * enforces. Renaming rather than deleting keeps the gate — and the reviewer's ability to see it
 * change — instead of trading a checked boundary for a promise.
 *
 * ## What the 2026-08-24 rejection still owns
 *
 * Most of that council's OUT list is untouched and is checked here: **no uid addresses, no node
 * addresses, no second address vocabulary for vault meaning, and no URL that writes or executes
 * anything.** A uid is prohibited as a URL token by `mcp/README.md` and the spec, a uid link is
 * invisible to `findBacklinks` and renders as a dead span in Atlas's own Markdown viewer, and a
 * minted address is the irreversible half — a registration can be withdrawn, an address already
 * written into somebody's notes cannot. So `mcp/` and `cli/` still mint none at all.
 *
 * What was reopened is one narrow thing: a vendor page's "Add to Atlas" button, whose whole
 * effect is that the add-connector form opens with its boxes filled in. Four rules make that
 * survivable, and each is asserted below.
 */

const repoRoot = join(import.meta.dirname, '..', '..');

/** The one address this product mints and the one the app answers. */
const THE_ONE_DOOR = 'ontology-atlas://mcp?install=';

function read(relativePath: string): string {
  const absolute = join(repoRoot, relativePath);
  // A missing file must fail loudly rather than pass by absence: this gate exists to notice an
  // addition, and "the file moved" would otherwise read as "nothing was added".
  expect(existsSync(absolute), `${relativePath} must exist for this gate to mean anything`).toBe(
    true,
  );
  return readFileSync(absolute, 'utf8');
}

/** Source without its test module — negative examples in tests are the point, not a violation. */
function shippedBody(relativePath: string): string {
  return read(relativePath).split('#[cfg(test)]')[0];
}

function sourceFiles(relativeDir: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const absolute = join(dir, entry);
      if (statSync(absolute).isDirectory()) {
        if (entry !== 'node_modules') walk(absolute);
      } else if (/\.(mjs|js|ts|tsx|rs)$/.test(entry)) {
        found.push(absolute);
      }
    }
  };
  walk(join(repoRoot, relativeDir));
  return found;
}

/**
 * Every `ontology-atlas://` occurrence in a body, as the token that follows the scheme. A bare
 * mention with no destination (prose naming the scheme) reads as an empty string.
 */
function mintedAddresses(body: string): string[] {
  return [...body.matchAll(/ontology-atlas:\/\/[^\s"'`)\]]*/g)].map((match) => match[0]);
}

describe('the ontology-atlas:// scheme has exactly one door', () => {
  it('registers one scheme, in the one place a reviewer can read it', () => {
    const config = JSON.parse(read('src-tauri/tauri.conf.json'));

    expect(
      config.plugins?.['deep-link']?.desktop?.schemes,
      'exactly one scheme, and it is ours',
    ).toEqual(['ontology-atlas']);
    // The macOS bundler also accepts raw `CFBundleURLTypes`. Registration stays in the plugin
    // block so there is one spelling to review; a gate that knows one spelling and permits the
    // other is a gate that can be walked around.
    expect(
      JSON.stringify(config.bundle ?? {}),
      'bundle config must not declare CFBundleURLTypes',
    ).not.toMatch(/CFBundleURLTypes/i);
    expect(read('src-tauri/Info.plist')).not.toMatch(/CFBundleURLTypes/i);
  });

  it('answers only the MCP install destination, and only the install parameter', () => {
    const door = shippedBody('src-tauri/src/deep_link.rs');

    // The two rules that make this one door rather than a router. A third destination, or a
    // second accepted query key, is the change this assertion exists to stop.
    expect(door, 'the destination allow-list is two spellings of one word').toMatch(
      /matches!\(destination, "mcp" \| "mcp\/"\)/,
    );
    expect(door, 'any query key besides install refuses the whole URL').toMatch(
      /if key != "install"/,
    );
    // **One level of decoding, no recursion** — the fourth CVE lesson in
    // `src/shared/lib/mcp-install-link.ts`. The doorman never opens the payload: it checks the
    // characters, caps the length, and hands it on. A decoder here would be a second place that
    // has to agree with the first about what a config means.
    expect(door, 'the doorman must not decode the payload').not.toMatch(
      /serde_json::|base64::|::decode\(|from_utf8/,
    );
    // The URL is never logged. A refused link may be an address somebody was tricked into
    // pressing and its payload is a server config; the reason is what a report needs.
    const handler = read('src-tauri/src/app_shell/mod.rs').split('fn answer_deep_link')[1]?.split('\n}\n')[0];
    expect(handler, 'answer_deep_link must exist in app_shell/mod.rs').toBeTruthy();
    expect(handler, 'the arriving URL must never reach the log').not.toMatch(
      /log::(warn|info|error|debug)!\([^)]*\{url\}/,
    );
  });

  it('mints no address but that one, anywhere it ships', () => {
    const crate = sourceFiles('src-tauri/src').map((file) => file.slice(repoRoot.length + 1));
    expect(crate.length, 'the crate scan found no sources').toBeGreaterThan(30);
    for (const path of [
      ...crate,
      'src/shared/lib/mcp-install-link.ts',
      'src/features/mcp-connectors/ui/ConnectorsPanel.tsx',
    ]) {
      const body = path === 'src-tauri/src/deep_link.rs' ? shippedBody(path) : read(path);
      for (const address of mintedAddresses(body)) {
        expect(
          address === 'ontology-atlas://' || address.startsWith(THE_ONE_DOOR),
          `${path} mints ${address}, which is not ${THE_ONE_DOOR}`,
        ).toBe(true);
      }
    }
  });

  it('keeps the agent surfaces free of a second address vocabulary', () => {
    // The council's OUT list bans any second address vocabulary for vault meaning. `mcp/` and
    // `cli/` are what hand an address to an agent, so a uid or node link would land there first.
    for (const file of [...sourceFiles('mcp/src'), ...sourceFiles('cli/src')]) {
      expect(
        readFileSync(file, 'utf8'),
        `${file.slice(repoRoot.length + 1)} must not mint an ontology-atlas:// address`,
      ).not.toMatch(/ontology-atlas:\/\//);
    }
  });
});
