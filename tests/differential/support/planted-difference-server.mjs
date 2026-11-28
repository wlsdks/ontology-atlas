// Test-only: a server that is the JavaScript server with one deliberate difference, so a test can
// prove the harness notices it. It starts the real server as a child, passes standard input
// through, and changes one thing about what the child answers, writes or leaves behind.
//
//   node planted-difference-server.mjs --kind=<kind> [--id=<request id>] [--file=<path>]
//
// Kinds, by where the difference lies:
//   in an answer     text-byte, description-char, key-order, number-format, missing-field,
//                    extra-field, error-code, string-escape (same JSON, other escape),
//                    stale-mtime (an earlier answer's file time in a later one),
//                    secret-leak (a planted secret's marker in an answer)
//   in the envelope  jsonrpc-version, id-text (1 written as 1.0), result-and-error
//   around the answer  server-message, invalid-utf8, drop-answer, stderr
//   on exit          exit-code, trailing-output, frontmatter-key-order (rewrites a written file)
//   on disk          repository-state (a commit), file-time (a planted file's time), must-not-exist,
//                    outside-write (beside the case folder), home-write (in the home folder)
//
// `--id` is the request whose answer triggers the change (the first answer for kinds that act on
// exit). Nothing here depends on a command such as `touch`, so it runs on Windows as well.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const options = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const match = /^--([^=]+)=(.*)$/.exec(argument);
    return [match[1], match[2]];
  }),
);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const targetId = options.id === undefined ? undefined : JSON.parse(options.id);

const child = spawn(
  process.execPath,
  ['--import', path.join(here, 'deterministic-preload.mjs'), path.join(repoRoot, 'mcp', 'src', 'javascript-server.mjs')],
  { stdio: ['pipe', 'pipe', 'inherit'], env: process.env, cwd: process.cwd() },
);
process.stdin.pipe(child.stdin);

let lastReportedMtime = null;

/** @returns {string | null} the line to forward, or null to drop it */
function mutate(line) {
  const message = JSON.parse(line);
  const reported = message.result?.structuredContent?.mtime;
  const previouslyReported = lastReportedMtime;
  if (typeof reported === 'number') lastReportedMtime = reported;
  if (message.id !== targetId) return line;
  const result = message.result ?? {};
  switch (options.kind) {
    case 'text-byte': {
      const text = result.content[0].text;
      const at = text.search(/[a-z]/);
      result.content[0].text = `${text.slice(0, at)}${text[at].toUpperCase()}${text.slice(at + 1)}`;
      return JSON.stringify(message);
    }
    case 'description-char': {
      const tool = result.tools[0];
      tool.description = `${tool.description.slice(0, 1)}${tool.description[1] === 'x' ? 'y' : 'x'}${tool.description.slice(2)}`;
      return JSON.stringify(message);
    }
    case 'key-order': {
      const entries = Object.entries(result.structuredContent);
      [entries[0], entries[1]] = [entries[1], entries[0]];
      result.structuredContent = Object.fromEntries(entries);
      return JSON.stringify(message);
    }
    case 'number-format': {
      const marker = line.indexOf('"structuredContent":');
      return `${line.slice(0, marker)}${line.slice(marker).replace(/:(\d+)([,}])/, ':$1.0$2')}`;
    }
    case 'missing-field':
      delete result.structuredContent[Object.keys(result.structuredContent).at(-1)];
      return JSON.stringify(message);
    case 'extra-field':
      result.structuredContent.plantedExtra = 1;
      return JSON.stringify(message);
    case 'error-code':
      result.structuredContent.errorCode = 'planted_error';
      return JSON.stringify(message);
    case 'secret-leak':
      result.content[0].text = `${result.content[0].text} SECRET-SENTINEL-planted`;
      return JSON.stringify(message);
    case 'string-escape':
      return line.replace(/(?<!\\)\\n/, '\\u000a');
    case 'stale-mtime':
      if (typeof reported === 'number' && previouslyReported !== null) {
        return line.replace(`"mtime":${reported}`, `"mtime":${previouslyReported}`);
      }
      throw new Error('stale-mtime needs an earlier answer that reported a time');
    case 'jsonrpc-version':
      return line.replace('"jsonrpc":"2.0"', '"jsonrpc":"2.1"');
    case 'id-text':
      return line.replace(/"id":(\d+)\}$/, '"id":$1.0}');
    case 'result-and-error':
      return line.replace(/^\{/, '{"error":{"code":-32603,"message":"planted"},');
    case 'server-message':
      return `{"jsonrpc":"2.0","method":"notifications/planted"}\n${line}`;
    case 'invalid-utf8':
      process.stdout.write(Buffer.from([0xff, 0xfe, 0x0a]));
      return line;
    case 'drop-answer':
      return null;
    case 'stderr':
      process.stderr.write('planted\n');
      return line;
    case 'repository-state':
      execFileSync('git', ['-c', 'user.name=planted', '-c', 'user.email=planted@example.invalid', 'commit', '--allow-empty', '--quiet', '-m', 'planted'], {
        cwd: path.dirname(process.env.OATLAS_VAULT),
        stdio: 'ignore',
      });
      return line;
    case 'file-time':
      utimesSync(path.join(process.env.OATLAS_VAULT, options.file), 5, 5);
      return line;
    case 'must-not-exist':
      writeFileSync(path.join(process.cwd(), options.file), 'ran');
      return line;
    case 'outside-write':
      writeFileSync(path.join(path.dirname(process.env.HOME), 'stray.txt'), 'x');
      return line;
    case 'home-write':
      writeFileSync(path.join(process.env.HOME, 'planted.txt'), 'x');
      return line;
    case 'exit-code':
    case 'trailing-output':
    case 'frontmatter-key-order':
      return line;
    default:
      throw new Error(`unknown kind ${options.kind}`);
  }
}

let pending = '';
child.stdout.on('data', (chunk) => {
  pending += chunk.toString('utf8');
  for (let end = pending.indexOf('\n'); end >= 0; end = pending.indexOf('\n')) {
    const line = pending.slice(0, end);
    pending = pending.slice(end + 1);
    const forwarded = mutate(line);
    if (forwarded !== null) process.stdout.write(`${forwarded}\n`);
  }
});
child.on('exit', (code) => {
  // The time a file keeps is not compared, so a rewrite after the last answer changes only the bytes.
  if (options.kind === 'frontmatter-key-order') {
    const file = path.join(process.env.OATLAS_VAULT, options.file);
    const lines = readFileSync(file, 'utf8').split('\n');
    [lines[2], lines[3]] = [lines[3], lines[2]];
    writeFileSync(file, lines.join('\n'));
  }
  const finish = () => process.exit(options.kind === 'exit-code' ? 3 : (code ?? 1));
  if (options.kind === 'trailing-output') process.stdout.write('{"jsonrpc":"2.0","method":"notifications/unfinished"', finish);
  else finish();
});
