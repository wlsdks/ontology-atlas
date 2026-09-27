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

/** The local Compile path end to end against a scripted OpenAI-compatible runner; only the applier writes. */

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

type CompileResponse = string | ((sent: Array<{ body: string }>) => string);

async function runCompile(
  bodies: CompileResponse[],
  options: { userText?: string; existingPage?: { text: string; mtime: number } } = {},
) {
  const sent: Array<{ body: string; vaultChars: number; tools: Array<{ name: string; target: string }> }> = [];
  const executor = createCompileExecutor({
    sourcePort,
    model: 'qwen3:8b',
    now: () => new Date('2027-03-04T05:06:07.089Z'),
    readExistingPage: async () => options.existingPage ?? null,
    pageCap: COMPILE_SOURCES_PER_TURN,
  });

  let round = 0;
  const turn = startTurn({
    text: options.userText ?? 'Read the raw sources in this folder and write them up as wiki pages.',
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
        const selected = bodies[round];
        const answer =
          typeof selected === 'function' ? selected(sent) : selected ?? textBody('Done.');
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

    // Transfers are measured, not estimated (`.claude/rules/local-first.md`).
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

  it('sends the three Compile tools and nothing from the ontology catalogue', async () => {
    const { sent } = await runCompile([textBody('Nothing to do.')]);
    const body = JSON.parse(sent[0].body) as {
      tools: Array<{ function: { name: string } }>;
      reasoning_effort: string;
    };
    expect(body.tools.map((tool) => tool.function.name)).toEqual([
      'read_source_text',
      'read_wiki_page',
      'propose_wiki_page',
    ]);
    expect(body.reasoning_effort).toBe('none');
  });

  it('carries every existing-page chunk and its receipt into the next model request', async () => {
    const existingPage = {
      text:
        'PERSONAL-CHECK-592: keep this as a prior human note; it is not a source claim.\n\n' +
        'Open question: who reviews the remaining migration gap?\n\n' +
        'x'.repeat(4_100),
      mtime: 4242,
    };
    const { result, executor, sent } = await runCompile(
      [
        toolCallBody([{ id: 'c1', name: 'read_source_text', args: { path: 'sources/quarter-plan.md' } }]),
        toolCallBody([{ id: 'c2', name: 'read_wiki_page', args: { slug: 'wiki/quarter-plan.md' } }]),
        toolCallBody([{ id: 'c3', name: 'read_wiki_page', args: { slug: 'quarter-plan', cursor: 4_000 } }]),
        (requests) => {
          const body = JSON.parse(requests.at(-1)!.body) as { messages: Array<{ role: string; content?: string }> };
          const message = [...body.messages].reverse().find((entry) => entry.role === 'tool');
          const payload = JSON.parse(message?.content ?? '{}') as { receipt?: string };
          return toolCallBody([
            {
              id: 'c4',
              name: 'propose_wiki_page',
              args: {
                ...GOOD_PAGE,
                slug: 'wiki/quarter-plan.md',
                not_in_sources: ['Prior human note PERSONAL-CHECK-592 remains a human note, not a source claim.'],
                open_questions: ['The migration gap remains unresolved.'],
                receipt: payload.receipt,
              },
            },
          ]);
        },
        textBody('Done.'),
      ],
      {
        userText:
          'Refresh the existing write-up wiki/quarter-plan.md from sources/quarter-plan.md and stop for review.',
        existingPage,
      },
    );

    expect(result.turn.status).toBe('done');
    expect(sent[2]?.body).toContain('PERSONAL-CHECK-592');
    expect(sent[3]?.body).toContain('PERSONAL-CHECK-592');
    expect(executor.proposals()).toHaveLength(1);
    expect(executor.proposals()[0]).toMatchObject({ ok: true, existing: existingPage });
    expect(executor.proposals()[0]?.page).toContain('PERSONAL-CHECK-592');
    expect(executor.proposals()[0]?.sourcesRead).toEqual(['sources/quarter-plan.md']);
  });

  it('nudges a prose response toward the required Wiki read before proposing', async () => {
    const { sent, executor } = await runCompile(
      [
        toolCallBody([{ id: 'c1', name: 'read_source_text', args: { path: 'sources/quarter-plan.md' } }]),
        textBody('I read the source and will update the page.'),
        textBody('I still need to read the existing page.'),
      ],
      {
        userText:
          'Refresh the existing write-up wiki/quarter-plan.md from sources/quarter-plan.md and stop for review.',
        existingPage: { text: 'old page', mtime: 4242 },
      },
    );

    expect(sent[2]?.body).toContain('Read the existing page `wiki/quarter-plan.md`');
    expect(sent[2]?.body).toContain('read_wiki_page');
    expect(executor.proposals()).toHaveLength(0);
  });

  it('does not treat a later failed Wiki read as a still-ready historical proposal', async () => {
    const { sent, executor } = await runCompile(
      [
        toolCallBody([{ id: 'c1', name: 'read_source_text', args: { path: 'sources/quarter-plan.md' } }]),
        toolCallBody([{ id: 'c2', name: 'read_wiki_page', args: { slug: 'quarter-plan' } }]),
        (requests) => {
          const body = JSON.parse(requests.at(-1)!.body) as { messages: Array<{ role: string; content?: string }> };
          const message = [...body.messages].reverse().find((entry) => entry.role === 'tool');
          const payload = JSON.parse(message?.content ?? '{}') as { receipt?: string };
          return toolCallBody([{ id: 'c3', name: 'propose_wiki_page', args: { ...GOOD_PAGE, receipt: payload.receipt } }]);
        },
        toolCallBody([{ id: 'c4', name: 'read_wiki_page', args: { slug: 'quarter-plan', cursor: 'bad' } }]),
        textBody('I am done.'),
      ],
      {
        userText:
          'Refresh the existing write-up wiki/quarter-plan.md from sources/quarter-plan.md and stop for review.',
        existingPage: { text: 'old page', mtime: 4242 },
      },
    );

    expect(executor.proposals()[0]?.ok).toBe(false);
    expect(sent[5]?.body).toContain('read_wiki_page');
    expect(sent[5]?.body).toContain('Read the existing page');
  });

  it('refuses a same-response read plus blind replacement proposal', async () => {
    const { executor } = await runCompile(
      [
        toolCallBody([
          { id: 'c1', name: 'read_source_text', args: { path: 'sources/quarter-plan.md' } },
          { id: 'c2', name: 'read_wiki_page', args: { slug: 'quarter-plan' } },
          { id: 'c3', name: 'propose_wiki_page', args: GOOD_PAGE },
        ]),
        textBody('The replacement receipt is required.'),
      ],
      {
        userText:
          'Refresh the existing write-up wiki/quarter-plan.md from sources/quarter-plan.md and stop for review.',
        existingPage: { text: 'old page', mtime: 4242 },
      },
    );

    expect(executor.proposals()).toHaveLength(1);
    expect(executor.proposals()[0]?.ok).toBe(false);
    expect(executor.proposals()[0]?.problems.map((problem) => problem.code)).toContain(
      'wiki-receipt-mismatch',
    );
  });
});
