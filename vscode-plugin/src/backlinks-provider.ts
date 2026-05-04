import * as vscode from 'vscode';

export interface Backlink {
  slug: string;
  kind: string;
  title: string;
  matchedKeys: string[];
  filePath: string;
}

export class BacklinksProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private currentSlug: string | null = null;
  private backlinks: Backlink[] = [];
  private loading = false;
  private error: string | null = null;

  setLoading(slug: string | null): void {
    this.currentSlug = slug;
    this.loading = true;
    this.error = null;
    this.backlinks = [];
    this._onDidChangeTreeData.fire();
  }

  setBacklinks(slug: string, items: Backlink[]): void {
    if (this.currentSlug !== slug) return; // stale (active editor changed)
    this.loading = false;
    this.backlinks = items;
    this.error = null;
    this._onDidChangeTreeData.fire();
  }

  setError(slug: string, message: string): void {
    if (this.currentSlug !== slug) return;
    this.loading = false;
    this.error = message;
    this.backlinks = [];
    this._onDidChangeTreeData.fire();
  }

  clear(): void {
    this.currentSlug = null;
    this.backlinks = [];
    this.loading = false;
    this.error = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    if (!this.currentSlug) return [];
    if (this.loading) {
      const item = new vscode.TreeItem('loading…');
      item.iconPath = new vscode.ThemeIcon('loading~spin');
      return [item];
    }
    if (this.error) {
      const item = new vscode.TreeItem(`error: ${this.error}`);
      item.iconPath = new vscode.ThemeIcon('warning');
      return [item];
    }
    if (this.backlinks.length === 0) {
      const item = new vscode.TreeItem('no backlinks');
      item.iconPath = new vscode.ThemeIcon('circle-slash');
      return [item];
    }
    return this.backlinks.map((b) => {
      const item = new vscode.TreeItem(b.title);
      item.description = `${b.slug}  ·  ${b.matchedKeys.join(', ')}`;
      item.tooltip = `${b.kind} · ${b.slug}\nmatched via ${b.matchedKeys.join(', ')}\nClick to open ${b.slug}.md`;
      item.iconPath = iconForKind(b.kind);
      item.command = {
        command: 'ohMyOntology.openBacklink',
        title: 'Open backlink .md',
        arguments: [b],
      };
      return item;
    });
  }
}

function iconForKind(kind: string): vscode.ThemeIcon {
  switch (kind) {
    case 'project':
      return new vscode.ThemeIcon('rocket');
    case 'domain':
      return new vscode.ThemeIcon('symbol-namespace');
    case 'capability':
      return new vscode.ThemeIcon('symbol-function');
    case 'element':
      return new vscode.ThemeIcon('symbol-file');
    case 'document':
      return new vscode.ThemeIcon('file-text');
    default:
      return new vscode.ThemeIcon('circle-outline');
  }
}
