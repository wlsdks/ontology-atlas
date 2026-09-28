import { act, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ko from '../../../messages/ko.json';
import { type RoundLedger, type RoundRecord, createMemoryRoundLedger, createMemoryRoundStore, parseRoundLedger, roundFingerprint } from '@/entities/library-round';
import { writeWikiFile } from '@/features/library';
import { proposedPageText } from '@/features/library/lib/judge-page-write';
import { recordApproval } from '@/shared/lib/machine-approvals';
import { WIKI_PAGE_TEMPLATE } from '@/shared/lib/wiki-page-schema';

import { useRoundsRunner } from './lib/use-rounds-runner';

const h = vi.hoisted(() => ({
  store: null as unknown,
  ledger: null as unknown,
  session: null as unknown,
  options: null as null | Record<string, unknown>,
  files: {} as Record<string, string>,
  vault: { status: 'loaded', handle: null as unknown, manifest: { docs: [], sources: [{ path: 'sources/plan.pdf' }] } as unknown, agentConfigStatus: null },
}));

vi.mock('@/entities/vault-session', () => ({ useLocalVault: () => h.vault, useAgentServer: () => ({ launch: { command: '/x/mcp', args: [] } }) }));
vi.mock('@/entities/library-round', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/library-round')>()),
  createVaultFileRoundStore: () => h.store,
  createVaultRoundLedger: () => h.ledger,
}));
vi.mock('@/entities/docs-vault', () => ({ buildLibraryModel: vi.fn(() => ({ sources: [], wikiPages: [], notCompiledCount: 0 })), isWikiPage: () => false }));
vi.mock('@/features/acp-session', async () => ({
  VAULT_MCP_SERVER_NAME: 'atlas-vault',
  atlasToolMode: (await import('@/features/acp-session/model/atlas-tool-policy')).atlasToolMode,
  connectorAcpServers: () => [],
  isGuardedRuntime: () => true,
  runtimeOwnsWriteGate: () => true,
  useAcpSession: (options: Record<string, unknown>) => {
    h.options = options;
    return h.session;
  },
  vaultMcpServers: () => [],
  vaultSelfReadSlot: () => null,
}));
vi.mock('@/features/library', async () => ({
  appendWikiLog: vi.fn(async () => undefined),
  buildCompileBrief: () => 'compile brief',
  judgePageWrite: (await import('@/features/library/lib/judge-page-write')).judgePageWrite,
  writeWikiFile: vi.fn(async (_vault: unknown, path: string, text: string) => {
    h.files[path] = text;
  }),
  deleteWikiFile: vi.fn(async (_vault: unknown, path: string) => {
    delete h.files[path];
  }),
}));
vi.mock('@/features/mcp-connectors', () => ({ useVaultConnectors: () => ({ connectors: [], allowedHere: () => false, isOnHere: () => false }) }));
vi.mock('@/shared/lib/tauri-acp', () => ({
  detectAcpRuntimes: vi.fn(async () => [{ id: 'claude-acp', label: 'Claude', state: 'ready', verified: true, isolated: true }]),
  isAcpBridgeAvailable: () => true,
}));
vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  getTauriVaultRootPath: () => '/vault',
  nativeVaultFileHashes: async () => new Map(),
  readTauriVaultText: async (_root: string, path: string) => h.files[path] ?? null,
}));

const notFound = () => Object.assign(new Error('not found'), { name: 'NotFoundError' });
const under = (prefix: string, name: string) => Object.keys(h.files).some((path) => path.startsWith(`${prefix}${name}/`));
const file = (path: string) => ({ kind: 'file', getFile: async () => ({ text: async () => h.files[path] }) });
const folder = (prefix: string): unknown => ({
  kind: 'directory',
  getDirectoryHandle: async (name: string) => {
    if (!under(prefix, name)) throw notFound();
    return folder(`${prefix}${name}/`);
  },
  getFileHandle: async (name: string) => {
    if (!(`${prefix}${name}` in h.files)) throw notFound();
    return file(`${prefix}${name}`);
  },
  entries: async function* () {
    for (const name of new Set(Object.keys(h.files).filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length).split('/')[0]))) {
      yield [name, under(prefix, name) ? folder(`${prefix}${name}/`) : file(`${prefix}${name}`)];
    }
  },
});

type Request = Record<string, unknown>;
type Decision = string | { reject: string } | null;
const relative = (request: Request) => String(request.filePath ?? '').replace('/vault/', '');
const tool = (request: Request) => {
  const next = proposedPageText(request.rawInput as Record<string, unknown>, h.files[relative(request)] ?? null);
  if (next !== null) h.files[relative(request)] = next;
};

