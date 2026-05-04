import * as path from 'path';
import * as vscode from 'vscode';
import { walkVault, VaultNode } from './walk-vault';
import { OntologyTreeProvider } from './tree-provider';
import { findOntologyMatch } from './code-match';
import { writeDoc, resolveSlug } from './write-vault';
import { McpClient } from './mcp-client';
import { Backlink, BacklinksProvider } from './backlinks-provider';

const STORAGE_VAULT_KEY = 'oh-my-ontology.vaultPath';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const treeProvider = new OntologyTreeProvider();
  vscode.window.registerTreeDataProvider('ohMyOntology.tree', treeProvider);

  // R13 #52 — Backlinks panel populated via MCP `find_backlinks`.
  const backlinksProvider = new BacklinksProvider();
  vscode.window.registerTreeDataProvider(
    'ohMyOntology.backlinks',
    backlinksProvider,
  );

  // R13 #50 — code↔ontology jump: surface the matching node for the active
  // editor in the status bar. Click → open the node's .md.
  // R13 #61 — informative even when no match (see updateMatchForActiveEditor).
  // The command is set per-state, not statically.
  const matchStatusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  context.subscriptions.push(matchStatusBar);

  let cachedNodes: VaultNode[] = [];
  let currentMatch: VaultNode | null = null;
  let mcpClient: McpClient | null = null;

  const updateMatchForActiveEditor = (): void => {
    const editor = vscode.window.activeTextEditor;
    const folders = vscode.workspace.workspaceFolders;

    // R13 #61 — informative status bar even when no node owns the active
    // file. Three states: (a) no vault picked → "pick a vault" hint,
    // (b) vault loaded but no match → dim "<N> nodes · no match" so the
    // developer sees the plugin is alive, (c) match → kind icon + title.
    if (!folders || folders.length === 0) {
      currentMatch = null;
      matchStatusBar.hide();
      backlinksProvider.clear();
      return;
    }
    if (cachedNodes.length === 0) {
      currentMatch = null;
      matchStatusBar.text = '$(folder-opened) oh-my-ontology';
      matchStatusBar.tooltip =
        'oh-my-ontology · no vault loaded.\nClick to pick a vault folder.';
      matchStatusBar.command = 'ohMyOntology.pickVault';
      matchStatusBar.show();
      backlinksProvider.clear();
      return;
    }
    if (!editor) {
      currentMatch = null;
      matchStatusBar.text = `$(circle-outline) oh-my-ontology · ${cachedNodes.length} nodes`;
      matchStatusBar.tooltip = `oh-my-ontology · ${cachedNodes.length} nodes loaded · no editor active.`;
      matchStatusBar.command = 'ohMyOntology.refresh';
      matchStatusBar.show();
      backlinksProvider.clear();
      return;
    }
    // Pick the workspace folder that owns the active document, fall back to first.
    const workspace =
      vscode.workspace.getWorkspaceFolder(editor.document.uri) ?? folders[0];
    const match = findOntologyMatch(
      workspace.uri.fsPath,
      editor.document.uri.fsPath,
      cachedNodes,
    );
    currentMatch = match;
    if (!match) {
      matchStatusBar.text = `$(circle-outline) oh-my-ontology · ${cachedNodes.length} nodes · no match`;
      matchStatusBar.tooltip = `oh-my-ontology · this file isn't owned by any ontology node.\n${cachedNodes.length} nodes loaded · click to refresh.`;
      matchStatusBar.command = 'ohMyOntology.refresh';
      matchStatusBar.show();
      backlinksProvider.clear();
      return;
    }
    const icon = iconForKind(match.kind);
    matchStatusBar.text = `${icon} ${match.title}`;
    matchStatusBar.tooltip = `oh-my-ontology · ${match.kind} · ${match.slug}\nClick to open ${match.slug}.md`;
    matchStatusBar.command = 'ohMyOntology.openMatchedNode';
    matchStatusBar.show();
    void loadBacklinksFor(match.slug);
  };

  /**
   * R13 #52 — fetch backlinks via MCP `find_backlinks`, fall back to a
   * naive in-process scan of cachedNodes if the MCP server is unavailable.
   */
  const loadBacklinksFor = async (slug: string): Promise<void> => {
    backlinksProvider.setLoading(slug);
    if (mcpClient && mcpClient.isReady()) {
      try {
        const result = (await mcpClient.callTool('find_backlinks', { slug })) as {
          total: number;
          matches: Array<{
            slug: string;
            kind: string;
            title?: string;
            matchedKeys?: string[];
          }>;
        };
        const items: Backlink[] = result.matches.map((m) => ({
          slug: m.slug,
          kind: m.kind,
          title: m.title ?? m.slug,
          matchedKeys: m.matchedKeys ?? [],
          filePath:
            cachedNodes.find((n) => n.slug === m.slug)?.filePath ?? '',
        }));
        backlinksProvider.setBacklinks(slug, items);
        return;
      } catch (err) {
        // fall through to filesystem fallback
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[oh-my-ontology] MCP find_backlinks failed: ${msg}`);
      }
    }
    // Fallback: scan cached nodes ourselves (raw match against frontmatter arrays).
    const items = computeBacklinksLocally(slug, cachedNodes);
    backlinksProvider.setBacklinks(slug, items);
  };

  const ensureMcpClient = async (vaultPath: string): Promise<void> => {
    const config = vscode.workspace.getConfiguration('oh-my-ontology');
    const useMcp = config.get<boolean>('useMcp', true);
    if (!useMcp) {
      if (mcpClient) {
        mcpClient.dispose();
        mcpClient = null;
      }
      return;
    }
    const serverEntry = resolveMcpServerEntry(config, context);
    if (!serverEntry) return;
    if (mcpClient) {
      mcpClient.dispose();
      mcpClient = null;
    }
    const client = new McpClient(serverEntry, vaultPath);
    try {
      await client.start(8000);
      mcpClient = client;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[oh-my-ontology] MCP start failed, fallback active: ${msg}`);
      client.dispose();
      mcpClient = null;
    }
  };

  const refresh = async (): Promise<void> => {
    const vaultPath = await resolveVaultPath(context);
    if (!vaultPath) {
      cachedNodes = [];
      treeProvider.setNodes([]);
      updateMatchForActiveEditor();
      return;
    }
    try {
      const nodes = await walkVault(vaultPath);
      cachedNodes = nodes;
      treeProvider.setNodes(nodes);
      vscode.window.setStatusBarMessage(
        `oh-my-ontology: ${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'} from ${vaultPath}`,
        4000,
      );
      await ensureMcpClient(vaultPath);
      updateMatchForActiveEditor();
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
    vscode.commands.registerCommand('ohMyOntology.openMatchedNode', async () => {
      if (!currentMatch?.filePath) {
        vscode.window.showInformationMessage(
          'oh-my-ontology: no ontology node owns this file.',
        );
        return;
      }
      const doc = await vscode.workspace.openTextDocument(currentMatch.filePath);
      await vscode.window.showTextDocument(doc);
    }),
    vscode.commands.registerCommand('ohMyOntology.addConcept', async () => {
      const vaultPath = await resolveVaultPath(context);
      if (!vaultPath) {
        vscode.window.showWarningMessage(
          'oh-my-ontology: pick a vault folder first (use the Activity Bar entry).',
        );
        return;
      }
      const kindPick = await vscode.window.showQuickPick(
        [
          { label: 'capability', description: 'A user-visible feature' },
          { label: 'element', description: 'A concrete code unit' },
          { label: 'domain', description: 'A grouping of capabilities' },
          { label: 'document', description: 'A reference doc' },
          { label: 'project', description: 'Top-level (usually one per workspace)' },
        ],
        { placeHolder: 'Pick the kind of concept to add' },
      );
      if (!kindPick) return;
      const kind = kindPick.label;

      const rawSlug = await vscode.window.showInputBox({
        placeHolder: 'slug — e.g. token-issue (auto-prefixed to capabilities/token-issue)',
        prompt: 'Slug for the new concept (no .md extension)',
        validateInput: (v) =>
          !v || !v.trim() ? 'slug is required' : null,
      });
      if (!rawSlug) return;

      const title = await vscode.window.showInputBox({
        placeHolder: 'title — e.g. "Token issue"',
        prompt: 'Display title',
        validateInput: (v) =>
          !v || !v.trim() ? 'title is required' : null,
      });
      if (!title) return;

      let domain: string | undefined;
      if (kind === 'capability' || kind === 'element') {
        const domainPick = await vscode.window.showInputBox({
          placeHolder: 'parent domain (optional, e.g. auth)',
          prompt: 'Parent domain slug — leave empty to skip',
        });
        domain = domainPick?.trim() || undefined;
      }

      const slug = resolveSlug(kind, rawSlug.trim(), true);
      const fm: Record<string, unknown> = {
        slug,
        kind,
        title: title.trim(),
      };
      if (domain) fm.domain = domain;

      try {
        const filePath = await writeDoc(vaultPath, slug, { frontmatter: fm });
        await refresh();
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
        vscode.window.setStatusBarMessage(
          `oh-my-ontology: created ${slug}.md`,
          4000,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`oh-my-ontology: ${msg}`);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('oh-my-ontology.vaultPath')) {
        void refresh();
      }
    }),
    vscode.commands.registerCommand(
      'ohMyOntology.renameConcept',
      async () => {
        if (!mcpClient || !mcpClient.isReady()) {
          vscode.window.showErrorMessage(
            'oh-my-ontology rename: MCP server not running. Enable `oh-my-ontology.useMcp` and refresh.',
          );
          return;
        }
        const seedSlug = currentMatch?.slug;
        const oldSlug = await vscode.window.showInputBox({
          value: seedSlug,
          placeHolder: 'old slug — e.g. capabilities/foo',
          prompt: 'Slug to rename',
          validateInput: (v) =>
            !v || !v.trim() ? 'old slug is required' : null,
        });
        if (!oldSlug) return;
        const newSlug = await vscode.window.showInputBox({
          placeHolder: 'new slug — e.g. capabilities/bar',
          prompt: `New slug for ${oldSlug}`,
          validateInput: (v) =>
            !v || !v.trim() ? 'new slug is required' : null,
        });
        if (!newSlug) return;
        try {
          const dry = (await mcpClient.callTool('rename_concept', {
            oldSlug,
            newSlug,
          })) as { updates?: Array<{ file: string }>; ok?: boolean };
          const count = dry.updates?.length ?? 0;
          const sample =
            dry.updates?.slice(0, 5).map((u) => u.file).join('\n  ') ?? '(none)';
          const confirmed = await vscode.window.showWarningMessage(
            `Rename ${oldSlug} → ${newSlug}?\n\n${count} file(s) affected:\n  ${sample}${count > 5 ? `\n  ...+${count - 5} more` : ''}`,
            { modal: true },
            'Confirm rename',
          );
          if (confirmed !== 'Confirm rename') return;
          await mcpClient.callTool('rename_concept', {
            oldSlug,
            newSlug,
            confirm: true,
          });
          vscode.window.setStatusBarMessage(
            `oh-my-ontology: renamed ${oldSlug} → ${newSlug} (${count} files)`,
            5000,
          );
          await refresh();
          const newNode = cachedNodes.find((n) => n.slug === newSlug);
          if (newNode) {
            const doc = await vscode.workspace.openTextDocument(newNode.filePath);
            await vscode.window.showTextDocument(doc);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`oh-my-ontology rename: ${msg}`);
        }
      },
    ),
    vscode.commands.registerCommand(
      'ohMyOntology.mergeConcepts',
      async () => {
        if (!mcpClient || !mcpClient.isReady()) {
          vscode.window.showErrorMessage(
            'oh-my-ontology merge: MCP server not running. Enable `oh-my-ontology.useMcp` and refresh.',
          );
          return;
        }
        const fromSlug = await vscode.window.showInputBox({
          value: currentMatch?.slug,
          placeHolder: 'from slug (will be DELETED) — e.g. capabilities/old',
          prompt: 'Slug to dissolve into another node',
          validateInput: (v) =>
            !v || !v.trim() ? 'from slug is required' : null,
        });
        if (!fromSlug) return;
        const intoSlug = await vscode.window.showInputBox({
          placeHolder: 'into slug (will absorb backlinks) — e.g. capabilities/keep',
          prompt: `Merge target — ${fromSlug}'s backlinks redirect here, then ${fromSlug}.md is deleted`,
          validateInput: (v) =>
            !v || !v.trim()
              ? 'into slug is required'
              : v === fromSlug
                ? 'into slug must differ from from slug'
                : null,
        });
        if (!intoSlug) return;
        try {
          const dry = (await mcpClient.callTool('merge_concepts', {
            fromSlug,
            intoSlug,
          })) as { updates?: Array<{ file: string }> };
          const count = dry.updates?.length ?? 0;
          const sample =
            dry.updates?.slice(0, 5).map((u) => u.file).join('\n  ') ?? '(none)';
          const confirmed = await vscode.window.showWarningMessage(
            `Merge ${fromSlug} into ${intoSlug}?\n\n⚠ ${fromSlug}.md will be DELETED.\n\n${count} backlink file(s) redirected:\n  ${sample}${count > 5 ? `\n  ...+${count - 5} more` : ''}`,
            { modal: true },
            'Confirm merge (destructive)',
          );
          if (confirmed !== 'Confirm merge (destructive)') return;
          await mcpClient.callTool('merge_concepts', {
            fromSlug,
            intoSlug,
            confirm: true,
          });
          vscode.window.setStatusBarMessage(
            `oh-my-ontology: merged ${fromSlug} → ${intoSlug} (${count} backlinks redirected)`,
            5000,
          );
          await refresh();
          const intoNode = cachedNodes.find((n) => n.slug === intoSlug);
          if (intoNode) {
            const doc = await vscode.workspace.openTextDocument(intoNode.filePath);
            await vscode.window.showTextDocument(doc);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`oh-my-ontology merge: ${msg}`);
        }
      },
    ),
    vscode.commands.registerCommand(
      'ohMyOntology.openBacklink',
      async (b: Backlink) => {
        if (b.filePath) {
          const doc = await vscode.workspace.openTextDocument(b.filePath);
          await vscode.window.showTextDocument(doc);
          return;
        }
        // No filePath cached (rare — backlink slug doesn't match any walked
        // node, e.g. tail-only frontmatter reference). Surface a hint.
        vscode.window.showInformationMessage(
          `oh-my-ontology: ${b.slug} not found on disk; refresh the tree.`,
        );
      },
    ),
    vscode.window.onDidChangeActiveTextEditor(() => {
      updateMatchForActiveEditor();
    }),
    {
      dispose: () => {
        if (mcpClient) {
          mcpClient.dispose();
          mcpClient = null;
        }
      },
    },
  );

  await refresh();
}

