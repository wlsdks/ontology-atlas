import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AGENTS_MODELS_HREF,
  DESTINATION_HREF,
  MCP_CONNECTORS_HREF,
} from '@/shared/config/destinations';
import { SETTINGS_CATALOG } from '@/widgets/app-settings-menu/model/catalog';
import { SETTINGS_SECTION_SCOPE } from '@/widgets/app-settings-menu/model/catalog/types';
import { SETTINGS_SECTIONS } from '@/widgets/app-settings-menu/model/settings-sections';

const UI = 'src/widgets/app-settings-menu/ui';

const EXPECTED_IDS = {
  screen: ['language', 'view-mode', 'type-size', 'concept-icons', 'motion', 'screen-guides'],
  map: ['canvas-background', 'pan-speed', 'zoom-speed', 'index-default', 'frame-meter'],
  expand: ['expand-affordance', 'expand-structure', 'expand-counts'],
  footprint: ['footprint-strength', 'footprint-detail'],
  notify: ['work-in-progress', 'notifications', 'notification-kinds'],
  agents: ['wiki-write-mode', 'door-coding-tools', 'door-models', 'door-mcp'],
  privacy: ['outbound', 'allowances', 'recent-folders'],
  workspace: [
    'folder',
    'folder-path',
    'folder-shape',
    'folder-documents',
    'folder-import',
    'folder-connectors',
    'folder-schedules',
    'folder-git',
    'folder-project-sources',
  ],
  about: [
    'version',
    'update-check',
    'update-auto',
    'whats-new',
    'keyboard-shortcuts',
    'source',
    'licences',
    'diagnostics',
    'logs',
  ],
} as const;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function anchoredIds(): Set<string> {
  const ids = new Set<string>();
  for (const file of sourceFiles(UI)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:settingId|data-setting-id)="([a-z-]+)"/g)) ids.add(match[1]!);
  }
  return ids;
}

type Catalog = Record<string, unknown>;

function catalog(locale: string): Catalog {
  const dir = join('messages', locale);
  return Object.fromEntries(
    readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => [name.slice(0, -5), JSON.parse(readFileSync(join(dir, name), 'utf8')) as unknown]),
  );
}

function at(messages: Catalog, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, key) => (node && typeof node === 'object' ? (node as Catalog)[key] : undefined),
    messages,
  );
}

function knownHref(href: string): boolean {
  const named: string[] = [...Object.values(DESTINATION_HREF), AGENTS_MODELS_HREF, MCP_CONNECTORS_HREF];
  if (named.includes(href)) return true;
  const segment = href.split(/[/?#]/).find(Boolean);
  return segment !== undefined && existsSync(join('app', '[locale]', segment, 'page.tsx'));
}

describe('settings catalog', () => {
  it('lists exactly the planned ids, section by section', () => {
    for (const section of SETTINGS_SECTIONS) {
      const ids = SETTINGS_CATALOG.filter((entry) => entry.section === section).map((entry) => entry.id);
      expect(ids, section).toEqual(EXPECTED_IDS[section]);
    }
    expect(SETTINGS_CATALOG).toHaveLength(Object.values(EXPECTED_IDS).flat().length);
  });

  it('matches the rows the panes anchor, both ways', () => {
    const anchored = anchoredIds();
    expect(anchored.size).toBeGreaterThan(30);
    const listed = new Set(SETTINGS_CATALOG.map((entry) => entry.id));
    expect([...listed].filter((id) => !anchored.has(id)), 'catalog entries no pane draws').toEqual([]);
    expect([...anchored].filter((id) => !listed.has(id)), 'anchored rows missing from the catalog').toEqual([]);
  });

  it.each(['en', 'ko'])('resolves every label, keyword and section sentence in %s', (locale) => {
    const messages = catalog(locale);
    const missing: string[] = [];
    for (const entry of SETTINGS_CATALOG) {
      for (const key of [entry.labelKey, entry.keywordsKey]) {
        if (key !== undefined && typeof at(messages, key) !== 'string') missing.push(key);
      }
    }
    for (const section of SETTINGS_SECTIONS) {
      for (const key of [
        `nav.settingsMenu.section.${section}`,
        `nav.settingsMenu.sectionPurpose.${section}`,
        `nav.settingsMenu.scope.${SETTINGS_SECTION_SCOPE[section]}`,
      ]) {
        if (typeof at(messages, key) !== 'string') missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });

  it('sends every door to a known destination', () => {
    const doors = SETTINGS_CATALOG.filter((entry) => entry.href !== undefined);
    expect(doors.length).toBeGreaterThan(3);
    expect(doors.filter((entry) => !knownHref(entry.href!)).map((entry) => entry.id)).toEqual([]);
  });
});
