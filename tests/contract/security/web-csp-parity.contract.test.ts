import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_CONTENT_SECURITY_POLICY } from '@/shared/config/web-content-security-policy';

const FETCH_DIRECTIVES = new Set([
  'child-src', 'connect-src', 'font-src', 'frame-src', 'img-src', 'manifest-src', 'media-src',
  'object-src', 'script-src', 'style-src', 'worker-src',
]);

function parse(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name, sources);
  }
  return directives;
}

function allowed(policy: Map<string, string[]>, directive: string): string[] | null {
  return policy.get(directive) ?? (FETCH_DIRECTIVES.has(directive) ? (policy.get('default-src') ?? null) : null);
}

const web = parse(WEB_CONTENT_SECURITY_POLICY);
const app = JSON.parse(readFileSync(join(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8')).app.security.csp as Record<
  string,
  string
>;

describe('the web policy beside the app policy', () => {
  it('allows every source the app allows, since both apply inside the app', () => {
    const narrowed: string[] = [];
    for (const [directive, sources] of Object.entries(app)) {
      const webSources = allowed(web, directive);
      for (const source of sources.split(/\s+/).filter(Boolean)) {
        if (webSources && !webSources.includes(source)) narrowed.push(`${directive} ${source}`);
      }
    }
    expect(narrowed).toEqual([]);
  });

  it('keeps images, connections, plugins, the base and form targets at home', () => {
    expect(web.get('img-src')).toEqual(["'self'", 'blob:', 'data:']);
    expect(web.get('connect-src')).toEqual(["'self'", 'ipc:', 'http://ipc.localhost']);
    expect(web.get('object-src')).toEqual(["'none'"]);
    expect(web.get('base-uri')).toEqual(["'self'"]);
    expect(web.get('form-action')).toEqual(["'none'"]);
    expect(web.get('script-src')).not.toContain("'unsafe-eval'");
  });
});
