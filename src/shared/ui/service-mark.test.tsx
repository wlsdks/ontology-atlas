import { readFileSync } from 'node:fs';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ServiceMark, resolveServiceMark } from './service-mark';

/**
 * **The mark table is a permission ledger, not an icon set** (permissibility review, 2026-09-05).
 *
 * Simple Icons is CC0, so copyright was never what limited this. Trademark is: a mark may be
 * recoloured to `currentColor` at 20px only where its owner's published guideline permits
 * monochrome use to show an integration. One was read and permits it; the rest were removed
 * because their guidelines forbid modification or could not be verified, and **silence is not
 * permission**.
 *
 * So what this file guards is the ledger's shape rather than a count: an entry may only exist
 * beside a cited guideline, everything else falls back, and the matching that lets a re-added
 * entry work stays alive.
 */
describe('service marks — only what a read guideline permits', () => {
  it('ships the one mark whose guideline was read, and nothing else', () => {
    expect(resolveServiceMark('github', '/usr/local/bin/github-mcp-server stdio')).toBe('github');
    // Removed on 2026-09-05: guidelines forbid modification, or could not be verified.
    for (const [name, runs] of [
      ['notion', '/opt/homebrew/bin/npx -y @notionhq/notion-mcp-server'],
      ['linear', 'https://mcp.linear.app/mcp'],
      ['figma', 'https://mcp.figma.com/mcp'],
      ['sentry', 'https://mcp.sentry.dev/mcp'],
      ['jira', 'https://example.atlassian.net/mcp'],
      ['confluence', 'https://example.atlassian.net/wiki'],
      ['gitlab', '/usr/bin/gitlab-mcp'],
      ['gdrive', 'https://drive.google.com/mcp'],
      ['chrome-devtools', '/usr/bin/chrome-devtools-mcp'],
    ] as const) {
      expect(resolveServiceMark(name, runs), `${name} must not carry a mark`).toBeNull();
    }
  });

  it('matches on what actually runs, not only on the name a person invented', () => {
    // The row renamed `work-repos` still points at GitHub, and the command is the part that
    // cannot lie about it.
    expect(resolveServiceMark('work-repos', '/usr/local/bin/github-mcp-server stdio')).toBe(
      'github',
    );
    expect(resolveServiceMark('copilot', 'https://api.githubcopilot.com/mcp/')).toBe('github');
  });

  it('a fragment is specific enough that an ordinary path cannot contain it', () => {
    /*
     * The reason the removed Chrome entry could never have been the bare word `chrome`: fragments
     * are matched against the whole command line, so a connector run from a folder with that word
     * in its path would have worn somebody's logo. This keeps that rule live for whatever is added
     * next.
     */
    expect(resolveServiceMark('internal', '/Users/me/github-notes/bin/server')).toBe('github');
    expect(resolveServiceMark('internal', '/Users/me/chrome-tools/bin/server')).toBeNull();
    expect(resolveServiceMark('internal', '/Users/me/drive/bin/server')).toBeNull();
  });

  it('an unknown service is drawn as a connector, not as a hole', () => {
    render(<ServiceMark mark={resolveServiceMark('internal-tools', '/opt/bin/mcp')} />);
    expect(document.querySelector('[data-service-mark]')).toHaveAttribute(
      'data-service-mark',
      'fallback',
    );
  });

  it('a known service draws its own mark', () => {
    render(<ServiceMark mark={resolveServiceMark('github', 'gh')} />);
    expect(document.querySelector('[data-service-mark]')).toHaveAttribute(
      'data-service-mark',
      'github',
    );
    expect(document.querySelector('[data-mark-part="simple-icon"]')).not.toBeNull();
  });

  it('every shipped mark cites the guideline that permits it', () => {
    /*
     * The ledger's whole contract. A path added without the citation beside it is exactly the
     * assumption this review removed nine marks for, so the file is read rather than trusted:
     * each key in the table must appear in a comment carrying a URL and the date it was read.
     */
    const source = readFileSync('src/shared/ui/service-mark.tsx', 'utf8');
    const table = source.slice(
      source.indexOf('const SERVICE_MARK_PATHS'),
      source.indexOf('export type ServiceMarkName'),
    );
    expect(table.length, '표를 못 찾았다 — 이 시험이 공회전한다').toBeGreaterThan(200);
    const keys = [...table.matchAll(/^\s{2}([a-z][\w]*):/gm)].map((match) => match[1]);
    expect(keys.length, '마크가 하나도 없다').toBeGreaterThan(0);
    for (const key of keys) {
      const citation = new RegExp(`${key}[\\s\\S]{0,400}?https?://[\\S]+[\\s\\S]{0,200}?read \\d{4}-\\d{2}-\\d{2}`, 'i');
      expect(citation.test(table), `${key} 에 읽은 날짜와 가이드라인 주소가 없다`).toBe(true);
    }
  });
});
