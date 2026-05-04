import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { VaultNode } from "./walk-vault";
import { buildGraphElements } from "./graph-elements";

/**
 * R13 #63 — graph webview. cytoscape + dagre layout.
 * R13 #64 — active editor sync, hover tooltip, search.
 *
 * vault 의 capability/domain/element 노드를 그래프로 시각화. 노드 클릭
 * → plugin 이 postMessage 받아 .md 열기. main editor area 에 띄우므로
 * split 으로 코드 옆에 두고 작업 가능. 웹 워크벤치 가 별도 브라우저
 * 탭이 필요한 데 비해, IDE 안에서 즉시 graph ↔ 코드 jump.
 *
 * Returns a `GraphPanelHandle` with `update()` (refresh with new nodes)
 * and `setActive(slug)` (highlight one node) — extension.ts uses these
 * to sync the panel with vault changes and the active editor.
 */
export interface GraphPanelHandle {
  panel: vscode.WebviewPanel;
  update(nodes: ReadonlyArray<VaultNode>): void;
  setActive(slug: string | null): void;
  isAlive(): boolean;
}

export function showGraphView(
  context: vscode.ExtensionContext,
  nodes: ReadonlyArray<VaultNode>,
): GraphPanelHandle {
  const panel = vscode.window.createWebviewPanel(
    "ohMyOntology.graph",
    "oh-my-ontology · graph",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      retainContextWhenHidden: true,
    },
  );

  let currentNodes: ReadonlyArray<VaultNode> = nodes;
  let pendingActiveSlug: string | null = null;
  let webviewReady = false;
  let alive = true;

  panel.onDidDispose(() => {
    alive = false;
  });

  panel.webview.html = renderHtml(panel.webview, context.extensionUri);

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg?.type === "ready") {
      webviewReady = true;
      panel.webview.postMessage({
        type: "setData",
        elements: buildGraphElements(currentNodes),
      });
      if (pendingActiveSlug) {
        panel.webview.postMessage({
          type: "highlightActive",
          slug: pendingActiveSlug,
        });
      }
      return;
    }
    if (msg?.type === "openNode" && typeof msg.slug === "string") {
      const target = currentNodes.find((n) => n.slug === msg.slug);
      if (target?.filePath) {
        const doc = await vscode.workspace.openTextDocument(target.filePath);
        await vscode.window.showTextDocument(doc, { preview: false });
      }
    }
  });

  return {
    panel,
    update(next) {
      currentNodes = next;
      if (webviewReady) {
        panel.webview.postMessage({
          type: "setData",
          elements: buildGraphElements(next),
        });
      }
    },
    setActive(slug) {
      pendingActiveSlug = slug;
      if (webviewReady) {
        panel.webview.postMessage({ type: "highlightActive", slug });
      }
    },
    isAlive() {
      return alive;
    },
  };
}

function renderHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const mediaUri = (name: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", name));
  const cytoscapeUri = mediaUri("cytoscape.min.js").toString();
  const dagreUri = mediaUri("dagre.min.js").toString();
  const cyDagreUri = mediaUri("cytoscape-dagre.js").toString();

  const templatePath = path.join(extensionUri.fsPath, "media", "graph.html");
  const template = fs.readFileSync(templatePath, "utf-8");
  return template
    .replaceAll("${CSP_SOURCE}", webview.cspSource)
    .replaceAll("${CYTOSCAPE_URI}", cytoscapeUri)
    .replaceAll("${DAGRE_URI}", dagreUri)
    .replaceAll("${CY_DAGRE_URI}", cyDagreUri);
}
