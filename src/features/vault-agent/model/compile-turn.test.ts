import { describe, expect, it } from 'vitest';

import { runTurn, startTurn } from './agent-loop';
import { compileAdapter } from './compile-adapter';
import { buildCompileConsentCard } from './compile-consent-card';
import { createCompileExecutor } from './compile-executor';
import { buildCompileSystemPrompt } from './compile-system-prompt';
import { COMPILE_ROUND_CAP, COMPILE_SOURCES_PER_TURN, COMPILE_TOOLS } from './compile-tool-catalog';
import { applyProposal, type VaultWritePort } from './proposal-applier';
import type { SourceReadPort } from './source-read-port';
import type { ScreenContextSnapshot } from './types';

/**
 * The whole local Compile path, end to end, against a **mocked OpenAI-compatible runner**.
 *
 * A real runner answers this way too — measured on this machine, 2026-09-06, with Ollama:
 * `qwen3:8b` and `gemma4:12b` both called `read_source_text` then `propose_wiki_page` with
 * every bullet cited and every anchor resolvable. But a test that needs a model installed
 * is a test nobody runs, so the round trips are scripted here and the assertions are about
 * what Atlas does with them: nothing is written before the card, the card carries the page
 * path, the sections, the citation count and both source lists, and only the applier
 * writes.
 */

const PLAN = '# Quarter plan\n\nWe ship the Library in Q3.\n\nSources stay verbatim.';

function encode(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const sourcePort: SourceReadPort = {
  sources: [
    { path: 'sources/quarter-plan.md', name: 'quarter-plan.md', format: 'md', bytes: PLAN.length },
    { path: 'sources/finance.pdf', name: 'finance.pdf', format: 'pdf', bytes: 4096 },
  ],
  async readSourceBytes(path) {
    return path === 'sources/quarter-plan.md' ? encode(PLAN) : encode('%PDF-1.4');
  },
  async hashSource(path) {
    return path === 'sources/quarter-plan.md'
      ? '3b1f0000000000000000000000000000000000000000000000000000000000aa'
      : null;
  },
};

const SCREEN_CONTEXT: ScreenContextSnapshot = {
  focusedSlug: null,
  focusedTitle: null,
  focusedKind: null,
  lenses: [],
  projectTitle: 'Storefront',
  visibleNodeCount: 0,
};

const NOTICES = {
  roundCap: 'It stopped at the round cap.',
  noToolCall: () => 'It answered without opening anything.',
  aborted: 'Stopped.',
  networkFailed: 'The runner could not be reached.',
  timedOut: 'It took too long.',
  rateLimited: 'Too many requests.',
  rejected: 'The runner refused.',
  auditBlocked: 'The audit log could not be written.',
  providerRefused: 'The runner refused.',
  failed: 'It failed.',
};

/** One OpenAI-compatible response body carrying tool calls. */
function toolCallBody(
  calls: Array<{ id: string; name: string; args: unknown }>,
): string {
  return JSON.stringify({
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: calls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          })),
        },
      },
    ],
  });
}

function textBody(text: string): string {
  return JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: text } }],
  });
}

const GOOD_PAGE = {
  slug: 'quarter-plan',
  title: 'Quarter plan',
  summary: 'What the team committed to for the quarter.',
  overview: ['The plan names one shipping commitment and one rule about raw files.'],
  facts: [
    'The Library ships in Q3. [[src:sources/quarter-plan.md#p2]]',
    'Raw sources are kept verbatim. [[src:sources/quarter-plan.md#p3]]',
  ],
  decisions: ['Sources stay verbatim rather than being edited. [[src:sources/quarter-plan.md#p3]]'],
  open_questions: ['The plan does not say who reviews the pages.'],
  not_in_sources: [],
};

async function runCompile(bodies: string[]) {
  const sent: Array<{ body: string; vaultChars: number; tools: Array<{ name: string; target: string }> }> = [];
  const executor = createCompileExecutor({
    sourcePort,
    model: 'qwen3:8b',
    now: () => new Date('2027-03-04T05:06:07.089Z'),
    readExistingPage: async () => null,
    pageCap: COMPILE_SOURCES_PER_TURN,
  });

  let round = 0;
  const turn = startTurn({
    text: 'Read the raw sources in this folder and write them up as wiki pages.',
    screenContext: SCREEN_CONTEXT,
  });

  const result = await runTurn(
    {
      adapter: compileAdapter,
      tools: COMPILE_TOOLS,
      roundCap: COMPILE_ROUND_CAP,
      system: buildCompileSystemPrompt({
        model: 'qwen3:8b',
        targets: ['sources/quarter-plan.md', 'sources/finance.pdf'],
      }),
      model: 'qwen3:8b',
      notices: NOTICES,
      execute: (call) => executor.execute(call),
      async send({ body, scope }) {
        sent.push({ body, vaultChars: scope.vaultChars, tools: scope.tools });
        const answer = bodies[round] ?? textBody('Done.');
        round += 1;
        return { status: 200, body: answer, host: '127.0.0.1:11434', durationMs: 1, at: '' } as never;
      },
    },
    turn,
    { signal: new AbortController().signal },
  );

  return { result, executor, sent };
}

