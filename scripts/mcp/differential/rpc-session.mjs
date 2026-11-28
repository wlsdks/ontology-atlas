// One MCP server process driven through one corpus case: newline-delimited JSON over stdio, each
// step answered before the next is sent, so a request can name a file time the previous one wrote.
import { execFileSync, spawn } from 'node:child_process';
import {
  chmodSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync, truncateSync, utimesSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { nodeAtPath, parseOrdered } from './ordered-json.mjs';
import { GIT_ENV, HARDENED_GIT_ARGS, PLANTED_BASE_MS } from '../../../tests/differential/support/vault-fixtures.mjs';

const DEFAULT_STEP_TIMEOUT_MS = 90_000;
const EXIT_GRACE_MS = 8_000;
const SNAPSHOT_FD = 198;

/**
 * Replaces `$VAULT` and `$PARENT` inside strings and three whole-string forms:
 *   `$MTIME(<path inside the vault>)`  that file's modification time when the step is sent;
 *   `$ANSWER(<request id>, <path>)`    a number or string out of the answer already received for
 *                                      that request, so a client that echoes what the server told
 *                                      it (`result.structuredContent.mtime`) is what gets tested;
 *   `$HEAD`                            the commit the vault's repository is at.
 * An `$ANSWER` the answer cannot satisfy (a different server answered differently, so the field is
 * not there) is sent as null and noted in `context.unresolved`, which the caller reports.
 */
export function resolveTokens(value, context) {
  const { vaultPath, parentPath, answerFor, unresolved } = context;
  const unresolvable = (reason) => {
    unresolved?.push(reason);
    return null;
  };
  if (typeof value === 'string') {
    if (value === '$HEAD') {
      return execFileSync('git', ['-C', parentPath, 'rev-parse', 'HEAD'], { env: { ...process.env, ...GIT_ENV }, encoding: 'utf8' }).trim();
    }
    const whole = /^\$MTIME\((.+)\)$/.exec(value);
    if (whole) return statSync(path.join(vaultPath, whole[1])).mtimeMs;
    const answer = /^\$ANSWER\(\s*([^,]+?)\s*,\s*(.+?)\s*\)$/.exec(value);
    if (answer) {
      const raw = answerFor?.(JSON.parse(answer[1]));
      if (raw === undefined || raw === null) return unresolvable(`${value}: no answer was received for request ${answer[1]}`);
      const node = nodeAtPath(parseOrdered(raw), answer[2]);
      if (!node) return unresolvable(`${value}: the answer has nothing at ${answer[2]}`);
      if (node.t === 'num') return Number(node.text);
      if (node.t === 'str') return node.v;
      return unresolvable(`${value}: ${answer[2]} is neither a number nor a string`);
    }
    return value.replaceAll('$VAULT', vaultPath).replaceAll('$PARENT', parentPath);
  }
  if (Array.isArray(value)) return value.map((item) => resolveTokens(item, context));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTokens(v, context)]));
  }
  return value;
}

/** True once a file under `root` has a time later than any the harness plants, or a write's temporary file exists. */
function writeHasStarted(root) {
  const plantedCeiling = PLANTED_BASE_MS + 50_000_000_000;
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (entry.name.includes('.oatlas-tmp-')) return true;
    try {
      if (statSync(path.join(entry.parentPath, entry.name)).mtimeMs > plantedCeiling) return true;
    } catch {
      // renamed away between the listing and the stat: that is a write too.
      return true;
    }
  }
  return false;
}

function idKey(id) {
  return `${typeof id}:${JSON.stringify(id)}`;
}

/**
 * `{ text, bytes }` for one line of standard output: `text` as UTF-8, and `bytes` (the same line as
 * Latin-1, one character per byte) only when decoding lost something, so two servers that write
 * different invalid sequences still compare unequal.
 */
function decodeLine(buffer) {
  const text = buffer.toString('utf8');
  return { text, bytes: Buffer.from(text, 'utf8').equals(buffer) ? undefined : buffer.toString('latin1') };
}

/**
 * What a `write-file` step writes: `text`, or the bytes of `base64`, repeated `repeat` times.
 */
function fileContent(step) {
  const once = step.base64 !== undefined ? Buffer.from(step.base64, 'base64') : Buffer.from(step.text ?? '');
  return step.repeat === undefined ? once : Buffer.concat(Array.from({ length: step.repeat }, () => once));
}

/**
 * Runs one case against one server. Resolves with everything the comparison needs; never rejects
 * for a server misbehaviour (a timeout or a crash is a recorded outcome, not an exception).
 *
 * `onAnswer(answer)` runs when a step's answer arrives, before the next step is sent, so the caller
 * can stat the vault at that moment. `snapshotFd` is an open descriptor handed to the child as 198.
 */
