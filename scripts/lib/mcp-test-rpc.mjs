import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

function idKey(id) {
  return `${typeof id}:${JSON.stringify(id)}`;
}

function expectedResponseCounts(requests) {
  const counts = new Map();
  for (const request of requests) {
    if (!Object.hasOwn(request, 'id')) continue;
    const key = idKey(request.id);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function missingResponseIds(expected, received) {
  const missing = [];
  for (const [key, count] of expected) {
    const remaining = count - (received.get(key) ?? 0);
    for (let index = 0; index < remaining; index += 1) missing.push(key);
  }
  return missing;
}

export function runJsonRpcProcess({
  command,
  args = [],
  env,
  requests,
  timeoutMs = 1500,
  killGraceMs = 500,
  spawnImpl = spawn,
}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    const expected = expectedResponseCounts(requests);
    const received = new Map();
    const responses = [];
    let stdoutRemainder = '';
    let stderr = '';
    let stdinClosed = false;
    let timedOut = false;
    let spawnError = null;
    let killTimer = null;

    const closeInput = () => {
      if (stdinClosed || child.stdin.destroyed) return;
      stdinClosed = true;
      child.stdin.end();
    };

    const complete = () => missingResponseIds(expected, received).length === 0;

    const acceptLine = (line) => {
      if (!line) return;
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        return;
      }
      responses.push(value);
      if (!Object.hasOwn(value, 'id')) return;
      const key = idKey(value.id);
      if (!expected.has(key)) return;
      received.set(key, (received.get(key) ?? 0) + 1);
      if (complete()) closeInput();
    };

    const acceptStdout = (text, flush = false) => {
      stdoutRemainder += text;
      const lines = stdoutRemainder.split('\n');
      const tail = lines.pop() ?? '';
      stdoutRemainder = flush ? '' : tail;
      for (const line of lines) acceptLine(line);
      if (flush && tail) acceptLine(tail);
    };

    child.stdout.on('data', (chunk) => acceptStdout(stdoutDecoder.write(chunk)));
    child.stderr.on('data', (chunk) => { stderr += stderrDecoder.write(chunk); });
    child.stdin.on('error', (error) => { spawnError ??= error; });
    child.on('error', (error) => { spawnError ??= error; });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
    }, timeoutMs);

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      acceptStdout(stdoutDecoder.end(), true);
      stderr += stderrDecoder.end();
      const missing = missingResponseIds(expected, received);
      if (timedOut) {
        reject(new Error(`JSON-RPC subprocess timed out; missing responses: ${missing.join(', ') || 'none'}; stderr: ${stderr}`));
      } else if (spawnError) {
        reject(new Error(`JSON-RPC subprocess failed: ${spawnError.message}; stderr: ${stderr}`));
      } else if (code !== 0 || signal !== null) {
        reject(new Error(`JSON-RPC subprocess exited code=${code} signal=${signal}; stderr: ${stderr}`));
      } else if (missing.length > 0) {
        reject(new Error(`JSON-RPC subprocess exited before responses: ${missing.join(', ')}; stderr: ${stderr}`));
      } else {
        resolve({ responses, stderr });
      }
    });

    child.stdin.write(`${requests.map((request) => JSON.stringify(request)).join('\n')}\n`);
    if (expected.size === 0) closeInput();
  });
}
