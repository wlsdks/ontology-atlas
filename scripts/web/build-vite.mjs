#!/usr/bin/env node
// Builds everything Vite builds: the app's frontend and the website.
//   node scripts/web/build-vite.mjs
// The two share no output: the app goes to the desktop frontend folder, the website to the site folder, and
// the prerender needs only the website's client build. So they run side by side, and the prerender follows
// the website's own build instead of waiting for the app's. The data both read (`pnpm docs-vault:build` and
// `pnpm messages:build`, which read different folders) is built first, the two together.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const vite = resolve(repository, 'node_modules/vite/bin/vite.js');
const prerender = resolve(repository, 'scripts/web/site/prerender-site.mjs');
const docsVault = resolve(repository, 'scripts/docs-vault/build-docs-vault.mjs');
const messages = resolve(repository, 'scripts/i18n/build-messages.mjs');

/** One command from the repository root; resolves with its exit code, its output lines named by `label`. */
function run(label, script, args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: repository, stdio: ['ignore', 'pipe', 'pipe'] });
    const say = (stream, write) => {
      let rest = '';
      stream.setEncoding('utf8');
      stream.on('data', (text) => {
        const lines = (rest + text).split('\n');
        rest = lines.pop() ?? '';
        for (const line of lines) write(`[${label}] ${line}\n`);
      });
      stream.on('end', () => rest && write(`[${label}] ${rest}\n`));
    };
    say(child.stdout, (line) => process.stdout.write(line));
    say(child.stderr, (line) => process.stderr.write(line));
    child.on('error', (error) => {
      console.error(`[${label}] ${error.message}`);
      resolveRun(1);
    });
    child.on('close', (code) => resolveRun(code ?? 1));
  });
}

async function website() {
  const built = await run('site', vite, ['build', '--mode', 'site']);
  return built === 0 ? run('prerender', prerender, []) : built;
}

const data = await Promise.all([run('docs-vault', docsVault, []), run('messages', messages, [])]);
const codes = data.some((code) => code !== 0) ? data : await Promise.all([run('app', vite, ['build']), website()]);
process.exit(codes.find((code) => code !== 0) ?? 0);
