import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 노드 상세의 행동은 다시 타일 격자로 불어나지 않는다.
 *
 * 2026-08-22 소유자 관측에서 한 노드를 읽기 전에 7개 타일을 해석해야 했다.
 * 현재 계약은 주 행동 하나 + 편집/더보기 메뉴 둘이다. 주 행동의 긴 CJK 라벨은
 * 한 줄에서 truncate되고 전체 뜻은 aria-label로 남는다.
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
