import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

import { CHROME_STATUS_CHIP_CLASS } from "@/shared/ui/chrome-chip";
import { TopologyRealmChip } from "./TopologyRealmChip";
import { TopologyInsightsReturnChip } from "./TopologyInsightsReturnChip";
import { TopologyPathChip } from "./TopologyPathChip";

/**
 * Regression pin for the top-centre status chips (realm, return, path): they must
 * share `ChromeChip`'s spec (`--chrome-tile-size` height, `--chrome-radius`) and
 * must not re-apply `topology-ui-scale` to themselves — the `SearchHint` wrapper
 * already applies it, and nesting the zoom is what made a chip grow past its
 * siblings.
 */
describe("상단 크롬 상태 칩 규격 (S10 결함 1)", () => {
  it("공유 규격 클래스가 chrome-tile-size 높이·chrome-radius·chrome-border 토큰을 담는다", () => {
    expect(CHROME_STATUS_CHIP_CLASS).toContain("h-[var(--chrome-tile-size)]");
    expect(CHROME_STATUS_CHIP_CLASS).toContain("rounded-[var(--chrome-radius)]");
    expect(CHROME_STATUS_CHIP_CLASS).toContain("border-[color:var(--chrome-border)]");
    expect(CHROME_STATUS_CHIP_CLASS).toContain("bg-[color:var(--chrome-surface)]");
    expect(CHROME_STATUS_CHIP_CLASS).toContain("shadow-[var(--chrome-shadow)]");
  });

  it("규격 클래스는 topology-ui-scale 을 포함하지 않는다 (중첩 zoom 이중적용 차단)", () => {
    expect(CHROME_STATUS_CHIP_CLASS).not.toContain("topology-ui-scale");
  });

  it("영역 칩이 규격 클래스를 그대로 쓴다 (자기 scale 재적용 없음)", () => {
    render(
      <TopologyRealmChip title="AI Agent Partner" beforeLabel="" afterLabel="만 보는 중" clearAriaLabel="전체 지도" onClear={() => {}} />,
    );
    const chip = screen.getByTestId("topology-realm-chip");
    expect(chip.className).toBe(CHROME_STATUS_CHIP_CLASS);
    expect(chip.className).not.toContain("topology-ui-scale");
  });

  it("복귀 칩이 규격 클래스를 그대로 쓴다", () => {
    render(
      <TopologyInsightsReturnChip
        href="/ontology/insights/?tab=structure"
        label="인사이트로 돌아가기"
        ariaLabel="복귀"
        dismissAriaLabel="닫기"
        onDismiss={() => {}}
      />,
    );
    const chip = screen.getByTestId("topology-insights-return-chip");
    expect(chip.className).toBe(CHROME_STATUS_CHIP_CLASS);
    expect(chip.className).not.toContain("topology-ui-scale");
  });

  it("경로 칩이 규격 클래스를 그대로 쓴다", () => {
    render(
      <TopologyPathChip
        label="A → B · 2홉"
        resolved={false}
        copyPacketLabel="복사"
        copyPacketCopied={false}
        copyPacketAriaLabel="패킷 복사"
        copyPacketCopiedAriaLabel="복사됨"
        onCopyPacket={() => {}}
        clearAriaLabel="지우기"
        onClear={() => {}}
      />,
    );
    const chip = screen.getByTestId("topology-path-chip");
    expect(chip.className).toBe(CHROME_STATUS_CHIP_CLASS);
    expect(chip.className).not.toContain("topology-ui-scale");
  });
});
