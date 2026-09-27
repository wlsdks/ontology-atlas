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
 * The top-centre chips share `ChromeChip`'s spec and must not re-apply `topology-ui-scale`:
 * the `SearchHint` wrapper already does, and nested zoom makes a chip outgrow its siblings.
 */
describe("top chrome status chip geometry", () => {
  it("the shared geometry class carries chrome-tile-size height, chrome-radius and chrome-border tokens", () => {
    expect(CHROME_STATUS_CHIP_CLASS).toContain("h-[var(--chrome-tile-size)]");
    expect(CHROME_STATUS_CHIP_CLASS).toContain("rounded-[var(--chrome-radius)]");
    expect(CHROME_STATUS_CHIP_CLASS).toContain("border-[color:var(--chrome-border)]");
    expect(CHROME_STATUS_CHIP_CLASS).toContain("bg-[color:var(--chrome-surface)]");
    expect(CHROME_STATUS_CHIP_CLASS).toContain("shadow-[var(--chrome-shadow)]");
  });

  it("the geometry class excludes topology-ui-scale to avoid a doubled nested zoom", () => {
    expect(CHROME_STATUS_CHIP_CLASS).not.toContain("topology-ui-scale");
  });

  it("the realm chip uses the geometry class unchanged without reapplying its own scale", () => {
    render(
      <TopologyRealmChip title="AI Agent Partner" beforeLabel="" afterLabel="만 보는 중" clearAriaLabel="전체 지도" onClear={() => {}} />,
    );
    const chip = screen.getByTestId("topology-realm-chip");
    expect(chip.className).toBe(CHROME_STATUS_CHIP_CLASS);
    expect(chip.className).not.toContain("topology-ui-scale");
  });

  it("the return chip uses the geometry class unchanged", () => {
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

  it("the path chip uses the geometry class unchanged", () => {
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
