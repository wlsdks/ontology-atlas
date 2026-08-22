import { describe, expect, it } from 'vitest';

import { MERGE_CASES, NEXT_CONFIG, NEXT_TEXT } from '../fixtures/mcp-merge-cases.mjs';
import { mergeMcpServersJson } from '@/features/docs-vault-local/lib/agent-config-contents';
// The CLI implementation — the same table goes through both, and the answers must match.
import { repairMcpJsonText } from '../../cli/src/lib/agent-config.mjs';

/**
 * The app's "connect an agent" and the CLI's `agent-setup --write` write **the
 * same file**, so they must produce the same answer. Before 2026-08-16 they did
 * the opposite of each other (CLI preserved, app overwrote wholesale). This
 * table stops that divergence reopening.
 */
function serversOf(text: string): string[] {
  const parsed = JSON.parse(text) as { mcpServers?: Record<string, unknown> };
  return Object.keys(parsed.mcpServers ?? {}).sort();
}

describe('`.mcp.json` 병합 — 앱과 CLI 가 같은 답을 낸다', () => {
  for (const testCase of MERGE_CASES) {
    it(testCase.name, () => {
      const app = mergeMcpServersJson(testCase.current, NEXT_TEXT);
      // The CLI's caller handles the missing-file case itself (it writes a fresh file).
      const cli =
        testCase.current === null
          ? { ok: true as const, text: NEXT_TEXT }
          : repairMcpJsonText(testCase.current, NEXT_CONFIG);

      expect(app.ok, '앱 쪽 판정').toBe(testCase.expect.ok);
      expect(cli.ok, 'CLI 쪽 판정이 앱과 다르다 — 같은 파일에 두 규칙이 생긴다').toBe(
        testCase.expect.ok,
      );
      if (!testCase.expect.ok) return;

      const appServers = serversOf((app as { text: string }).text);
      const cliServers = serversOf((cli as { text: string }).text);
      expect(appServers).toEqual([...(testCase.expect.servers ?? [])].sort());
      expect(cliServers, 'CLI 가 다른 서버 목록을 낸다').toEqual(appServers);

      if (testCase.expect.ourCommand) {
        const parsed = JSON.parse((app as { text: string }).text) as {
          mcpServers: Record<string, { command?: string }>;
        };
        expect(parsed.mcpServers['ontology-atlas'].command).toBe(testCase.expect.ourCommand);
      }
      if (testCase.expect.keepsTopLevel) {
        expect(
          JSON.parse((app as { text: string }).text)[testCase.expect.keepsTopLevel],
          'mcpServers 밖의 키가 사라졌다',
        ).toBeTruthy();
      }
    });
  }
});
