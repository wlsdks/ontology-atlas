import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLI_COMMAND_COUNT } from '../../../cli/src/lib/cli-commands.mjs';

const ROOT = path.resolve(__dirname, '../../..');

// `docs/archive/PUBLISH-NPM.md` moved to `docs/archive/` when the npm publishing
// plan was retired (docs/DECISIONS.md 2026-07-27). Archived documents preserve
// what was true at the time, so they are out of scope for current-surface gates.
const CURRENT_SURFACE_DOCS = [
  'README.md',
  'docs/FEATURES.md',
  'docs/launch/README.md',
  'docs/launch/HN-POST.md',
  'docs/launch/REDDIT-POSTS.md',
  'docs/launch/X-THREAD.md',
  'docs/launch/DEMO-GIF-STORYBOARD.md',
] as const;

/** Documents checked for demo links that promise the map but point at the site root. */
const DEMO_LINK_DOCS = [
  'README.md',
  'docs/launch/HN-POST.md',
  'docs/launch/DEMO-GIF-STORYBOARD.md',
] as const;

/**
 * The source of truth for the MCP inventory is the live `tools/list`. Collecting
 * old numbers as banned strings, or copying today's number into every launch
 * document, rots on the next registry change either way — so these gates enforce
 * only the structural rule: do not freeze a count.
 */
const STALE_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\d+ (?:unit )?test files?\s*\/\s*\d+ (?:unit )?tests?/i,
    message: 'Launch proof copy must not freeze test counts that drift with every added test.',
  },
];