/**
 * Resolve the MCP server entry point. Default: `mcp/src/index.js` under
 * the first workspace folder (so a developer can dogfood without
 * setting anything). Override via `oh-my-ontology.mcpServerPath`.
 */
function resolveMcpServerEntry(
  config: vscode.WorkspaceConfiguration,
  _context: vscode.ExtensionContext,
): string | null {
  const fromConfig = (config.get<string>('mcpServerPath') ?? '').trim();
  if (fromConfig) return fromConfig;
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;
  return path.join(folders[0].uri.fsPath, 'mcp', 'src', 'index.js');
}

/**
 * Naive in-process backlinks computation — used when the MCP server
 * is unavailable. Scans frontmatter array keys and the `domain:`
 * inline-string key. Tail-only references (e.g. `mcp-server` for
 * `capabilities/mcp-server`) are matched too.
 */
function computeBacklinksLocally(
  slug: string,
  nodes: ReadonlyArray<VaultNode>,
): Backlink[] {
  const out: Backlink[] = [];
  const tail = slug.includes('/') ? slug.split('/').pop() ?? slug : slug;
  for (const node of nodes) {
    if (node.slug === slug) continue;
    const matchedKeys: string[] = [];
    if (node.domain && (node.domain === slug || node.domain === tail)) {
      matchedKeys.push('domain');
    }
    for (const key of ['capabilities', 'elements'] as const) {
      const arr = node[key];
      if (!arr) continue;
      if (arr.includes(slug) || arr.includes(tail)) {
        matchedKeys.push(key);
      }
    }
    if (matchedKeys.length > 0) {
      out.push({
        slug: node.slug,
        kind: node.kind,
        title: node.title,
        filePath: node.filePath,
        matchedKeys,
      });
    }
  }
  return out;
}

function iconForKind(kind: string): string {
  switch (kind) {
    case 'project':
      return '$(rocket)';
    case 'domain':
      return '$(symbol-namespace)';
    case 'capability':
      return '$(symbol-function)';
    case 'element':
      return '$(symbol-file)';
    case 'document':
      return '$(file-text)';
    default:
      return '$(circle-outline)';
  }
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
