// One MCP server process driven through one corpus case: newline-delimited JSON over stdio, each
// step answered before the next is sent, so a request can name a file time the previous one wrote.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { GIT_ENV } from '../../../tests/differential/support/vault-fixtures.mjs';

const DEFAULT_STEP_TIMEOUT_MS = 90_000;
const EXIT_GRACE_MS = 8_000;

/**
 * Replaces `$VAULT` and `$PARENT` inside strings, a whole `$MTIME(<relative path>)` string by that
 * file's time, and a whole `$HEAD` string by the commit the vault's repository is at.
 */
export function resolveTokens(value, { vaultPath, parentPath }) {
  if (typeof value === 'string') {
    if (value === '$HEAD') {
      return execFileSync('git', ['-C', parentPath, 'rev-parse', 'HEAD'], { env: { ...process.env, ...GIT_ENV }, encoding: 'utf8' }).trim();
    }
    const whole = /^\$MTIME\((.+)\)$/.exec(value);
    if (whole) return statSync(path.join(vaultPath, whole[1])).mtimeMs;
    return value.replaceAll('$VAULT', vaultPath).replaceAll('$PARENT', parentPath);
  }
  if (Array.isArray(value)) return value.map((item) => resolveTokens(item, { vaultPath, parentPath }));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveTokens(v, { vaultPath, parentPath })]),
    );
  }
  return value;
}

function idKey(id) {
  return `${typeof id}:${JSON.stringify(id)}`;
}

/**
 * Runs one case against one server. Resolves with everything the comparison needs; never rejects
 * for a server misbehaviour (a timeout or a crash is a recorded outcome, not an exception).
 *
 * `onStepDone(stepIndex)` runs after each answered step, so the caller can stat the vault.
 */
