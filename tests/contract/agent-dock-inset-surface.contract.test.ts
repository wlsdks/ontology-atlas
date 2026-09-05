import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from 'typescript';

import { AGENT_DOCK_INSET_SURFACE_CLASS } from "../../src/shared/ui/agent-dock-surface";

const home = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
const vaultAgent = readFileSync("src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx", "utf8");

function insetDockOpenSources(source: string): string[][] {
  const file = ts.createSourceFile('HomePage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[][] = [];
  const identifiers = (expression: ts.Expression): string[] => {
    if (ts.isParenthesizedExpression(expression)) return identifiers(expression.expression);
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.BarBarToken) return [...identifiers(expression.left), ...identifiers(expression.right)];
    return [ts.isIdentifier(expression) ? expression.text : '<non-state-expression>'];
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === 'Surface') {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const marker = attrs.find((attr) => attr.name.getText(file) === 'data-agent-dock-surface')?.initializer;
      if (marker && ts.isStringLiteral(marker) && marker.text === 'inset') {
        const open = attrs.find((attr) => attr.name.getText(file) === 'open')?.initializer;
        found.push(open && ts.isJsxExpression(open) && open.expression ? identifiers(open.expression) : []);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("agent dock inset surface", () => {
  it("uses the existing panel material on all four visible edges", () => {
    expect(AGENT_DOCK_INSET_SURFACE_CLASS).toContain("inset-y-3");
    expect(AGENT_DOCK_INSET_SURFACE_CLASS).toContain("right-3");
    expect(AGENT_DOCK_INSET_SURFACE_CLASS).toContain(
      "rounded-[var(--topology-v2-panel-radius)]",
    );
    expect(AGENT_DOCK_INSET_SURFACE_CLASS).toContain(
      "border-[color:var(--topology-v2-panel-border)]",
    );
    expect(AGENT_DOCK_INSET_SURFACE_CLASS).toContain(
      "bg-[color:var(--color-panel)]",
    );
    expect(AGENT_DOCK_INSET_SURFACE_CLASS).toContain(
      "shadow-[var(--topology-v2-panel-shadow)]",
    );
  });

  it("applies the same surface to both agent implementations", () => {
    for (const source of [home, vaultAgent]) {
      expect(source).toContain("AGENT_DOCK_INSET_SURFACE_CLASS");
      expect(source).toContain('data-agent-dock-surface="inset"');
      expect(source).toContain("var(--chrome-inset)");
    }
  });

  it("mounts the ACP scaffold with the dock, and starts only after reflow settles", () => {
    expect(insetDockOpenSources(home)).toEqual([['acpDockFrameOpen', 'meaningWorkbenchOpen']]);
    expect(home).toContain('motion="overlay"');
    expect(home).toContain("sessionEnabled={acpChatOpen}");
  });

  it('probes the actual dock Surface even when its child still has the correct open expression', () => {
    const broken = home.replace('open={acpDockFrameOpen || meaningWorkbenchOpen}', 'open={false /* probe */}');
    expect(broken).not.toBe(home);
    expect(broken).toContain('open={acpDockFrameOpen || meaningWorkbenchOpen}');
    expect(insetDockOpenSources(broken)).not.toEqual([['acpDockFrameOpen', 'meaningWorkbenchOpen']]);
  });

  it("lets the map camera finish before ACP startup can occupy the main thread", () => {
    expect(home).toContain("ACP_SESSION_START_AFTER_REFLOW_MS");
    expect(home).toContain("scheduleAcpSessionStart");
    expect(home).toMatch(
      /window\.setTimeout\([\s\S]*setAcpChatOpen\(true\)[\s\S]*ACP_SESSION_START_AFTER_REFLOW_MS/,
    );
    expect(home).toContain("cancelAcpSessionStart");
  });

  it("publishes the real dock width before the delayed ACP session starts", () => {
    expect(home).toMatch(
      /style=\{[\s\S]*acpDockFrameOpen\s*\|\|\s*runtimeChatOpen[\s\S]*--agent-panel-width/,
    );
  });
});
