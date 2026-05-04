import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Spawn-based JSON-RPC client for `oh-my-ontology-mcp`.
 *
 * The plugin starts the MCP server as a child process (Node spawning
 * `mcp/src/index.js` with `OMOT_VAULT` set). Each tool call writes a
 * JSON-RPC request to stdin and waits for a `result` matching the
 * request `id` on stdout. Lifecycle: `start()` on activate,
 * `dispose()` on deactivate.
 *
 * Error model: any spawn / parse / timeout failure rejects the
 * promise — the caller (extension.ts) can fall back to raw
 * filesystem read for resilience. We don't auto-respawn on crash;
 * the user can use `oh-my-ontology.refresh` to reconnect.
 */
export class McpClient {
  private child: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private buffer = '';
  private events = new EventEmitter();
  private initialized = false;

  constructor(
    private readonly serverEntry: string,
    private readonly vaultRoot: string,
  ) {}

  async start(timeoutMs = 5000): Promise<void> {
    if (this.child) return;
    this.child = spawn('node', [this.serverEntry], {
      env: { ...process.env, OMOT_VAULT: this.vaultRoot },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout?.on('data', (chunk) => this.onStdout(chunk.toString()));
    this.child.stderr?.on('data', () => {
      // mcp logs to stderr; ignore unless needed for debugging
    });
    this.child.on('exit', (code) => {
      this.events.emit('exit', code);
      this.failAllPending(new Error(`MCP server exited (code ${code})`));
      this.child = null;
      this.initialized = false;
    });

    await this.send(
      {
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'oh-my-ontology-vscode', version: '0.4.0' },
        },
      },
      timeoutMs,
    );
    // notifications/initialized — no response expected
    this.write({ jsonrpc: '2.0', method: 'notifications/initialized' });
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized && this.child !== null;
  }

  /**
   * Call an MCP tool by name. Returns the parsed JSON of the tool's
   * text content (the standard mcp-server response shape).
   */
  async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown> = {},
    timeoutMs = 5000,
  ): Promise<T> {
    if (!this.child) throw new Error('MCP client not started');
    const result = (await this.send(
      {
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'tools/call',
        params: { name, arguments: args },
      },
      timeoutMs,
    )) as {
      content?: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    if (result.isError) {
      const text = result.content?.[0]?.text ?? '<error>';
      throw new Error(text);
    }
    const text = result.content?.[0]?.text;
    if (!text) throw new Error(`tool '${name}' returned no text content`);
    return JSON.parse(text) as T;
  }

  dispose(): void {
    if (this.child) {
      try {
        this.child.kill('SIGTERM');
      } catch {
        // ignore
      }
      this.child = null;
    }
    this.failAllPending(new Error('MCP client disposed'));
    this.initialized = false;
  }

  private send(
    request: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = request.id as number;
      this.pending.set(id, { resolve, reject });
      this.write(request);
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request ${id} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      // ensure timer doesn't keep VSCode running
      timer.unref?.();
    });
  }

  private write(request: Record<string, unknown>): void {
    if (!this.child?.stdin) return;
    this.child.stdin.write(JSON.stringify(request) + '\n');
  }

  private onStdout(text: string): void {
    this.buffer += text;
    let nlIdx;
    while ((nlIdx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nlIdx).trim();
      this.buffer = this.buffer.slice(nlIdx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const id = msg.id as number | undefined;
        if (id !== undefined && this.pending.has(id)) {
          const handler = this.pending.get(id)!;
          this.pending.delete(id);
          if (msg.error) {
            handler.reject(
              new Error(`MCP error ${msg.error.code}: ${msg.error.message}`),
            );
          } else {
            handler.resolve(msg.result);
          }
        }
      } catch {
        // skip malformed line
      }
    }
  }

  private failAllPending(err: Error): void {
    for (const [, handler] of this.pending) {
      handler.reject(err);
    }
    this.pending.clear();
  }
}
