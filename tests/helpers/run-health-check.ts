import { spawnSync } from "node:child_process";
import { join } from "node:path";

const retrySignal = new Int32Array(new SharedArrayBuffer(4));

export type HealthCheck = { id?: string; status?: string; count?: number };

/**
 * Runs the MCP server's `health` operation on a vault through `mcp/scripts/call-tool.mjs` and returns
 * its checks. Retries a few times, because a cold server start under load can miss the timeout.
 */
export function runHealthCheck(vault: string): HealthCheck[] {
  const args = [join(process.cwd(), "mcp", "scripts", "call-tool.mjs"), vault, "query_ontology", '{"operation":"health"}'];
  let lastDiagnostic = "health did not run";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const run = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 60_000 });
    const stdout = run.stdout ?? "";
    if (!run.error && run.signal == null && run.status === 0 && stdout.trim().length > 0) {
      try {
        return (JSON.parse(stdout) as { checks?: HealthCheck[] }).checks ?? [];
      } catch (error) {
        lastDiagnostic = `invalid JSON: ${error instanceof Error ? error.message : String(error)}; stdout=${stdout.slice(0, 300)}`;
      }
    } else {
      lastDiagnostic = [
        run.error ? `spawn error: ${run.error.message}` : null,
        `status=${run.status ?? "none"}`,
        run.signal ? `signal=${run.signal}` : null,
        run.stderr ? `stderr=${run.stderr.slice(0, 300)}` : null,
      ].filter(Boolean).join("; ");
    }
    if (attempt < 4) {
      Atomics.wait(retrySignal, 0, 0, 200 * (attempt + 1));
    }
  }
  throw new Error(`health probe failed after 5 attempts: ${lastDiagnostic}`);
}