export async function runSession({ server, steps, env, cwd, vaultPath, handshake, elicit, onAnswer, snapshotFd }) {
  const stdio = ['pipe', 'pipe', 'pipe'];
  if (snapshotFd !== undefined) {
    for (let index = 3; index < SNAPSHOT_FD; index += 1) stdio.push('ignore');
    stdio.push(snapshotFd);
  }
  const child = spawn(server.command, server.args, { cwd, env, stdio });
  const parentPath = path.dirname(vaultPath);
  const lines = [];
  const waiters = new Map();
  const answers = [];
  const answerText = new Map();
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
  const closePromise = new Promise((resolve) => child.on('close', resolve));
  child.stdin.on('error', () => {
    stdinOpen = false;
  });
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

  const send = (message) => {
    if (!stdinOpen || child.stdin.destroyed) return;
    child.stdin.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`);
  };

  const accept = (line) => {
    const { text, bytes } = decodeLine(line);
    lines.push(text);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      serverMessages.push({ kind: 'unparsed', raw: text, bytes });
      return;
    }
    const isResponse = parsed && typeof parsed === 'object' && !('method' in parsed) && 'id' in parsed;
    if (isResponse) {
      const key = idKey(parsed.id);
      const waiting = waiters.get(key);
      if (waiting) {
        waiters.delete(key);
        waiting({ text, bytes });
      } else {
        serverMessages.push({ kind: 'unmatched-response', raw: text, bytes });
      }
      return;
    }
    serverMessages.push({ kind: 'server-message', raw: text, bytes });
    if (parsed && typeof parsed === 'object' && typeof parsed.method === 'string' && 'id' in parsed) {
      if (elicit === 'accept' || elicit === 'decline' || elicit === 'cancel') {
        send({ jsonrpc: '2.0', id: parsed.id, result: { action: elicit } });
      }
    }
  };

  child.stdout.on('data', (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    for (let end = stdoutBuffer.indexOf(0x0a); end >= 0; end = stdoutBuffer.indexOf(0x0a)) {
      accept(stdoutBuffer.subarray(0, end));
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
      waiters.set(key, (received) => {
        clearTimeout(timer);
        resolve(received);
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

  const record = (index, message, received) => {
    const answer = {
      step: index,
      id: message.id,
      request: message,
      response: received ? received.text : null,
      responseBytes: received?.bytes,
      timedOut: received === null,
    };
    answers.push(answer);
    if (received) answerText.set(idKey(message.id), received.text);
    onAnswer?.(answer);
    return answer;
  };

  const unresolved = [];
  const tokenContext = { vaultPath, parentPath, answerFor: (id) => answerText.get(idKey(id)), unresolved };
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
      const held = pending.get(idKey(step.id));
      if (held) {
        pending.delete(idKey(step.id));
        record(held.step, held.message, await held.promise);
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
      writeFileSync(path.join(vaultPath, step.path), fileContent(step));
      // A `size` makes the file that long, a hole after what was written: a file past a read cap
      // costs the disk nothing.
      if (step.size !== undefined) truncateSync(path.join(vaultPath, step.path), step.size);
      continue;
    }
    if (step.$ === 'git') {
      // The repository's own git, run the way the harness reads it, in the folder that holds the
      // vault: a step plants a staged rename or the like between two requests.
      execFileSync('git', [...HARDENED_GIT_ARGS, '-C', parentPath, ...step.args], {
        env: { ...process.env, ...GIT_ENV },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      continue;
    }
    if (step.$ === 'mkdir') {
      mkdirSync(path.join(vaultPath, step.path), { recursive: true });
      continue;
    }
    if (step.$ === 'remove') {
      rmSync(path.join(vaultPath, step.path), { recursive: true, force: true });
      continue;
    }
    if (step.$ === 'symlink') {
      mkdirSync(path.dirname(path.join(vaultPath, step.path)), { recursive: true });
      symlinkSync(step.target, path.join(vaultPath, step.path));
      continue;
    }
    if (step.$ === 'chmod') {
      chmodSync(path.join(vaultPath, step.path), step.mode);
      continue;
    }
    if (step.$ === 'kill') {
      child.kill('SIGKILL');
      answers.push({ step: index, directive: step.$ });
      continue;
    }
    if (step.$ === 'kill-after-first-write') {
      // Polls the vault until a file carries a time later than any planted one (or a temporary
      // file of an atomic write shows), then kills at once: a kill in the middle of a batch.
      const deadline = Date.now() + (step.timeoutMs ?? 10_000);
      while (Date.now() < deadline && !writeHasStarted(vaultPath)) await new Promise((resolve) => setTimeout(resolve, 1));
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
    const message = resolveTokens(step, tokenContext);
    delete message.timeoutMs;
    delete message.settleMs;
    delete message.noWait;
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
    const received = await waitFor(message.id, step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS);
    record(index, message, received);
    if (message.id === 'handshake') send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    if (received === null && exited) break;
  }
  for (const held of pending.values()) {
    const received = await Promise.race([held.promise, new Promise((resolve) => setTimeout(() => resolve(null), 4000))]);
    record(held.step, held.message, received);
  }
  if (stdinOpen) {
    stdinOpen = false;
    child.stdin.end();
  }
  const timer = setTimeout(() => child.kill('SIGKILL'), EXIT_GRACE_MS);
  const exit = await exitPromise;
  clearTimeout(timer);
  const forced = exit.signal === 'SIGKILL' && !steps.some((step) => step.$ === 'kill');
  await Promise.race([closePromise, new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (stdoutBuffer.length > 0) {
    const { text, bytes } = decodeLine(stdoutBuffer);
    serverMessages.push({ kind: 'unterminated', raw: text, bytes });
  }
  return {
    answers,
    serverMessages,
    stderr: Buffer.concat(stderrChunks).toString('utf8'),
    exit: { code: exit.code, signal: forced ? 'forced-after-timeout' : exit.signal, spawnError: exit.spawnError },
    rawLines: lines,
    unresolved,
  };
}
