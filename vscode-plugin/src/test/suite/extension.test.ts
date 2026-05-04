/**
 * E2E smoke tests — run inside a headless VSCode instance via
 * `@vscode/test-electron`. These complement the pure-logic unit tests
 * (code-match / write-vault / mcp-client) by verifying the actual
 * VSCode integration: extension activation, command registration,
 * TreeView providers, configuration handling.
 *
 * GUI rendering itself can't be asserted from the extension host, but
 * everything *up to* the rendering can — and that's where most
 * regressions hide.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'wlsdks.oh-my-ontology-vscode';

suite('oh-my-ontology — VSCode integration', () => {
  suiteSetup(async function () {
    this.timeout(20000);
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} not found in development host`);
    await ext.activate();
    // Force the plugin to read the dogfood vault by setting the path.
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'workspace folder missing — runTests must launch with one');
    const vaultPath = path.join(folder.uri.fsPath, 'docs', 'ontology');
    await vscode.workspace
      .getConfiguration('oh-my-ontology')
      .update('vaultPath', vaultPath, vscode.ConfigurationTarget.Workspace);
    // Give the refresh debounce a moment.
    await new Promise((r) => setTimeout(r, 1000));
  });

  test('extension activates', () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext?.isActive, 'extension should be active after suiteSetup');
  });

  test('all commands registered', async () => {
    const required = [
      'ohMyOntology.refresh',
      'ohMyOntology.pickVault',
      'ohMyOntology.openNode',
      'ohMyOntology.openMatchedNode',
      'ohMyOntology.addConcept',
      'ohMyOntology.renameConcept',
      'ohMyOntology.mergeConcepts',
      'ohMyOntology.openBacklink',
    ];
    const all = await vscode.commands.getCommands(true);
    for (const cmd of required) {
      assert.ok(all.includes(cmd), `command ${cmd} not registered`);
    }
  });

  test('refresh command runs without throwing', async () => {
    await vscode.commands.executeCommand('ohMyOntology.refresh');
    // No exception = pass. The command is fire-and-forget — its side
    // effect is updating the tree provider, which we can't query
    // directly from here without a public test hook.
  });

  test('configuration schema exposes our settings', () => {
    const config = vscode.workspace.getConfiguration('oh-my-ontology');
    // `inspect` returns undefined when the key isn't declared at all.
    assert.ok(config.inspect('vaultPath'));
    assert.ok(config.inspect('useMcp'));
    assert.ok(config.inspect('mcpServerPath'));
    // Default for useMcp should be true (declared in package.json).
    assert.strictEqual(config.get('useMcp'), true);
  });

  test('package.json exposes the right contributes', () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    const pkg = ext!.packageJSON;
    assert.strictEqual(pkg.contributes.viewsContainers.activitybar[0].id, 'ohMyOntology');
    const views = pkg.contributes.views.ohMyOntology.map((v: { id: string }) => v.id);
    assert.ok(views.includes('ohMyOntology.tree'));
    assert.ok(views.includes('ohMyOntology.backlinks'));
  });
});
