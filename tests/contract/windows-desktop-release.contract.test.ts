import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Windows desktop beta release contract', () => {
  it('builds, audits, scans, installs, launches, and stages on a native Windows runner', () => {
    const releaseWorkflow = read('.github/workflows/release-macos.yml');
    const pullRequestWorkflow = read('.github/workflows/windows-beta-check.yml');
    const workflow = `${releaseWorkflow}\n${pullRequestWorkflow}`;

    expect(releaseWorkflow).toContain('build-windows:');
    expect(releaseWorkflow).not.toContain('pull_request:');
    expect(pullRequestWorkflow).toContain('pull_request:');
    expect(pullRequestWorkflow).not.toContain('secrets.');
    expect(workflow).toContain('runs-on: windows-2022');
    expect(workflow).toContain('rustsec/audit-check@69366f33c96575abad1ee0dba8212993eecbe998');
    expect(workflow).toContain('Get-AuthenticodeSignature');
    expect(workflow).toContain('MpCmdRun.exe');
    expect(workflow).toContain("-ArgumentList '/S'");
    expect(workflow).toContain('verify-mcp-binary.mjs');
    expect(workflow).toContain('ontology-atlas-windows-x64');
    expect(workflow).toContain('(Get-Content package.json | ConvertFrom-Json).version');
    expect(releaseWorkflow).toContain('needs: [build-macos, build-windows]');
  });

  it('keeps the Windows sidecar and credential store native to Windows', () => {
    const sidecar = read('scripts/lib/mcp-binary.mjs');
    const cargo = read('src-tauri/Cargo.toml');
    const rustBridge = read('src-tauri/src/agent_setup.rs');

    expect(sidecar).toContain("'x86_64-pc-windows-msvc': 'bun-windows-x64'");
    expect(cargo).toContain("[target.'cfg(target_os = \"windows\")'.dependencies]");
    expect(cargo).toContain('features = ["windows-native"]');
    expect(rustBridge).toContain('"ontology-atlas-mcp.exe"');
  });

  it('publishes Windows facts only from the real release asset and checksum pair', () => {
    const generator = read('scripts/generate-download-release-facts.mjs');
    const generated = read('src/views/download/model/macos-release.generated.ts');

    expect(generator).toContain('WINDOWS_NAME_PATTERN');
    expect(generator).toContain("asset.name.endsWith('.exe.sha256')");
    expect(generator).toContain('exactly one ontology-atlas_<version>_windows_x64-setup.exe');
    expect(generated).toContain('export const WINDOWS_RELEASE');
  });
});