function scriptedSession(requests: Request[], decisions: Decision[], apply: (request: Request) => void, person?: () => void) {
  return {
    status: 'ready',
    start: vi.fn(async () => {}),
    cancel: vi.fn(),
    stop: vi.fn(async () => {}),
    send: vi.fn(async () => {
      const options = h.options!;
      const autoDecide = options.autoDecide as (request: Request) => Decision;
      const settled = options.onToolSettled as (id: string, status: string) => void;
      const onTurnStarted = options.onTurnStarted as (turn: Record<string, unknown>) => ((completion: unknown) => void) | null;
      const start = { runtimeId: 'claude-acp', sessionId: 's-1', vaultRoot: '/vault', userEventId: 'u-1', text: 'brief', startedAt: new Date().toISOString() };
      const observer = onTurnStarted(start);
      const events: Record<string, unknown>[] = [];
      requests.forEach((request, index) => {
        const decided = autoDecide({ ...request, toolCallId: `call-${index}` });
        decisions.push(decided);
        if (decided && typeof decided === 'object') events.push({ kind: 'notice', id: `n${index}`, text: 'auto-refused', detail: decided.reject });
        if (typeof decided !== 'string') return;
        events.push({ kind: 'notice', id: `n${index}`, text: 'auto-allowed', detail: decided });
        apply(request);
        settled(`call-${index}`, 'completed');
      });
      person?.();
      events.push({ kind: 'agent', id: 'a1', text: 'done' });
      observer?.({ ...start, endedAt: new Date().toISOString(), outcome: 'completed', stopReason: 'end_turn', events });
    }),
  };
}

const wrapper = ({ children }: { children: ReactNode }) => <NextIntlClientProvider locale="ko" messages={ko}>{children}</NextIntlClientProvider>;
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
const lines = () => parseRoundLedger((h.ledger as RoundLedger & { text(): string | null }).text());
const PAGE = '/vault/wiki/plan.md';
const onDisk = WIKI_PAGE_TEMPLATE.replace(/sources\/<file>/g, 'sources/plan.pdf');
const lead = '<Two or three sentences. What a reader needs before the facts.>';
const write = (path: string, content: string) => ({ filePath: path, toolName: 'Write', toolKind: 'edit', rawInput: { file_path: path, content }, reviewKind: 'permission' });
const edit = (path: string, oldString: string, newString: string) => ({ filePath: path, toolName: 'Edit', toolKind: 'edit', rawInput: { file_path: path, old_string: oldString, new_string: newString }, reviewKind: 'permission' });
const serviceRound: RoundRecord = {
  id: 'svc', name: 'Service', kind: 'service', cadence: { every: 'hour' }, enabled: true, createdAt: '2026-09-20T00:00:00.000Z',
  nextDueAt: '2099-01-01T00:00:00.000Z', connectorId: 'c1', connectorName: 'confluence',
  places: [{ kind: 'vault', paths: [] }, { kind: 'service', connectorId: 'c1', connectorName: 'confluence' }],
};

async function pass(requests: Request[], { apply = tool, person, files = { 'wiki/plan.md': onDisk } }: { apply?: (request: Request) => void; person?: () => void; files?: Record<string, string> } = {}) {
  h.files = { ...files };
  h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [serviceRound] }));
  recordApproval('round', '/vault', serviceRound.id, roundFingerprint(serviceRound));
  const decisions: Decision[] = [];
  h.session = scriptedSession(requests, decisions, apply, person);
  const { result } = renderHook(() => useRoundsRunner(), { wrapper });
  await flush();
  await flush();
  act(() => result.current.runNow('svc'));
  await flush();
  await act(() => vi.advanceTimersByTimeAsync(6_000));
  return decisions;
}

const copyOf = (path: string) => Object.keys(h.files).find((key) => new RegExp(`^\\.ontology-atlas/undone/[^/]+/${path}$`).test(key));

beforeEach(() => {
  window.localStorage.clear();
  h.ledger = createMemoryRoundLedger();
  h.vault.handle = folder('');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-09-28T09:10:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  h.files = {};
});

describe('a document pass judges each write against the page as its earlier writes left it', () => {
  it('refuses an edit that would make the page an earlier write left in this pass read as reviewed', async () => {
    const moved = onDisk.replace('summary: <one sentence about what this page is about>', `summary: ${lead}`).replace(`\n${lead}\n`, '\nA reader needs this first.\n');
    const decisions = await pass([write(PAGE, moved), edit(PAGE, lead, `${lead}\nstatus: reviewed\ndescribes: [capabilities/checkout]`)]);
    expect(decisions).toEqual(['write wiki/plan.md', { reject: 'wiki/plan.md' }]);
  });

  it('still allows a later edit that keeps the page a draft', async () => {
    const decisions = await pass([
      write(PAGE, onDisk.replace('<Anything you could not ground in a source. It goes here and nowhere else.>', 'Nothing yet.')),
      edit(PAGE, 'Nothing yet.', 'Pricing is not in the sources.'),
    ]);
    expect(decisions).toEqual(['write wiki/plan.md', 'write wiki/plan.md']);
    expect(lines()[0]).toMatchObject({ outcome: 'redrafted', written: ['wiki/plan.md'] });
  });

  it('counts a document the pass brought in as a known source for the page that cites it', async () => {
    const decisions = await pass([
      write('/vault/sources/refunds.md', '---\nsource_url: https://example.atlassian.net/wiki/9\n---\n# Refunds\n'),
      write('/vault/wiki/refunds.md', WIKI_PAGE_TEMPLATE.replace(/sources\/<file>/g, 'sources/refunds.md')),
    ]);
    expect(decisions).toEqual(['write sources/refunds.md', 'write wiki/refunds.md']);
  });
});

