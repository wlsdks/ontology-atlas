import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLI_COMMAND_COUNT } from '../../../../cli/src/lib/cli-commands.mjs';

const ROOT = path.resolve(__dirname, '../../../..');

/** The feature inventory: `docs/FEATURES.md` and one file per surface under `docs/features/`. */
const FEATURE_DOCS = [
  'docs/FEATURES.md',
  ...readdirSync(path.join(ROOT, 'docs/features'), { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.md'))
    .map((file) => `docs/features/${file.split(path.sep).join('/')}`)
    .sort(),
];

// Archived documents preserve what was true at the time, so they are out of scope for
// current-surface gates.
const CURRENT_SURFACE_DOCS = [
  'README.md',
  ...FEATURE_DOCS,
  'docs/launch/README.md',
  'docs/launch/HN-POST.md',
  'docs/launch/REDDIT-POSTS.md',
  'docs/launch/X-THREAD.md',
  'docs/launch/DEMO-GIF-STORYBOARD.md',
];

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
  it('scans the split feature inventory, not an empty folder', () => {
    expect(FEATURE_DOCS.length).toBeGreaterThan(10);
  });

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

  it('keeps the packaged agent workflow aligned with current CLI, MCP, and dogfood facts', async () => {
    const workflow = await readFile(path.join(ROOT, 'docs/AGENT-GRAPH-WORKFLOW.md'), 'utf8');

    // The CLI command count is verified against the same registry help uses. For
    // the MCP inventory the runtime tools/list is the source of truth, so this
    // requires discovery and live proof rather than a count written in prose.
    expect(workflow).toContain(`${CLI_COMMAND_COUNT} commands`);
    expect(workflow).toContain('tools/list');
    expect(workflow).toContain('mcp-verify');
    // No vault node count is required: nodes are added without editing this document, so a count goes
    // stale.
  });

  /**
   * A line promising a demo or no install must not point at the site root, which is the gateway
   * face. The root alone is fine elsewhere; the label and destination are judged together.
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
