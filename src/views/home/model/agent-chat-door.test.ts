import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

import { agentChatDoor, type AgentChatDoorInput } from './agent-chat-door';
import { parseHomeRouteState } from './url-state';

const homePageSource = readFileSync('src/views/home/ui/HomePage.tsx', 'utf8');
const indexSource = readFileSync('src/views/home/model/use-topology-index-presentation.tsx', 'utf8');
const agentSource = readFileSync('src/views/home/model/use-topology-agent-orchestration.tsx', 'utf8');
const dockSource = readFileSync('src/views/home/ui/TopologyAgentDock.tsx', 'utf8');

function frameWidthOwners(source: string): string[] {
  const file = ts.createSourceFile('HomePage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const owners: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node)) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      if (attributes.some((attribute) => attribute.name.getText(file) === 'data-agent-dock-frame')) {
        const style = attributes.find((attribute) => attribute.name.getText(file) === 'style')?.initializer;
        const value = style && ts.isJsxExpression(style) ? style.expression : null;
        const width = value && ts.isObjectLiteralExpression(value)
          ? value.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(file) === 'width') : null;
        if (width && ts.isPropertyAssignment(width) && ts.isConditionalExpression(width.initializer)) {
          const condition = width.initializer.condition;
          if (ts.isBinaryExpression(condition) && condition.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
            for (const part of [condition.left, condition.right]) if (ts.isIdentifier(part)) owners.push(part.text);
          }
          expect(width.initializer.whenFalse.getText(file)).toMatch(/^['"]0px['"]$/);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return owners.sort();
}

/** **Every combination** of the four inputs — 16. The invariant is held
 *  exhaustively, not by sampling. */
const ALL: AgentChatDoorInput[] = [];
for (const hasRuntime of [false, true]) {
  for (const runtimeOpen of [false, true]) {
    for (const keyOpen of [false, true]) {
      for (const hasAskIntent of [false, true]) {
        ALL.push({ hasRuntime, runtimeOpen, keyOpen, hasAskIntent });
      }
    }
  }
}

describe('one chat window: which branch owns it', () => {
  it('no input combination gives both branches the window', () => {
    /*
     * This one line is why the file exists. On the old screen the two open
     * states did not know about each other, so two similar chat windows could
     * stand to the right of the map.
     */
    for (const input of ALL) {
      const door = agentChatDoor(input);
      expect(
        door.runtime && door.key,
        `both chat windows opened: ${JSON.stringify(input)}`,
      ).toBe(false);
    }
  });

  it('open means one of the two owns the window, so the chip does not lie', () => {
    for (const input of ALL) {
      const door = agentChatDoor(input);
      expect(door.open, JSON.stringify(input)).toBe(door.runtime || door.key);
    }
  });

  it('the coding agent owns the window when one exists', () => {
    const door = agentChatDoor({
      hasRuntime: true,
      runtimeOpen: true,
      keyOpen: true,
      hasAskIntent: false,
    });
    expect(door).toEqual({ runtime: true, key: false, open: true });
  });

  it('the key branch owns the window without a coding agent', () => {
    const door = agentChatDoor({
      hasRuntime: false,
      runtimeOpen: true,
      keyOpen: true,
      hasAskIntent: false,
    });
    expect(door).toEqual({ runtime: false, key: true, open: true });
  });

  it('an ask-about-this from a node goes to the same window', () => {
    // With a coding agent present the sentence lands in its composer.
    expect(
      agentChatDoor({
        hasRuntime: true,
        runtimeOpen: false,
        keyOpen: false,
        hasAskIntent: true,
      }),
    ).toEqual({ runtime: true, key: false, open: true });
    // Without one the key branch takes it — unchanged from before.
    expect(
      agentChatDoor({
        hasRuntime: false,
        runtimeOpen: false,
        keyOpen: false,
        hasAskIntent: true,
      }),
    ).toEqual({ runtime: false, key: true, open: true });
  });

  it('a whole-graph flow request goes to the same window of the installed coding agent', () => {
    const route = parseHomeRouteState(new URLSearchParams('ask=business-flow'));

    expect(route.askBusinessFlow).toBe(true);
    expect(
      agentChatDoor({
        hasRuntime: true,
        runtimeOpen: false,
        keyOpen: false,
        hasAskIntent: route.askBusinessFlow,
      }),
    ).toEqual({ runtime: true, key: false, open: true });
    // INDEX and the first-run card must yield on the arrival frame too; otherwise
    // the correct door opens into a squeezed map before its derived prefill exists.
    expect(homePageSource).toContain("<TopologyAgentDock");
    expect(homePageSource).toContain("useTopologyAgentOrchestration({");
    expect(indexSource).toMatch(
      /const agentDockRequestedOpen\s*=\s*[\s\S]{0,260}routeState\.askBusinessFlow/,
    );
    // Ownership is not visibility: the ACP frame itself is stateful so it can animate
    // its width. The route handoff must enter the same open function as a button, and
    // that function must drive both the width and Surface `open` bindings.
    expect(agentSource).toMatch(
      /const routeAskDockRequestRef[\s\S]{0,1800}openVaultAgent\(\);/,
    );
    expect(agentSource).toMatch(
      /if \(agentChatUsesRuntime\)[\s\S]{0,220}setAcpDockFrameOpen\(true\)/,
    );
    expect(frameWidthOwners(dockSource)).toEqual(['acpDockFrameOpen', 'meaningWorkbenchOpen']);
    // The shared inset-surface contract checks its open binding; the route must
    // also claim actual frame width when the meaning section is closed.
    const missingRuntime = dockSource.replace('width: acpDockFrameOpen || meaningWorkbenchOpen', 'width: meaningWorkbenchOpen');
    expect(frameWidthOwners(missingRuntime)).not.toEqual(['acpDockFrameOpen', 'meaningWorkbenchOpen']);
  });

  it('a flow request only fills the composer in both branches and never auto-sends', () => {
    expect(
      dockSource.match(
        /prefillRequest=\{vaultAgentPrefill \?\? askPrefill\}/g,
      ),
    ).toHaveLength(2);
    expect(dockSource).not.toMatch(
      /openingRequest=\{[^}]*askPrefill[^}]*\}/,
    );
  });

  it('nothing opens when nobody opened it', () => {
    expect(
      agentChatDoor({
        hasRuntime: true,
        runtimeOpen: false,
        keyOpen: false,
        hasAskIntent: false,
      }),
    ).toEqual({ runtime: false, key: false, open: false });
  });
});
