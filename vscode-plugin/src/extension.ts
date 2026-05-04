import * as vscode from 'vscode';
import { walkVault, VaultNode } from './walk-vault';
import { OntologyTreeProvider } from './tree-provider';

const STORAGE_VAULT_KEY = 'oh-my-ontology.vaultPath';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const treeProvider = new OntologyTreeProvider();
  vscode.window.registerTreeDataProvider('ohMyOntology.tree', treeProvider);

  const refresh = async (): Promise<void> => {
    const vaultPath = await resolveVaultPath(context);
    if (!vaultPath) {
      treeProvider.setNodes([]);
      return;
    }
    try {
      const nodes = await walkVault(vaultPath);
      treeProvider.setNodes(nodes);
      vscode.window.setStatusBarMessage(
        `oh-my-ontology: ${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'} from ${vaultPath}`,
        4000,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`oh-my-ontology: ${msg}`);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('ohMyOntology.refresh', refresh),
    vscode.commands.registerCommand('ohMyOntology.pickVault', async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Pick ontology vault folder',
      });
      if (!picked || picked.length === 0) return;
      await context.globalState.update(STORAGE_VAULT_KEY, picked[0].fsPath);
      await refresh();
    }),
    vscode.commands.registerCommand(
      'ohMyOntology.openNode',
      async (node: VaultNode) => {
        if (!node?.filePath) return;
        const doc = await vscode.workspace.openTextDocument(node.filePath);
        await vscode.window.showTextDocument(doc);
      },
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('oh-my-ontology.vaultPath')) {
        void refresh();
      }
    }),
  );

  await refresh();
}

export function deactivate(): void {
  // no-op
}

async function resolveVaultPath(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('oh-my-ontology');
  const fromConfig = (config.get<string>('vaultPath') ?? '').trim();
  if (fromConfig) return fromConfig;

  const fromState = context.globalState.get<string>(STORAGE_VAULT_KEY);
  if (fromState) return fromState;

  // Auto-detect: workspace folder with `docs/ontology/` or `.md` with `kind:` frontmatter
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    const candidate = vscode.Uri.joinPath(folders[0].uri, 'docs', 'ontology');
    try {
      const stat = await vscode.workspace.fs.stat(candidate);
      if (stat.type === vscode.FileType.Directory) {
        return candidate.fsPath;
      }
    } catch {
      // not a dogfood-shaped repo — fine
    }
  }
  return undefined;
}
