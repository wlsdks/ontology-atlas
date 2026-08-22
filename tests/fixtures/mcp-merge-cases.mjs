/**
 * `.mcp.json` merge — **the app and the CLI must produce the same answer.**
 *
 * Reviewed 2026-08-16: for the same file the CLI replaced only our entry and
 * preserved the rest, while the app **rebuilt from scratch and overwrote the
 * whole file.** Other MCP servers a user had registered disappeared in one
 * click. Two surfaces held opposite safety guarantees over one file, and no
 * check compared them.
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
