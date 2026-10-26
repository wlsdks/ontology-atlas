import type { Page } from '@playwright/test';
import { installDesktopRailRuntime } from '../desktop-rail-arrival-harness';

export async function installBriefingRuntime(page: Page) {
  await installDesktopRailRuntime(page);
  await page.addInitScript(() => {
    type Invocation = { command: string; args: Record<string, unknown> };
    const target = window as unknown as {
      __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
      __briefingProbe: { mode: string; calls: Invocation[]; hold: boolean; holdAt: number; failAt: number; capacity: number; active: number; peak: number; release: () => void };
    };
    const nativeInvoke = target.__TAURI_INTERNALS__.invoke;
    const probe = { mode: 'ready', calls: [] as Invocation[], hold: false, holdAt: 0, failAt: 0, capacity: 16000, active: 0, peak: 0, release: () => {} };
    target.__briefingProbe = probe;
    target.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (command === 'llm_chat_prepare') return 'fixture-source-request';
      if (command === 'llm_chat_cancel') { probe.calls.push({ command, args }); return true; }
      if (command === 'source_model_capacity') { probe.calls.push({ command, args }); return { inputByteLimit: probe.capacity, contextTokens: 32768 }; }
      if (command === 'git_briefing_repositories') { probe.calls.push({ command, args }); return ['owner/repo']; }
      if (command === 'git_briefing_clear_saved_pulls') { probe.calls.push({ command, args }); if (probe.mode === 'cache-clear-failed') throw new Error('fixture clear denied'); localStorage.removeItem('atlas-fixture-pr-copies'); return; }
      if (command === 'git_briefing_saved_pull_descriptions') {
        probe.calls.push({ command, args });
        if (probe.mode === 'cache-unavailable') return { status: 'unavailable', pulls: null, omitted: 0, ignored: 0 };
        if (probe.mode === 'cache-unsupported') return { status: 'unsupported', pulls: null, omitted: 0, ignored: 0 };
        const stored = JSON.parse(localStorage.getItem('atlas-fixture-pr-copies') ?? 'null');
        if (stored && args.snapshot === 'fixture-new-period-snapshot') stored.descriptions = [];
        if (stored) stored.descriptions = stored.descriptions.map((pr: Record<string, unknown>) => ({ ...pr, copyKind: 'saved' }));
        return { status: 'ready', pulls: stored ? { ...stored, saved: undefined, status: 'partial', unchecked: 2, uncheckedCommits: ['c'.repeat(40), 'd'.repeat(40)] } : null, omitted: probe.mode === 'cache-omitted' ? 9 : 0, ignored: probe.mode === 'cache-omitted' ? 1 : 0 };
      }
      if (command === 'git_briefing_pull_descriptions') {
        probe.calls.push({ command, args });
        if (probe.mode === 'pr-rate-limited') return { status: 'unavailable', repository: 'owner/repo', descriptions: [], unchecked: 2, uncheckedCommits: ['c'.repeat(40), 'd'.repeat(40)], unlinked: 0, failure: { kind: 'rate-limited', retryAt: new Date(Date.now() + 60_000).toISOString() } };
        if (probe.mode === 'pr-partial-failed') return { status: 'partial', repository: 'owner/repo', descriptions: [], unchecked: 2, uncheckedCommits: ['c'.repeat(40), 'd'.repeat(40)], unlinked: 0, failure: { kind: 'unavailable', retryAt: null } };
        if (probe.mode === 'pr-error') throw new Error('fixture lookup interrupted');
        if (probe.mode === 'pr-empty') localStorage.removeItem('atlas-fixture-pr-copies');
        if (probe.mode === 'pr-unavailable' || probe.mode === 'pr-empty') return { status: probe.mode === 'pr-empty' ? 'measured' : 'unavailable', repository: 'owner/repo', unchecked: probe.mode === 'pr-empty' ? 0 : 2, uncheckedCommits: probe.mode === 'pr-empty' ? [] : ['c'.repeat(40), 'd'.repeat(40)], unlinked: 0, descriptions: [] };
        const result = { status: 'measured', saved: { status: probe.mode === 'cache-save-failed' ? 'unavailable' : 'saved', saved: 1, unsaved: 0, evicted: 0 }, repository: 'owner/repo', unchecked: 0, uncheckedCommits: [], unlinked: 0, descriptions: [{ number: 2925, title: 'Keep map navigation readable', body: 'Changes: keep return controls visible.\n\nWhy: panels hid navigation.\n\nChecks: 131 author-reported tests passed.\n\nLimits: first frames remain 53 ms and 57 ms against a 50 ms bar.', digest: 'e'.repeat(64), integration: 'c'.repeat(40), url: 'https://github.com/owner/repo/pull/2925', updatedAt: '2026-10-25T00:00:00Z', fetchedAt: '2026-10-25T01:00:00Z', copyKind: 'fresh' }] };
        if (probe.mode !== 'cache-save-failed') localStorage.setItem('atlas-fixture-pr-copies', JSON.stringify(result));
        return result;
      }
      if (command === 'source_briefing_chat') {
        probe.calls.push({ command, args });
        const number = probe.calls.filter(call => call.command === command).length;
        probe.active++; probe.peak = Math.max(probe.peak, probe.active);
        if (probe.hold || number === probe.holdAt) { probe.hold = false; await new Promise<void>(resolve => { probe.release = resolve; }); }
        probe.active--;
        if (number === probe.failAt) throw new Error(probe.mode === 'batch-stale' ? 'stale-model-capacity' : 'fixture transport interruption');
        if (probe.mode === 'model-post-audit') throw new Error('audit-blocked: post-response metadata reservation failed');
        if (probe.mode === 'model-finalize-audit') throw new Error('audit-log-write-failed: post-response receipt finalization failed');
        const packet = JSON.parse(String(args.packet));
        const pr = packet.sources.find((source: { kind: string }) => source.kind === 'pr');
        if (!pr) { const source = packet.sources.find((source: { kind: string }) => source.kind === 'commit'); return { status: 200, body: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ themes: [{ title: 'Commit notes', change: { text: source.passages[0].text.split('\n')[0], evidence: [source.passages[0].id], inferred: false }, reason: null, checks: [], limits: [] }] }) } }] }), host: 'localhost:11434', durationMs: 1, loggedAt: '2026-10-25T01:00:00Z' }; }
        const find = (match: string) => pr.passages.find((passage: { text: string }) => passage.text.includes(match));
        const evidence = (match: string) => (find(match) ?? pr.passages[0]).id;
        const claim = (text: string, match: string) => ({ text, evidence: [probe.mode === 'model-invalid' ? 'invented:p0' : evidence(match)], inferred: false });
        const content = JSON.stringify({ themes: [{ title: 'Readable map navigation', change: claim('Return controls stay visible beside panels.', 'Changes:'), reason: find('Why:') ? claim('Panels had hidden navigation.', 'Why:') : null, checks: find('Checks:') ? [claim(probe.mode === 'model-mislabel-check' ? 'The author reports 131 native desktop checks.' : 'The author reports 131 passing tests.', 'Checks:')] : [], limits: find('Limits:') ? [claim('First frames remain 53 ms and 57 ms against a 50 ms bar.', 'Limits:')] : [] }] });
        const result = JSON.parse(content);
        if (probe.mode === 'model-fixed-as-open') {
          result.themes[0].checks = [claim('Completed navigation fixes prove validation.', 'Changes:')];
          result.themes[0].limits = [claim('Return controls still require a fix.', 'Changes:')];
        }
        if (probe.mode === 'model-three' || probe.mode === 'model-three-empty') result.themes = ['Map navigation', 'Analysis workspace', 'Release delivery'].map(title => ({ ...result.themes[0], title, ...(probe.mode === 'model-three-empty' ? { reason: null, checks: [], limits: [] } : {}) }));
        return { status: 200, body: JSON.stringify({ choices: [{ finish_reason: probe.mode === 'model-length' ? 'length' : 'stop', message: { content: JSON.stringify(result), ...(probe.mode === 'model-tools' ? { tool_calls: [{ function: { name: 'write_file' } }] } : {}) } }] }), host: 'localhost:11434', durationMs: 1, loggedAt: '2026-10-25T01:00:00Z' };
      }
      if (command === 'pick_source_directory') return '/source/storefront';
      if (!command.startsWith('git_change_briefing') && !command.startsWith('git_source_briefing')) return nativeInvoke(command, args);
      probe.calls.push({ command, args });
      const mode = probe.mode;
      if (probe.hold) { probe.hold = false; await new Promise<void>(resolve => { probe.release = resolve; }); }
      if (command === 'git_change_briefing_patch' || command === 'git_source_briefing_patch') {
        if (mode === 'patch-error') throw new Error('fixture read failure');
        return { status: mode === 'binary' ? 'binary' : mode === 'stale' ? 'stale' : 'measured', patch: mode === 'revert' ? '' : mode === 'long' ? `diff --git a/${args.path} b/${args.path}\n${Array.from({ length: 260 }, (_, index) => `+const value${index} = ${index};`).join('\n')}\n` : 'diff --git a/src/features/checkout/service.ts b/src/features/checkout/service.ts\n--- a/src/features/checkout/service.ts\n+++ b/src/features/checkout/service.ts\n@@ -1 +1 @@\n-limit = 10\n+limit = 20\n', truncated: mode === 'truncated' };
      }
      const unavailable = ['stale', 'no-history', 'ungranted', 'no-source', 'unreadable'].includes(mode);
      return {
        status: unavailable ? mode : mode.startsWith('partial') ? 'partial' : 'measured', sourceRoot: '/source/storefront', snapshot: mode === 'fresh-period' ? 'fixture-new-period-snapshot' : mode.startsWith('batch') ? 'fixture-batch-snapshot' : 'fixture-snapshot', head: (mode === 'fresh-period' ? '9' : mode === 'changed-head' ? 'f' : 'a').repeat(40), base: 'b'.repeat(40), tip: 'c'.repeat(40), limit: 2000, partialReasons: mode.startsWith('partial') ? ['commit-limit'] : [],
        commits: mode === 'fresh-period' ? [{ hash: '9'.repeat(40), subject: 'New period work', message: 'New period work\n\nA separately dated change.', committedAt: new Date(Number(args.startEpoch) * 1000).toISOString(), paths: ['src/features/checkout/service.ts'] }] : mode === 'empty' || mode === 'partial-empty' || unavailable ? [] : [{ hash: 'c'.repeat(40), subject: 'author claim: changed checkout; not independently verified', message: 'author claim: changed checkout; not independently verified\n\nWhy: keep the return action visible.\nChecks: first frame still exceeds the budget.', committedAt: new Date(Number(args.startEpoch) * 1000).toISOString(), paths: ['src/features/checkout/service.ts', '한글/unmapped.ts'] }, { hash: 'd'.repeat(40), subject: 'revert previous rule', committedAt: new Date(Number(args.startEpoch) * 1000).toISOString(), paths: ['src/features/checkout/service.ts'] }, ...(mode === 'source-pages' ? Array.from({ length: 60 }, (_, index) => ({ hash: (index + 20).toString(16).padStart(40, '0'), subject: `Source original ${index + 1}`, message: `Source original ${index + 1}\n\nAn original in the selected period.`, committedAt: new Date(Number(args.startEpoch) * 1000).toISOString(), paths: ['src/features/checkout/service.ts'] })) : []), ...(mode.startsWith('batch') ? Array.from({ length: 8 }, (_, index) => ({ hash: String(index + 1).repeat(40), subject: `Earlier work ${index + 1}`, message: `Earlier work ${index + 1}\n\n${'Original historical description. '.repeat(20)}`, committedAt: new Date(Number(args.startEpoch) * 1000).toISOString(), paths: ['src/features/checkout/service.ts'] })) : []), ...(['many', 'long'].includes(mode) ? [{ hash: 'e'.repeat(40), subject: 'change tooling', committedAt: new Date(Number(args.startEpoch) * 1000).toISOString(), paths: Array.from({ length: 61 }, (_, index) => `mcp/src/tool-${index}.ts`) }] : [])],
        netPaths: mode === 'revert' ? [] : mode === 'net-unavailable' ? null : ['src/features/checkout/service.ts', 'outside-period.ts'],
      };
    };
  });
}

export async function setBriefingMode(page: Page, mode: string) {
  await page.evaluate(value => { (window as unknown as { __briefingProbe: { mode: string } }).__briefingProbe.mode = value; }, mode);
}
