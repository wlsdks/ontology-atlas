import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The actions in the node detail do not expand back into a tile grid.
 *
 * In the owner's observation on 2026-08-22, seven tiles had to be interpreted before reading one node.
 * The current contract is one primary action + two edit/overflow menu items. The long CJK label of the primary action
 * is truncated in one line, and the full meaning remains in the aria-label.
 */
const FILE = "src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.tsx";

describe("노드 상세 행동 단순화", () => {
  const source = readFileSync(FILE, "utf8");

  it("주 행동과 두 disclosure 메뉴가 모두 실재한다", () => {
    expect(source).toContain('data-action-role="primary"');
    expect(source).toContain('triggerTestId="topology-v2-detail-panel-edit-menu-trigger"');
    expect(source).toContain('triggerTestId="topology-v2-detail-panel-more-menu-trigger"');
  });

  it("옛 액션 타일 잉크와 tile grid를 되살리지 않는다", () => {
    expect(source).not.toContain("ACTION_TILE_INK");
    expect(source).not.toContain('shape: "tile"');
  });

  it("주 행동의 긴 라벨은 한 줄에 머물고 접근 가능한 이름은 보존한다", () => {
    expect(source).toContain('<span className="truncate">{labels.actionAskAgent}</span>');
    expect(source).toContain('aria-label={labels.actionAskAgent}');
    expect(source).toContain('<span className="truncate">{labels.actionCopyHandoff}</span>');
    expect(source).toContain('aria-label={labels.handoff}');
  });
});