describe('current-surface launch docs', () => {
  it('do not advertise stale MCP or frozen test counts', async () => {
    const findings: string[] = [];

    for (const relPath of CURRENT_SURFACE_DOCS) {
      const text = await readFile(path.join(ROOT, relPath), 'utf8');
      for (const { pattern, message } of STALE_PATTERNS) {
        if (pattern.test(text)) {
          findings.push(`${relPath}: ${message}`);
        }
      }
    }

    expect(findings).toEqual([]);
  });

  // [removed 2026-08-01, owner instruction] The gate requiring "if a document
  // states a node count, it matches the vault".
  //
  // Its last revision (2026-07-31) had already dropped the requirement and kept
  // only the no-lying half, which looks like zero maintenance cost. The cost was
  // not in the gate but in **the next person's habit**: while the counting
  // machinery lives, writing counts into documents reads as a supported
  // convention, and every written count turns CI red the moment the vault grows.
  // Regenerating the vault to spec delivered that whole bill at once.
  //
  // So the rule is now one line — **CI does not count vault nodes.** The place
  // that states a number is the command (`node cli/src/index.mjs overview`), not
  // a document. What was lost, stated honestly: stale node counts in prose now
  // pass in silence. The condition for reviving it is the falsifier in
  // `docs/DECISIONS.md` — an observed case of a wrong count reaching a user.
  //
  // **Copy rendered on screen is still separate**: that is a claim made to the
  // user, so it must be computed at runtime from the same source, and the
  // "caption == graph" assertion in `DownloadPage.test.tsx` holds that position
  // (it cannot rot, because it has no hand-maintained number).

  it('does not freeze MCP tool counts or read/write splits in current launch prose', async () => {
    const findings: string[] = [];
    const toolCountPattern = /\b\d+\s+(?:MCP\s+)?tools?\b|\b\d+-tool\b/i;
    const splitPattern = /\b\d+\s+read\s*(?:\+|·)\s*\d+\s+write\b|\bread\s+\d+\s*\+\s*write\s+\d+\b/i;

    for (const relPath of CURRENT_SURFACE_DOCS) {
      const text = await readFile(path.join(ROOT, relPath), 'utf8');
      if (toolCountPattern.test(text) || splitPattern.test(text)) {
        findings.push(`${relPath}: use runtime tools/list instead of a copied MCP inventory count`);
      }
    }

    expect(findings).toEqual([]);
  });

  // [removed 2026-07-31] The gate requiring the README to carry a per-kind
  // breakdown (capabilities 38 · elements 49 …). Same reason as above: it forced
  // six numbers to be synchronised by hand, so adding a single node made an
  // unrelated PR edit the README. The README now names
  // `node cli/src/index.mjs overview` instead.

  it('keeps the packaged agent workflow aligned with current CLI, MCP, and dogfood facts', async () => {
    const workflow = await readFile(path.join(ROOT, 'docs/AGENT-GRAPH-WORKFLOW.md'), 'utf8');

    // The CLI command count is verified against the same registry help uses. For
    // the MCP inventory the runtime tools/list is the source of truth, so this
    // requires discovery and live proof rather than a count written in prose.
    expect(workflow).toContain(`${CLI_COMMAND_COUNT} commands`);
    expect(workflow).toContain('tools/list');
    expect(workflow).toContain('mcp-verify');
    // **No vault node count is required here.** Anyone adds nodes and nobody
    // edits this document, so requiring one makes the document comply and then
    // go stale on the very next node. That happened: next to the "98 nodes" this
    // gate enforced, the graph hash, edge count and file count of an old vault
    // were all frozen in place too (surfaced 2026-08-01 by regenerating the
    // vault). That section is now a procedure naming the command, and whoever
    // runs it reads the numbers off their own screen.
  });

  /**
   * **A link that says "see the map with no install" must point at the map.**
   *
   * On 2026-07-30 the site root changed from the map to the **gateway face**
   * (ledger: the implementation that overturned "root-first-open"). At that
   * moment all three "Hosted demo — no install" links in the launch assets and
   * the README became **loops back to a screen recommending installation**.
   * Inside the app `map-destination-route.contract` blocks the same decay, but
   * that gate only reads source code — absolute URLs in prose were outside its
   * field of view.
   *
   * The verdict weighs label and destination together. Pointing at the site root
   * is **not itself a defect** (release docs and mentions of the first page
   * correctly point at the root); the defect is a line that says *"demo"* or
   * *"no install"* and sends the reader to the root.
   */
  it('demo links promise the map, so they point at the map', async () => {
    const SITE = 'https://ontologyatlas.com/';
    const PROMISE = /demo|데모|no install|설치 없이|지도를 본|see the graph/i;
    /** A URL that ends at the site root with no locale segment. */
    const bareRoot = (text: string) =>
      new RegExp(`${SITE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z]{2}/)`).test(text);
    const findings: string[] = [];

    for (const relPath of DEMO_LINK_DOCS) {
      const text = await readFile(path.join(ROOT, relPath), 'utf8');

      /**
       * **Markdown links are judged by their label.** Pointing at the site root
       * is not a defect in itself — the README points there while accurately
       * explaining that the first page (`/`) is the gateway face, and that
       * sentence is true. The defect is a label that **promises the map or a
       * demo** and sends the reader to the root.
       */
      for (const [, label, url] of text.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
        if (bareRoot(url) && PROMISE.test(label)) {
          findings.push(`${relPath}: 링크 라벨 "${label}" 이 지도를 약속하는데 사이트 루트로 보낸다`);
        }
      }

      /**
       * A bare URL has no label, so **the preceding line** acts as one. Launch
       * posts put the URL alone on the line after "… no install:", so a
       * line-by-line check passes in silence — the first revision of this gate
       * did exactly that.
       */
      const lines = text.split(/\r?\n/);
      for (const [i, line] of lines.entries()) {
        const trimmed = line.trim();
        if (!bareRoot(trimmed) || !/^https?:\/\/\S+$/.test(trimmed)) continue;
        if (PROMISE.test(`${lines[i - 1] ?? ''} ${trimmed}`)) {
          findings.push(`${relPath}:${i + 1} 맨 URL 이 데모를 약속하며 사이트 루트로 보낸다`);
        }
      }
    }

    expect(findings).toEqual([]);
  });
});
