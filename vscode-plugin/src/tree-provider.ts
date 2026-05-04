import * as vscode from 'vscode';
import { VaultNode } from './walk-vault';

const KIND_ORDER = [
  'project',
  'domain',
  'capability',
  'element',
  'document',
  'vault-readme',
];

export class OntologyTreeProvider
  implements vscode.TreeDataProvider<TreeItem>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private nodes: VaultNode[] = [];

  setNodes(nodes: VaultNode[]): void {
    this.nodes = nodes;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): TreeItem[] {
    if (!element) {
      // root → kind groups
      const counts = new Map<string, number>();
      for (const n of this.nodes) {
        counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
      }
      const orderedKinds = [
        ...KIND_ORDER.filter((k) => counts.has(k)),
        ...[...counts.keys()].filter((k) => !KIND_ORDER.includes(k)).sort(),
      ];
      return orderedKinds.map(
        (kind) =>
          new TreeItem(
            `${kind} (${counts.get(kind) ?? 0})`,
            vscode.TreeItemCollapsibleState.Expanded,
            { kind },
          ),
      );
    }
    if (element.payload?.kind) {
      const kind = element.payload.kind;
      return this.nodes
        .filter((n) => n.kind === kind)
        .sort((a, b) => a.slug.localeCompare(b.slug))
        .map((n) => {
          const item = new TreeItem(
            n.title,
            vscode.TreeItemCollapsibleState.None,
            { node: n },
          );
          item.description = n.slug;
          item.tooltip = `${n.kind} · ${n.slug}${n.domain ? ` · domain=${n.domain}` : ''}`;
          item.command = {
            command: 'ohMyOntology.openNode',
            title: 'Open node .md',
            arguments: [n],
          };
          return item;
        });
    }
    return [];
  }
}

class TreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    state: vscode.TreeItemCollapsibleState,
    public payload?: { kind?: string; node?: VaultNode },
  ) {
    super(label, state);
  }
}
