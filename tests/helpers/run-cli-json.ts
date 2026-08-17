import { spawnSync } from "node:child_process";

const retrySignal = new Int32Array(new SharedArrayBuffer(4));

export function runCliJson<T>(args: string[], { cwd = process.cwd() } = {}): T {
  let lastDiagnostic = "CLI did not run";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const run = spawnSync(process.execPath, args, {
      cwd,
      encoding: "utf8",
      timeout: 60_000,
    });
    const stdout = run.stdout ?? "";
    // Atlas diagnosis commands intentionally use exit 1 for needs_attention
    // while still returning a complete machine-readable JSON payload.
    if (!run.error && run.signal == null && stdout.trim().length > 0) {
      try {
        return JSON.parse(stdout) as T;
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
  throw new Error(`CLI JSON probe failed after 5 attempts: ${lastDiagnostic}`);
}
