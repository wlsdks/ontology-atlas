// Test-only: a server that is the JavaScript server with one deliberate difference, so a test can
// prove the harness notices it. It starts the real server as a child, passes standard input
// through, and changes one thing about the answer to one request.
//
//   node planted-difference-server.mjs --kind=<kind> --id=<request id> [--file=<vault file>]
//
// Kinds: text-byte, description-char, key-order, number-format, missing-field, extra-field,
// error-code, frontmatter-key-order (rewrites a file the answered write left on disk).
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
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
const targetId = JSON.parse(options.id);

const child = spawn(
  process.execPath,
  ['--import', path.join(here, 'deterministic-preload.mjs'), path.join(repoRoot, 'mcp', 'src', 'index.js')],
  { stdio: ['pipe', 'pipe', 'inherit'], env: process.env, cwd: process.cwd() },
);
process.stdin.pipe(child.stdin);

function mutate(line) {
  const message = JSON.parse(line);
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
      const head = line.slice(0, marker);
      const tail = line.slice(marker).replace(/:(\d+)([,}])/, ':$1.0$2');
      return `${head}${tail}`;
    }
    case 'missing-field': {
      const keys = Object.keys(result.structuredContent);
      delete result.structuredContent[keys.at(-1)];
      return JSON.stringify(message);
    }
    case 'extra-field':
      result.structuredContent.plantedExtra = 1;
      return JSON.stringify(message);
    case 'error-code':
      result.structuredContent.errorCode = 'planted_error';
      return JSON.stringify(message);
    case 'frontmatter-key-order': {
      const file = path.join(process.env.OATLAS_VAULT, options.file);
      const lines = readFileSync(file, 'utf8').split('\n');
      [lines[2], lines[3]] = [lines[3], lines[2]];
      // The rewritten file keeps the exact time the server reported, so the only difference
      // the harness can see is the order of the keys.
      const rewritten = `${file}.planted`;
      writeFileSync(rewritten, lines.join('\n'));
      spawnSync('touch', ['-r', file, rewritten]);
      renameSync(rewritten, file);
      return line;
    }
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
    process.stdout.write(`${mutate(line)}\n`);
  }
});
child.on('exit', (code) => process.exit(code ?? 1));