export async function runSession({ server, steps, env, cwd, vaultPath, handshake, elicit, onStepDone }) {
  const child = spawn(server.command, server.args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const parentPath = path.dirname(vaultPath);
  const lines = [];
  const waiters = new Map();
  const answers = [];
  const serverMessages = [];
  const stderrChunks = [];
  let stdoutBuffer = Buffer.alloc(0);
  let exited = null;
  let stdinOpen = true;
  const exitPromise = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      exited = { code, signal };
      resolve(exited);
    });
    child.on('error', (error) => {
      exited = { code: null, signal: null, spawnError: error.code ?? String(error) };
      resolve(exited);
    });
  });
  child.stdin.on('error', () => {
    stdinOpen = false;
  });
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

  const send = (message) => {
    if (!stdinOpen || child.stdin.destroyed) return;
    child.stdin.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`);
  };

  const accept = (rawLine) => {
    lines.push(rawLine);
    let parsed;
    try {
      parsed = JSON.parse(rawLine);
    } catch {
      serverMessages.push({ kind: 'unparsed', raw: rawLine });
      return;
    }
    const isResponse = parsed && typeof parsed === 'object' && !('method' in parsed) && 'id' in parsed;
    if (isResponse) {
      const key = idKey(parsed.id);
      const waiting = waiters.get(key);
      if (waiting) {
        waiters.delete(key);
        waiting(rawLine);
      } else {
        serverMessages.push({ kind: 'unmatched-response', raw: rawLine });
      }
      return;
    }
    serverMessages.push({ kind: 'server-message', raw: rawLine });
    if (parsed && typeof parsed === 'object' && typeof parsed.method === 'string' && 'id' in parsed) {
      if (elicit === 'accept' || elicit === 'decline' || elicit === 'cancel') {
        send({ jsonrpc: '2.0', id: parsed.id, result: { action: elicit } });
      }
    }
  };

  child.stdout.on('data', (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    for (let end = stdoutBuffer.indexOf(0x0a); end >= 0; end = stdoutBuffer.indexOf(0x0a)) {
      accept(stdoutBuffer.subarray(0, end).toString('utf8'));
      stdoutBuffer = stdoutBuffer.subarray(end + 1);
    }
  });

  const waitFor = (id, timeoutMs) =>
    new Promise((resolve) => {
      const key = idKey(id);
      const timer = setTimeout(() => {
        waiters.delete(key);
        resolve(null);
      }, timeoutMs);
      waiters.set(key, (raw) => {
        clearTimeout(timer);
        resolve(raw);
      });
      exitPromise.then(() => {
        // Give already-read output a turn to arrive before calling the wait failed.
        setTimeout(() => {
          if (waiters.get(key)) {
            waiters.delete(key);
            clearTimeout(timer);
            resolve(null);
          }
        }, 50);
      });
    });

  const pending = new Map();
  const planned = [...steps];
  if (handshake) {
    planned.unshift({
      jsonrpc: '2.0',
      id: 'handshake',
      method: 'initialize',
      params: {
        protocolVersion: handshake.protocolVersion,
        capabilities: handshake.capabilities,
        clientInfo: { name: 'differential-harness', version: '1' },
      },
    });
  }

  for (let index = 0; index < planned.length; index += 1) {
    const step = planned[index];
    if (step.$ === 'close-stdin') {
      stdinOpen = false;
      child.stdin.end();
      answers.push({ step: index, directive: step.$ });
      continue;
    }
    if (step.$ === 'close-stdout') {
      child.stdout.destroy();
      answers.push({ step: index, directive: step.$ });
      continue;
    }
    if (step.$ === 'await') {
      const key = idKey(step.id);
      const held = pending.get(key);
      if (held) {
        pending.delete(key);
        const raw = await held.promise;
        answers.push({ step: held.step, id: held.message.id, request: held.message, response: raw, timedOut: raw === null });
        onStepDone?.(held.step);
      }
      continue;
    }
    if (step.$ === 'wait') {
      await new Promise((resolve) => setTimeout(resolve, step.ms ?? 100));
      continue;
    }
    if (step.$ === 'touch') {
      const target = path.join(vaultPath, step.path);
      const seconds = step.mtimeMs / 1000;
      utimesSync(target, seconds, seconds);
      continue;
    }
    if (step.$ === 'write-file') {
      mkdirSync(path.dirname(path.join(vaultPath, step.path)), { recursive: true });
      writeFileSync(path.join(vaultPath, step.path), step.text);
      continue;
    }
    if (step.$ === 'kill') {
      child.kill('SIGKILL');
      answers.push({ step: index, directive: step.$ });
      continue;
    }
    if (step.raw !== undefined) {
      send(step.raw);
      await new Promise((resolve) => setTimeout(resolve, step.settleMs ?? 150));
      answers.push({ step: index, raw: step.raw, response: null, settled: true });
      continue;
    }
    const message = resolveTokens(step, { vaultPath, parentPath });
    if (!('jsonrpc' in message)) message.jsonrpc = '2.0';
    if (step.notify) {
      const notification = { jsonrpc: '2.0', method: step.notify, params: message.params };
      send(notification);
      await new Promise((resolve) => setTimeout(resolve, step.settleMs ?? 50));
      continue;
    }
    if (!('id' in message)) {
      send(message);
      await new Promise((resolve) => setTimeout(resolve, step.settleMs ?? 50));
      continue;
    }
    if (step.noWait) {
      const promise = waitFor(message.id, step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS);
      pending.set(idKey(message.id), { step: index, message, promise });
      send(message);
      await new Promise((resolve) => setTimeout(resolve, step.settleMs ?? 100));
      continue;
    }
    send(message);
    const raw = await waitFor(message.id, step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS);
    answers.push({
      step: index,
      id: message.id,
      request: message,
      response: raw,
      timedOut: raw === null,
    });
    if (message.id === 'handshake') send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    onStepDone?.(index);
    if (raw === null && exited) break;
  }
  for (const held of pending.values()) {
    const raw = await Promise.race([held.promise, new Promise((resolve) => setTimeout(() => resolve(null), 4000))]);
    answers.push({ step: held.step, id: held.message.id, request: held.message, response: raw, timedOut: raw === null });
  }
  if (stdinOpen) {
    stdinOpen = false;
    child.stdin.end();
  }
  const timer = setTimeout(() => child.kill('SIGKILL'), EXIT_GRACE_MS);
  const exit = await exitPromise;
  clearTimeout(timer);
  const forced = exit.signal === 'SIGKILL' && !steps.some((step) => step.$ === 'kill');
  await new Promise((resolve) => setTimeout(resolve, 20));
  return {
    answers,
    serverMessages,
    stderr: Buffer.concat(stderrChunks).toString('utf8'),
    exit: { code: exit.code, signal: forced ? 'forced-after-timeout' : exit.signal, spawnError: exit.spawnError },
    rawLines: lines,
  };
}

export function existsCommand(command) {
  return path.isAbsolute(command) ? existsSync(command) : true;
}