describe('after the turn, the pass reads back every page it wrote', () => {
  const moved = onDisk.replace('summary: <one sentence about what this page is about>', `summary: ${lead}`).replace(`\n${lead}\n`, '\nA reader needs this first.\n');
  const endA = moved.replace(lead, `${lead}\nstatus: reviewed\ndescribes: [capabilities/checkout]`);
  const endB = onDisk.replace('title: <the page name>\n', 'title: <the page name>\nstatus: reviewed\n')
    .replace('status: draft\nsummary: <one sentence about what this page is about>\n', 'summary: <one sentence about what this page is about>status: draft\n');

  it.each([
    ['A', 'wiki/plan.md', endA, { reason: 'duplicate-key', key: 'status' }],
    ['B', 'wiki/plan.md', endB, { reason: 'not-draft' }],
    ['D', 'wiki/결제.md', endA, { reason: 'duplicate-key', key: 'status' }],
  ])('puts back a page its own write left in probe %s\'s end state, keeps that text, and fails the pass naming it', async (_probe, path, planted, problem) => {
    const decisions = await pass([write(`/vault/${path}`, onDisk)], { apply: () => { h.files[path] = planted; }, files: { [path]: onDisk } });
    expect(decisions).toEqual([`write ${path}`]);
    expect(h.files[path]).toBe(onDisk);
    expect(writeWikiFile).toHaveBeenCalledWith(h.vault.handle, path, onDisk);
    expect(h.files[copyOf(path)!]).toBe(planted);
    expect(lines()[0]).toMatchObject({ outcome: 'failed', written: [], undone: [{ path, ...problem, action: 'restored', copy: copyOf(path) }] });
  });

  it('removes a page it created when its own write left it out of scope, and keeps that text', async () => {
    const planted = onDisk.replace('status: draft', 'status: draft\ndescribes: [capabilities/checkout]');
    await pass([write('/vault/wiki/new.md', onDisk)], { apply: () => { h.files['wiki/new.md'] = planted; } });
    expect(h.files['wiki/new.md']).toBeUndefined();
    expect(h.files[copyOf('wiki/new.md')!]).toBe(planted);
    expect(lines()[0]).toMatchObject({ outcome: 'failed', undone: [{ path: 'wiki/new.md', reason: 'forbidden-key', key: 'describes', action: 'removed' }] });
  });

  it.each([
    ['P1, a page the pass wrote', 'wiki/plan.md', { 'wiki/plan.md': onDisk }],
    ['P2, a page the pass created', 'wiki/new.md', {}],
  ])('keeps what a person did to %s during the pass, and does not fail the pass for it', async (_case, path, files) => {
    const theirs = onDisk.replace('status: draft', 'status: reviewed');
    await pass([write(`/vault/${path}`, onDisk.replace('<the page name>', 'Plan'))], { files, person: () => { h.files[path] = theirs; } });
    expect(h.files[path]).toBe(theirs);
    expect(lines()[0]).toMatchObject({ outcome: 'redrafted', written: [path], leftAsIs: [path] });
    expect(lines()[0].undone).toBeUndefined();
  });

  it('refuses to write over an ontology node filed under wiki/, which the manifest does not list as a page', async () => {
    const node = '---\nkind: capability\ntitle: Checkout\n---\nA cart becomes an order.\n';
    const decisions = await pass([write('/vault/wiki/checkout.md', onDisk)], { files: { 'wiki/checkout.md': node } });
    expect(decisions).toEqual([{ reject: 'wiki/checkout.md' }]);
    expect(h.files['wiki/checkout.md']).toBe(node);
  });

  it('puts back a page the manifest had not caught up with, instead of removing it as new', async () => {
    const extra = onDisk.replace('<the page name>', 'Extra');
    await pass([write('/vault/wiki/extra.md', onDisk)], { apply: () => { h.files['wiki/extra.md'] = endB; }, files: { 'wiki/extra.md': extra } });
    expect(h.files['wiki/extra.md']).toBe(extra);
    expect(lines()[0]).toMatchObject({ outcome: 'failed', undone: [{ path: 'wiki/extra.md', reason: 'not-draft', action: 'restored' }] });
  });
});
