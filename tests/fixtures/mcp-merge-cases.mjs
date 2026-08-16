/**
 * `.mcp.json` 병합 — **앱과 CLI 가 같은 답을 내야 한다.**
 *
 * 2026-08-16 검수: 같은 파일에 대해 CLI 는 우리 항목만 갈아 끼우고 나머지를
 * 보존했는데, 앱은 **처음부터 새로 지어 통째로 덮어썼다.** 사용자가 등록해 둔
 * 다른 MCP 서버가 한 번의 클릭으로 사라졌다. 같은 파일에 두 표면이 반대 방향의
 * 안전을 갖고 있었고, 그것을 확인하는 검사는 없었다.
 */

const OURS = {
  command: 'node',
  args: ['./mcp/src/index.js'],
  env: { OATLAS_VAULT: './docs/ontology', OATLAS_REPO_ROOT: '.' },
};

export const NEXT_CONFIG = { mcpServers: { 'ontology-atlas': OURS } };
export const NEXT_TEXT = `${JSON.stringify(NEXT_CONFIG, null, 2)}\n`;

export const MERGE_CASES = [
  {
    name: '파일이 없으면 우리 것만 쓴다',
    current: null,
    expect: { ok: true, servers: ['ontology-atlas'] },
  },
  {
    name: '남의 서버가 있으면 **보존**하고 우리 것을 더한다',
    current: JSON.stringify({ mcpServers: { other: { command: 'x' }, more: { command: 'y' } } }),
    expect: { ok: true, servers: ['more', 'other', 'ontology-atlas'] },
  },
  {
    name: '우리 것이 이미 있으면 그 칸만 갈아 끼운다',
    current: JSON.stringify({
      mcpServers: { other: { command: 'x' }, 'ontology-atlas': { command: 'stale' } },
    }),
    expect: { ok: true, servers: ['other', 'ontology-atlas'], ourCommand: 'node' },
  },
  {
    name: 'mcpServers 밖의 키도 보존한다',
    current: JSON.stringify({ note: 'keep me', mcpServers: { other: { command: 'x' } } }),
    expect: { ok: true, servers: ['other', 'ontology-atlas'], keepsTopLevel: 'note' },
  },
  {
    name: '읽을 수 없는 파일은 **손대지 않는다**',
    current: '{ this is not json',
    expect: { ok: false },
  },
  {
    name: 'mcpServers 가 우리가 아는 모양이 아니면 손대지 않는다',
    current: JSON.stringify({ mcpServers: ['not', 'an', 'object'] }),
    expect: { ok: false },
  },
];
