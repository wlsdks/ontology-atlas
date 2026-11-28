import { join } from 'node:path';

import { runJsonRpcProcess } from '../../../scripts/lib/mcp-test-rpc.mjs';

/** What one `tools/call` answered: the structured answer, or the text of an error. */
export interface ServerToolAnswer {
  isError: boolean;
  value: unknown;
}

interface RpcResponse {
  id?: number;
  result?: { isError?: boolean; structuredContent?: unknown; content?: Array<{ text?: string }> };
  error?: { message?: string };
}

export interface ServerToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

const runServer = runJsonRpcProcess as unknown as (options: Record<string, unknown>) => Promise<{
  responses: RpcResponse[];
}>;

const FIRST_REQUEST_ID = 2;

function answerOf(response: RpcResponse | undefined): ServerToolAnswer {
  if (!response) return { isError: true, value: 'no response' };
  if (response.error) return { isError: true, value: response.error.message };
  const result = response.result;
  if (result?.structuredContent !== undefined) return { isError: Boolean(result.isError), value: result.structuredContent };
  const text = result?.content?.[0]?.text ?? '';
  try {
    return { isError: Boolean(result?.isError), value: JSON.parse(text) as unknown };
  } catch {
    return { isError: Boolean(result?.isError), value: text };
  }
}

/**
 * Calls tools of the MCP server over stdio, the way an agent does, in one session over `vault`.
 * It starts `mcp/src/index.js`, the command every client config names, so the answers are the
 * installed server's whichever program that command starts. `repoRoot` names the code folder when
 * the vault sits inside a repository; it defaults to the vault itself.
 */
export async function callServerTools(
  vault: string,
  calls: readonly ServerToolCall[],
  options: { repoRoot?: string } = {},
): Promise<ServerToolAnswer[]> {
  const { responses } = await runServer({
    command: process.execPath,
    args: [join(process.cwd(), 'mcp', 'src', 'index.js')],
    timeoutMs: 60_000,
    env: { ...process.env, OATLAS_VAULT: vault, OATLAS_REPO_ROOT: options.repoRoot ?? vault },
    requests: [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'contract-test', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      ...calls.map((call, index) => ({
        jsonrpc: '2.0',
        id: FIRST_REQUEST_ID + index,
        method: 'tools/call',
        params: { name: call.name, arguments: call.arguments },
      })),
    ],
  });
  return calls.map((_call, index) => answerOf(responses.find((response) => response.id === FIRST_REQUEST_ID + index)));
}

export async function callServerTool(
  vault: string,
  name: string,
  args: Record<string, unknown>,
  options: { repoRoot?: string } = {},
): Promise<ServerToolAnswer> {
  const [answer] = await callServerTools(vault, [{ name, arguments: args }], options);
  return answer;
}
