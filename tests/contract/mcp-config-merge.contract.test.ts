import { describe, expect, it } from 'vitest';

import { MERGE_CASES, NEXT_CONFIG, NEXT_TEXT } from '../fixtures/mcp-merge-cases.mjs';
import { mergeMcpServersJson } from '@/features/docs-vault-local/lib/agent-config-contents';
// CLI 쪽 구현 — 같은 표를 두 구현에 넣고 답이 같은지 본다.
import { repairMcpJsonText } from '../../cli/src/lib/agent-config.mjs';

/**
 * 앱의 「에이전트 연결」과 CLI 의 `agent-setup --write` 는 **같은 파일**을 쓴다.
 * 그러니 같은 답을 내야 한다 — 2026-08-16 이전에는 정반대였다(CLI 는 보존,
 * 앱은 통째로 덮어쓰기). 이 표가 그 어긋남을 다시 못 열리게 한다.
 */
function serversOf(text: string): string[] {
  const parsed = JSON.parse(text) as { mcpServers?: Record<string, unknown> };
  return Object.keys(parsed.mcpServers ?? {}).sort();
}

describe('`.mcp.json` 병합 — 앱과 CLI 가 같은 답을 낸다', () => {
  for (const testCase of MERGE_CASES) {
    it(testCase.name, () => {
      const app = mergeMcpServersJson(testCase.current, NEXT_TEXT);
      // CLI 는 파일이 없는 경우를 호출자가 걸러서 처리한다(그때는 새로 쓴다).
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
