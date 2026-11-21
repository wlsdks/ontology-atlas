#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import { accumulationCases, distractors, negativeRetrieval } from '../../tests/fixtures/wiki-accumulation-cases.mjs';
import { evaluateAccumulation, summarizeAccumulation } from '../lib/benchmark/wiki-accumulation-eval.mjs';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (args.includes('--help')) {
  console.log('Usage: pnpm evaluate:wiki [--model=NAME | --regrade=/tmp/saved.json] [--base-url=http://127.0.0.1:11434/v1] [--case=ID] [--out=/tmp/report.json]');
  console.log('Default: deterministic oracle through the production executor. --model runs a loopback model on fictional fixtures. No real vault writes. Reports textual obligations, not semantic truth.');
  process.exit(0);
}
for (const arg of args) if (!/^--(?:model|base-url|case|out|regrade)=.+/.test(arg)) throw new Error(`Unknown argument: ${arg}`);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const model = option('model');
if (option('regrade') && (model || option('case'))) throw new Error('--regrade cannot be combined with --model or --case.');
const baseUrl = new URL(option('base-url') ?? 'http://127.0.0.1:11434/v1');
if (!['http:', 'https:'].includes(baseUrl.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)
  || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw new Error('The evaluation model must use a loopback HTTP endpoint without credentials, query or fragment.');
const selected = accumulationCases.filter((fixture) => !option('case') || fixture.id === option('case'));
if (!selected.length) throw new Error('No fixture matches --case.');
const out = path.resolve(option('out') ?? path.join(tmpdir(), `atlas-wiki-accumulation-${Date.now()}.json`));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const rubricSha256 = sha(await readFile(new URL('../lib/benchmark/wiki-accumulation-eval.mjs', import.meta.url)));
const corpusSha256 = sha(JSON.stringify({ accumulationCases, distractors, negativeRetrieval }));
if (option('regrade')) {
  const saved = JSON.parse(await readFile(option('regrade'), 'utf8'));
  if (saved.version !== 1 || saved.corpusSha256 !== corpusSha256 || !saved.cases?.length) throw new Error('The saved report does not match this sealed corpus.');
  const cases = saved.cases.map((entry) => {
    const fixture = accumulationCases.find((item) => item.id === entry.id);
    if (!fixture) throw new Error(`Unknown saved case: ${entry.id}`);
    return { ...entry, ...evaluateAccumulation(fixture, { candidates: entry.retrieval.candidates, page: entry.page, applied: entry.writes.includes(fixture.existing.slug) }) };
  });
  const summary = summarizeAccumulation(cases);
  await writeFile(out, JSON.stringify({ ...saved, regradedAt: new Date().toISOString(), regradedFrom: path.resolve(option('regrade')),
    rubricSha256, cases, summary }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ out, mode: 'regrade', summary }));
  process.exit(cases.some((entry) => entry.failed.length || !entry.beforeApprovalUnchanged || entry.negativeRetrieval.candidates.length || entry.error) ? 1 : 0);
}
const report = {
  version: 1, mode: model ? 'local-model' : 'deterministic-oracle', model: model ?? 'fixture-oracle',
  startedAt: new Date().toISOString(), corpusSha256, rubricSha256,
  limitations: 'Three fictional revision cases, 36 distractors each. Textual obligations with fixture-specific patterns and citations; no semantic entailment, paraphrase completeness, global contradiction detection or model quality certification. Gold is excluded from model requests.',
  cases: [], summary: {},
};
// Seal the corpus identity before generation, and never overwrite a prior report.
await writeFile(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const server = await createServer({ root: repo, configFile: false, server: { middlewareMode: true, hmr: false }, resolve: { alias: { '@': path.join(repo, 'src') } } });
try {
  const load = (name) => server.ssrLoadModule(`/src/features/vault-agent/model/${name}.ts`);
  const [{ runTurn, startTurn }, { compileAdapter }, { createCompileExecutor }, { buildCompileSystemPrompt },
    { COMPILE_TOOLS, COMPILE_ROUND_CAP, COMPILE_SOURCES_PER_TURN }, { buildCompileConsentCard }, { applyProposal }] = await Promise.all([
    'agent-loop', 'compile/compile-adapter', 'compile/compile-executor', 'compile/compile-system-prompt', 'compile/compile-tool-catalog', 'compile/compile-consent-card', 'proposals/proposal-applier',
  ].map(load));
  const { parseFrontmatter } = await server.ssrLoadModule('/src/shared/lib/vault-document/parse-frontmatter.ts');
  const { buildWikiRetrievalIndex } = await server.ssrLoadModule('/src/entities/docs-vault/lib/library/wiki-retrieval.ts');
  const { buildLibraryModel } = await server.ssrLoadModule('/src/entities/docs-vault/lib/library/vault-library.ts');
  const { buildCompileBrief } = await server.ssrLoadModule('/src/features/library/lib/wiki/compile/compile-brief.ts');
  const notices = { roundCap: 'round cap', noToolCall: () => 'no tool', aborted: 'aborted', networkFailed: 'network', timedOut: 'timeout', rateLimited: 'rate', rejected: 'rejected', auditBlocked: 'audit', providerRefused: 'refused', failed: 'failed' };
  const readWikiCompletely = async (execute, slug) => {
    let cursor;
    for (;;) {
      const args = cursor === undefined ? { slug } : { slug, cursor };
      const result = await execute({ id: 'read-wiki', name: 'read_wiki_page', args, argsInvalid: false });
      if (result.isError) throw new Error('read_wiki_page failed: ' + result.summary);
      const payload = JSON.parse(result.content);
      if (payload.complete === true) {
        if (typeof payload.receipt !== 'string' || payload.receipt.length === 0) {
          throw new Error('The complete Wiki read did not return a replacement receipt.');
        }
        return { payload, receipt: payload.receipt };
      }
      const nextCursor = payload.nextCursor;
      if (
        typeof nextCursor !== 'number'
        || !Number.isSafeInteger(nextCursor)
        || nextCursor < 0
        || (cursor !== undefined && nextCursor <= cursor)
      ) {
        throw new Error('The incomplete Wiki read did not return a forward cursor.');
      }
      cursor = nextCursor;
    }
  };
  for (const fixture of selected) {
    const began = Date.now();
    const pages = [...distractors, fixture.existing];
    const texts = new Map(pages.map(({ slug, raw }) => [slug, raw]));
    const docs = pages.map(({ slug, title, raw }) => ({ slug, title, path: `${slug}.md`, frontmatter: parseFrontmatter(raw).frontmatter,
      tags: [], headings: [], excerpt: '', linksOut: [], updatedAt: '', wordCount: 0 }));
    const sourceEntries = Object.entries(fixture.sources).map(([sourcePath, text]) => ({ path: sourcePath, name: path.basename(sourcePath), format: 'md', bytes: Buffer.byteLength(text), mtime: 100 }));
    const index = buildWikiRetrievalIndex(docs, texts);
    const retrieval = index.search(fixture.target, fixture.sources[fixture.target]);
    const negative = index.search(negativeRetrieval.path, negativeRetrieval.text);
    const files = new Map(texts);
    const trace = [];
    const executor = createCompileExecutor({ model: report.model, pageCap: COMPILE_SOURCES_PER_TURN, now: () => new Date('2026-09-10T00:00:00Z'),
      wikiSlugs: [...texts.keys()], findRelatedPages: index.search,
      readExistingPage: async (slug) => files.has(slug) ? { text: files.get(slug), mtime: 100 } : null,
      sourcePort: { sources: sourceEntries,
        readSourceBytes: async (sourcePath) => fixture.sources[sourcePath] === undefined ? null : new TextEncoder().encode(fixture.sources[sourcePath]).buffer,
        hashSource: async (_sourcePath, bytes) => sha(new Uint8Array(bytes)),
      },
    });
    const execute = async (call) => { const result = await executor.execute(call); trace.push({ call, result }); return result; };
    let turn = null;
    let error = null;
    try {
      if (model) {
        const library = buildLibraryModel({ docs, sources: sourceEntries, hashes: new Map(Object.entries(fixture.sources).map(([sourcePath, text]) => [sourcePath, sha(text)])) });
        const brief = buildCompileBrief({ sources: library.sources.filter((source) => source.path === fixture.target),
          existingPages: library.wikiPages, locale: fixture.locale, writerId: `model:${model}`, vaultRoot: '/fixture', now: new Date('2026-09-10T00:00:00Z') });
        const result = await runTurn({ adapter: compileAdapter, tools: COMPILE_TOOLS, roundCap: COMPILE_ROUND_CAP,
          system: buildCompileSystemPrompt({ model, targets: [fixture.target] }), model, notices, execute,
          send: async ({ body, scope }) => {
            const beganRequest = Date.now();
            const response = await fetch(baseUrl.href.replace(/\/$/, '') + '/chat/completions', {
              method: 'POST', headers: { 'content-type': 'application/json' }, body, redirect: 'error', signal: AbortSignal.timeout(120000),
            });
            const responseBody = await response.text();
            trace.push({ request: JSON.parse(body), response: responseBody, scope });
            return { status: response.status, body: responseBody, host: baseUrl.host, durationMs: Date.now() - beganRequest, loggedAt: new Date().toISOString() };
          },
        }, startTurn({ text: brief, screenContext: { focusedSlug: null, focusedTitle: null, focusedKind: null, lenses: [], projectTitle: null, visibleNodeCount: 0 } }), { signal: AbortSignal.timeout(300000) });
        turn = result.turn;
      } else {
        for (const sourcePath of Object.keys(fixture.sources)) await execute({ id: sourcePath, name: 'read_source_text', args: { path: sourcePath }, argsInvalid: false });
        const wikiRead = await readWikiCompletely(execute, fixture.existing.slug);
        await execute({ id: 'propose', name: 'propose_wiki_page', args: { slug: fixture.existing.slug, title: fixture.existing.title,
          summary: fixture.existing.title, ...fixture.oracle, not_in_sources: [], receipt: wikiRead.receipt }, argsInvalid: false });
      }
    } catch (caught) { error = String(caught); }
    const card = buildCompileConsentCard(executor.proposals(), { vaultIsGit: false, labels: { createFile: (p) => `create ${p}`, modifyFile: (p) => `edit ${p}` } });
    const beforeApprovalUnchanged = files.get(fixture.existing.slug) === fixture.existing.raw;
    const writes = [];
    const write = async (slug, content) => { writes.push(slug); files.set(slug, content); };
    const application = card.proposal ? await applyProposal(card.proposal, {
      createDoc: write, saveDoc: write, currentMtime: (slug) => files.has(slug) ? 100 : null, refresh: async () => {}, snapshot: async () => null,
    }, { snapshotLabel: 'fixture evaluation' }) : null;
    const page = files.get(fixture.existing.slug);
    const evaluated = evaluateAccumulation(fixture, { candidates: retrieval.candidates, page, applied: writes.includes(fixture.existing.slug) });
    report.cases.push({ ...evaluated, seconds: (Date.now() - began) / 1000, retrieval, negativeRetrieval: negative,
      beforeApprovalUnchanged, application, writes, page, turn, error, proposals: executor.proposals(), trace });
    report.summary = summarizeAccumulation(report.cases);
    await writeFile(out, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ case: fixture.id, seconds: report.cases.at(-1).seconds, failed: evaluated.failed, proposals: card.writableCount, error }));
  }
  console.log(JSON.stringify({ out, mode: report.mode, summary: report.summary }));
  if (report.cases.some((result) => result.failed.length || !result.beforeApprovalUnchanged || result.negativeRetrieval.candidates.length || result.error)) process.exitCode = 1;
} finally {
  await server.close();
}
