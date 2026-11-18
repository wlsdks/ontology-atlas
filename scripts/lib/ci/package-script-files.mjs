import { existsSync, readFileSync } from 'node:fs';

const REPOSITORY_CODE = /(?:^|[\s"'=])((?:scripts|mcp|cli|tests)\/[\w./-]+\.[cm]?[jt]s)(?=$|[\s"';&|)])/g;

/**
 * The repository code files the named `package.json` scripts run, following `pnpm <script>` to
 * the scripts it calls. Only what a command names: the caller follows imports.
 */
export function packageScriptFiles(names, root = '.') {
  const path = `${root}/package.json`;
  const scripts = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).scripts ?? {} : {};
  const files = new Set();
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name) || typeof scripts[name] !== 'string') return;
    seen.add(name);
    for (const match of scripts[name].matchAll(/\bpnpm (?:run )?([\w:.-]+)/g)) visit(match[1]);
    for (const match of scripts[name].matchAll(REPOSITORY_CODE)) files.add(match[1]);
  };
  for (const name of names) visit(name);
  return [...files].sort();
}