describe('one Compile turn on a mocked OpenAI-compatible runner', () => {
  it('reads, proposes, and ends with a card that has written nothing', async () => {
    const { result, executor } = await runCompile([
      toolCallBody([{ id: 'c1', name: 'read_source_text', args: { path: 'sources/quarter-plan.md' } }]),
      toolCallBody([{ id: 'c2', name: 'read_source_text', args: { path: 'sources/finance.pdf' } }]),
      toolCallBody([{ id: 'c3', name: 'propose_wiki_page', args: GOOD_PAGE }]),
      textBody('One page proposed; the other file could not be opened.'),
    ]);

    expect(result.turn.status).toBe('done');
    const toolLines = result.turn.events.filter((event) => event.kind === 'toolLine');
    expect(toolLines).toHaveLength(3);

    const card = buildCompileConsentCard(executor.proposals(), {
      vaultIsGit: true,
      labels: { createFile: (path) => `create ${path}`, modifyFile: (path) => `edit ${path}` },
    });

    expect(card.writableCount).toBe(1);
    expect(card.refusedCount).toBe(0);
    expect(card.rows[0]).toMatchObject({
      path: 'wiki/quarter-plan.md',
      ok: true,
      citationCount: 3,
      sourcesRead: ['sources/quarter-plan.md'],
    });
    expect(card.rows[0].sourcesUnreadable).toEqual([
      { path: 'sources/finance.pdf', refusal: 'needs-a-parser' },
    ]);
    expect(card.rows[0].sections.map((section) => section.entries)).toEqual([1, 2, 1, 1, 1]);
    // The page names the file it could not open, so the next reader is not left guessing.
    expect(card.rows[0].page).toContain('`sources/finance.pdf` is a PDF file');
  });

  it('writes exactly one file, and only when the applier is called', async () => {
    const { executor } = await runCompile([
      toolCallBody([{ id: 'c1', name: 'read_source_text', args: { path: 'sources/quarter-plan.md' } }]),
      toolCallBody([{ id: 'c2', name: 'propose_wiki_page', args: GOOD_PAGE }]),
      textBody('Done.'),
    ]);

    const written: Array<{ slug: string; content: string }> = [];
    const port: VaultWritePort = {
      createDoc: async (slug, content) => {
        written.push({ slug, content });
      },
      saveDoc: async (slug, content) => {
        written.push({ slug, content });
      },
      currentMtime: () => undefined,
      refresh: async () => undefined,
      snapshot: async () => null,
    };

    const card = buildCompileConsentCard(executor.proposals(), {
      vaultIsGit: false,
      labels: { createFile: (path) => `create ${path}`, modifyFile: (path) => `edit ${path}` },
    });
    expect(written).toHaveLength(0);

    const outcome = await applyProposal(card.proposal!, port, { snapshotLabel: 'compile' });
    expect(outcome.status).toBe('applied');
    expect(written).toHaveLength(1);
    expect(written[0].slug).toBe('wiki/quarter-plan');
    // What the card drew and what landed on disk are one value, not two.
    expect(written[0].content).toBe(card.rows[0].page);
    expect(written[0].content).toContain('created_by: model:qwen3:8b');
    expect(written[0].content).toContain(
      'source_hash:\n  sources/quarter-plan.md: 3b1f0000000000000000000000000000000000000000000000000000000000aa',
    );
  });

  it('counts the source characters that leave the computer into the audit scope', async () => {
    const { sent } = await runCompile([
      toolCallBody([{ id: 'c1', name: 'read_source_text', args: { path: 'sources/quarter-plan.md' } }]),
      textBody('Done.'),
    ]);

    // The first round trip carried no source; the second carries the file that was read,
    // and the audit line for it says so. `.claude/rules/local-first.md` is why the number
    // is measured rather than estimated.
    expect(sent[0].vaultChars).toBe(0);
    expect(sent[1].vaultChars).toBeGreaterThan(PLAN.length);
    expect(sent[1].tools).toEqual([
      { name: 'read_source_text', target: 'sources/quarter-plan.md' },
    ]);
  });

  it('lets a refused page be corrected in a later round, and shows only the correction', async () => {
    const { executor } = await runCompile([
      toolCallBody([{ id: 'c1', name: 'read_source_text', args: { path: 'sources/quarter-plan.md' } }]),
      toolCallBody([
        {
          id: 'c2',
          name: 'propose_wiki_page',
          // The failure both councils predicted: a shape-valid citation pointing nowhere.
          args: { ...GOOD_PAGE, facts: ['The Library ships in Q3. [[src:sources/quarter-plan.md#p47]]'] },
        },
      ]),
      toolCallBody([{ id: 'c3', name: 'propose_wiki_page', args: GOOD_PAGE }]),
      textBody('Done.'),
    ]);

    const proposals = executor.proposals();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].ok).toBe(true);
  });

  it('offers nothing to write when the page never becomes valid', async () => {
    const badPage = { ...GOOD_PAGE, facts: ['The Library ships in Q3. [[src:sources/quarter-plan.md#p47]]'] };
    const { executor } = await runCompile([
      toolCallBody([{ id: 'c1', name: 'read_source_text', args: { path: 'sources/quarter-plan.md' } }]),
      toolCallBody([{ id: 'c2', name: 'propose_wiki_page', args: badPage }]),
      textBody('I could not fix it.'),
    ]);

    const card = buildCompileConsentCard(executor.proposals(), {
      vaultIsGit: false,
      labels: { createFile: (path) => `create ${path}`, modifyFile: (path) => `edit ${path}` },
    });

    expect(card.proposal).toBeNull();
    expect(card.writableCount).toBe(0);
    expect(card.rows[0].problems.map((problem) => problem.code)).toContain(
      'citation-anchor-unresolvable',
    );
    expect(card.rows[0].page).toBeNull();
  });

  it('sends the two Compile tools and nothing from the ontology catalogue', async () => {
    const { sent } = await runCompile([textBody('Nothing to do.')]);
    const body = JSON.parse(sent[0].body) as {
      tools: Array<{ function: { name: string } }>;
      reasoning_effort: string;
    };
    expect(body.tools.map((tool) => tool.function.name)).toEqual([
      'read_source_text',
      'propose_wiki_page',
    ]);
    expect(body.reasoning_effort).toBe('none');
  });
});
