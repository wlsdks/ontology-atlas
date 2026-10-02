import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_CONTENT_SECURITY_POLICY } from '@/shared/config/web-content-security-policy';
import {
  OUTBOUND_DESTINATION_PLACEHOLDERS,
  OUTBOUND_HOST_EXCEPTIONS,
  OUTBOUND_PATHS,
  WEB_OUTBOUND_PATHS,
} from '@/widgets/app-settings-menu/model/outbound-paths';

const ROOT = process.cwd();
const RUST_ROOT = join(ROOT, 'src-tauri/src');
const HOST_PATTERN = /https:\/\/([a-z0-9.-]+)/gi;
const LOCAL_SOURCES = new Set(["'self'", "'none'", 'ipc:', 'http://ipc.localhost', 'blob:', 'data:']);

function rustFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return rustFiles(path);
    return entry.name.endsWith('.rs') ? [path] : [];
  });
}

function isTestModuleFile(path: string): boolean {
  const name = relative(RUST_ROOT, path).replace(/\.rs$/, '');
  const parent = name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : null;
  const leaf = name.slice(name.lastIndexOf('/') + 1);
  if (!parent) return false;
  const parentSource = readFileSync(join(RUST_ROOT, `${parent}.rs`), 'utf8');
  return new RegExp(`#\\[cfg\\(test\\)\\]\\s*(?:pub(?:\\([a-z]+\\))?\\s+)?mod\\s+${leaf}\\s*;`).test(parentSource);
}

function productionRustHosts(): Map<string, string[]> {
  const hosts = new Map<string, string[]>();
  for (const file of rustFiles(RUST_ROOT)) {
    if (isTestModuleFile(file)) continue;
    const source = readFileSync(file, 'utf8');
    const production = source.split('#[cfg(test)]')[0] ?? '';
    for (const match of production.matchAll(HOST_PATTERN)) {
      const host = match[1]!.toLowerCase();
      hosts.set(host, [...(hosts.get(host) ?? []), relative(ROOT, file)]);
    }
  }
  return hosts;
}

function updaterHosts(): string[] {
  const config = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8')) as {
    plugins?: { updater?: { endpoints?: string[] } };
  };
  const endpoints = (config.plugins?.updater?.endpoints ?? []).map((endpoint) => new URL(endpoint).hostname);
  const manifest = readFileSync(join(ROOT, 'scripts/build-updater-manifest.mjs'), 'utf8');
  const archives = [...manifest.matchAll(HOST_PATTERN)].map((match) => match[1]!.toLowerCase());
  expect(archives.length, 'the updater manifest names no archive host').toBeGreaterThan(0);
  return [...new Set([...endpoints, ...archives])];
}

function scannedHosts(): Set<string> {
  return new Set([...productionRustHosts().keys(), ...updaterHosts()]);
}

const placeholders = new Set<string>(OUTBOUND_DESTINATION_PLACEHOLDERS);
const allRows = [...OUTBOUND_PATHS, ...WEB_OUTBOUND_PATHS];
const rowHosts = new Set(allRows.flatMap((row) => row.hosts).filter((host) => !placeholders.has(host)));
const exceptedHosts = new Set(OUTBOUND_HOST_EXCEPTIONS.map((exception) => exception.host));

function remoteSources(policy: Map<string, string[]>, directive: string): string[] {
  const sources = policy.get(directive) ?? policy.get('default-src') ?? [];
  return sources.filter((source) => !LOCAL_SOURCES.has(source));
}

function parseCsp(entries: [string, string][]): Map<string, string[]> {
  return new Map(entries.map(([name, value]) => [name, value.trim().split(/\s+/)]));
}

describe('outbound inventory', () => {
  it('scans real production hosts, so an empty scan cannot pass', () => {
    expect(updaterHosts().length).toBeGreaterThan(0);
    expect(productionRustHosts().size).toBeGreaterThan(0);
  });

  it('lists every production https host and updater endpoint, or names why not', () => {
    const missing = [...productionRustHosts()]
      .filter(([host]) => !rowHosts.has(host) && !exceptedHosts.has(host))
      .map(([host, files]) => `${host} (${[...new Set(files)].join(', ')})`);
    const missingUpdater = updaterHosts().filter((host) => !rowHosts.has(host) && !exceptedHosts.has(host));
    expect([...missing, ...missingUpdater]).toEqual([]);
  });

  it('names no host that the scan cannot see', () => {
    const scanned = scannedHosts();
    expect([...rowHosts].filter((host) => !scanned.has(host))).toEqual([]);
    expect([...exceptedHosts].filter((host) => !scanned.has(host))).toEqual([]);
  });

  it('gives every exception a reason and keeps ids unique', () => {
    for (const exception of OUTBOUND_HOST_EXCEPTIONS) expect(exception.reason.trim()).not.toBe('');
    const ids = allRows.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists package downloads whenever an agent adapter launches through npx or uvx', () => {
    const registry = JSON.parse(readFileSync(join(RUST_ROOT, 'acp-registry.json'), 'utf8')) as {
      agents?: { launch?: { kind?: string } }[];
    };
    const kinds = new Set((registry.agents ?? []).map((agent) => agent.launch?.kind));
    expect(kinds.size).toBeGreaterThan(0);
    const adapter = OUTBOUND_PATHS.find((row) => row.id === 'adapter-packages');
    if (kinds.has('npx') || kinds.has('uvx')) expect(adapter).toBeDefined();
    if (kinds.has('npx')) expect(adapter?.hosts).toContain('npm-registry');
    if (kinds.has('uvx')) expect(adapter?.hosts).toContain('python-package-index');
  });

  it('lets no screen fetch or load an image from a remote origin', () => {
    const tauri = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8')) as {
      app: { security: { csp: Record<string, string> } };
    };
    const web = parseCsp(
      WEB_CONTENT_SECURITY_POLICY.split(';').map((part) => {
        const [name, ...sources] = part.trim().split(/\s+/);
        return [name!, sources.join(' ')] as [string, string];
      }),
    );
    const desktop = parseCsp(Object.entries(tauri.app.security.csp));
    for (const policy of [web, desktop]) {
      expect(remoteSources(policy, 'connect-src')).toEqual([]);
      expect(remoteSources(policy, 'img-src')).toEqual([]);
    }
  });
});
