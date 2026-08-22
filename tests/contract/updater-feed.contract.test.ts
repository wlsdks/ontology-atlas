import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('installed-app updater feed', () => {
  it('publishes one stable Pages manifest before upload and points Tauri at it', () => {
    const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
    const endpoints = tauri.plugins?.updater?.endpoints;
    expect(endpoints, 'updater endpoint census is empty').toHaveLength(1);
    expect(endpoints[0]).toBe(
      'https://wlsdks.github.io/ontology-atlas/update/latest.json',
    );

    const workflow = read('.github/workflows/deploy-pages.yml');
    const buildAt = workflow.indexOf('pnpm build');
    const stageAt = workflow.indexOf('pnpm desktop:stage-hosted-updater');
    const uploadAt = workflow.indexOf('actions/upload-pages-artifact@');
    expect(buildAt, 'Pages build step is missing').toBeGreaterThan(-1);
    expect(stageAt, 'updater manifest staging is missing').toBeGreaterThan(buildAt);
    expect(uploadAt, 'Pages artifact upload is missing').toBeGreaterThan(stageAt);

    const packageJson = JSON.parse(read('package.json'));
    expect(packageJson.scripts?.['desktop:stage-hosted-updater']).toContain(
      'out/update/latest.json',
    );
    expect(read('scripts/check-hosted-download-surface.mjs')).toContain(
      '/update/latest.json',
    );
  });
});
