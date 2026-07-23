import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { TopologyV2SettingsGear } from "./TopologyV2SettingsGear";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/",
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const labels = {
  trigger: "Settings",
  heading: "Map settings",
  locale: "Language",
  indexDefault: "INDEX default state",
  indexDefaultExpanded: "Expanded",
  indexDefaultCollapsed: "Collapsed",
  changeVault: "Switch vault",
  changeVaultAriaLabel: "Open the workspace to pick a different local vault folder",
  audience: "View mode",
  audienceDev: "Developer",
  audiencePlain: "General",
  audienceCaption: "General — folds away code elements and uses plain language",
};

function renderGear(
  onChangeIndexDefaultCollapsed: (next: boolean) => void = () => {},
  indexDefaultCollapsed = false,
  onChangeAudiencePlain: (next: boolean) => void = () => {},
  audiencePlain = false,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <TopologyV2SettingsGear
        indexDefaultCollapsed={indexDefaultCollapsed}
        onChangeIndexDefaultCollapsed={onChangeIndexDefaultCollapsed}
        changeVaultHref="/docs/?intent=local"
        labels={labels}
        audiencePlain={audiencePlain}
        onChangeAudiencePlain={onChangeAudiencePlain}
      />
    </NextIntlClientProvider>,
  );
}

describe("TopologyV2SettingsGear — utility-rail settings popover", () => {
  it("keeps the popover closed until the trigger is clicked", () => {
    renderGear();
    expect(screen.queryByTestId("topology-v2-settings-gear-popover")).not.toBeInTheDocument();
  });

  it("opens the popover with locale/index-default rows on trigger click", () => {
    renderGear();
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    const popover = screen.getByTestId("topology-v2-settings-gear-popover");
    expect(popover).toBeInTheDocument();
    expect(within(popover).getByText(labels.locale)).toBeInTheDocument();
    expect(within(popover).getByText(labels.indexDefault)).toBeInTheDocument();
  });

  it("calls onChangeIndexDefaultCollapsed(true) when the collapsed option is picked", () => {
    const onChange = vi.fn();
    renderGear(onChange, false);
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    fireEvent.click(screen.getByRole("button", { name: labels.indexDefaultCollapsed }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls onChangeIndexDefaultCollapsed(false) when the expanded option is picked", () => {
    const onChange = vi.fn();
    renderGear(onChange, true);
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    fireEvent.click(screen.getByRole("button", { name: labels.indexDefaultExpanded }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape and stops the keypress from reaching the window (transient-surface-first)", () => {
    renderGear();
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    expect(screen.getByTestId("topology-v2-settings-gear-popover")).toBeInTheDocument();

    const windowHandler = vi.fn();
    window.addEventListener("keydown", windowHandler);
    fireEvent.keyDown(screen.getByTestId("topology-v2-settings-gear-popover"), {
      key: "Escape",
      bubbles: true,
    });
    window.removeEventListener("keydown", windowHandler);

    expect(screen.queryByTestId("topology-v2-settings-gear-popover")).not.toBeInTheDocument();
    expect(windowHandler).not.toHaveBeenCalled();
  });

  it("M-4: closes on Escape even when focus has moved OUT of the popover (window-level, not focus-scoped)", () => {
    renderGear();
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    expect(screen.getByTestId("topology-v2-settings-gear-popover")).toBeInTheDocument();

    // Persona case: focus left the gear (e.g. clicked the graph toggle). The
    // Escape now originates on document.body, not inside the popover.
    const windowHandler = vi.fn();
    window.addEventListener("keydown", windowHandler);
    fireEvent.keyDown(document.body, { key: "Escape", bubbles: true });
    window.removeEventListener("keydown", windowHandler);

    expect(screen.queryByTestId("topology-v2-settings-gear-popover")).not.toBeInTheDocument();
    // still consumed — the global Esc ladder must not also act on this press
    expect(windowHandler).not.toHaveBeenCalled();
  });

  it("M-4: closes when `suppressed` flips true (another transient surface opened)", () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <TopologyV2SettingsGear
          indexDefaultCollapsed={false}
          onChangeIndexDefaultCollapsed={() => {}}
          audiencePlain={false}
          onChangeAudiencePlain={() => {}}
          changeVaultHref="/docs/?intent=local"
          labels={labels}
          suppressed={false}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    expect(screen.getByTestId("topology-v2-settings-gear-popover")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <TopologyV2SettingsGear
          indexDefaultCollapsed={false}
          onChangeIndexDefaultCollapsed={() => {}}
          audiencePlain={false}
          onChangeAudiencePlain={() => {}}
          changeVaultHref="/docs/?intent=local"
          labels={labels}
          suppressed={true}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("topology-v2-settings-gear-popover")).not.toBeInTheDocument();
  });

  it("shows a 'switch vault' row that links back to /docs so a revisiting user can change folders from the map", () => {
    renderGear();
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));

    const changeVault = screen.getByTestId("topology-v2-settings-gear-change-vault");
    expect(changeVault).toHaveAttribute("href", "/docs/?intent=local");
    expect(changeVault).toHaveTextContent(labels.changeVault);
  });

  it("closes on outside click", () => {
    renderGear();
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    expect(screen.getByTestId("topology-v2-settings-gear-popover")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("topology-v2-settings-gear-popover")).not.toBeInTheDocument();
  });

  it("defaults to a right-anchored popover (opens leftward — right utility rail placement)", () => {
    renderGear();
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    expect(screen.getByTestId("topology-v2-settings-gear-popover").className).toContain("right-0");
  });

  it("anchors left when popoverAlign='left' (feat/chrome-system nav-rail placement — opens rightward)", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <TopologyV2SettingsGear
          indexDefaultCollapsed={false}
          onChangeIndexDefaultCollapsed={() => {}}
          audiencePlain={false}
          onChangeAudiencePlain={() => {}}
          changeVaultHref="/docs/?intent=local"
          labels={labels}
          popoverAlign="left"
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    const popover = screen.getByTestId("topology-v2-settings-gear-popover");
    expect(popover.className).toContain("left-0");
    expect(popover.className).not.toContain("right-0");
  });

  it("opens upward when popoverSide='top' (nav-rail trigger sits at the screen bottom)", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <TopologyV2SettingsGear
          indexDefaultCollapsed={false}
          onChangeIndexDefaultCollapsed={() => {}}
          audiencePlain={false}
          onChangeAudiencePlain={() => {}}
          changeVaultHref="/docs/?intent=local"
          labels={labels}
          popoverAlign="left"
          popoverSide="top"
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    const popover = screen.getByTestId("topology-v2-settings-gear-popover");
    expect(popover.className).toContain("bottom-[calc(100%+8px)]");
    expect(popover.className).not.toContain("top-[calc(100%+8px)]");
  });
});

// 슬라이스 C (개발/비개발 모드 토글) — "INDEX 기본 상태" 행과 같은 SettingsRow
// + 2-세그먼트 토글 패턴의 새 "보기 모드" 행.
describe("TopologyV2SettingsGear — 보기 모드(audience) 행 (슬라이스 C)", () => {
  it("renders the 보기 모드 row with its label in the popover", () => {
    renderGear();
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    const popover = screen.getByTestId("topology-v2-settings-gear-popover");
    expect(within(popover).getByTestId("topology-v2-settings-gear-audience")).toBeInTheDocument();
    expect(within(popover).getByText(labels.audience)).toBeInTheDocument();
  });

  it("calls onChangeAudiencePlain(true) when the 일반(plain) option is picked", () => {
    const onChangeAudiencePlain = vi.fn();
    renderGear(() => {}, false, onChangeAudiencePlain, false);
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    fireEvent.click(screen.getByRole("button", { name: labels.audiencePlain }));
    expect(onChangeAudiencePlain).toHaveBeenCalledWith(true);
  });

  it("calls onChangeAudiencePlain(false) when the 개발(dev) option is picked", () => {
    const onChangeAudiencePlain = vi.fn();
    renderGear(() => {}, false, onChangeAudiencePlain, true);
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    fireEvent.click(screen.getByRole("button", { name: labels.audienceDev }));
    expect(onChangeAudiencePlain).toHaveBeenCalledWith(false);
  });

  it("reflects the current mode via aria-pressed on the active segment", () => {
    renderGear(() => {}, false, () => {}, true);
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    expect(screen.getByRole("button", { name: labels.audiencePlain })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: labels.audienceDev })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  // P2 결함③ (사용성 전수 검수 2026-07-23) — 토글에 설명이 전혀 없어 비개발자가
  // "일반" 이 뭘 바꾸는지 알 방법이 없었다. 행 아래 caption 한 줄.
  it("P2 결함③ — renders a caption line under the 보기 모드 row when provided", () => {
    renderGear();
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    const popover = screen.getByTestId("topology-v2-settings-gear-popover");
    expect(within(popover).getByText(labels.audienceCaption)).toBeInTheDocument();
  });

  it("P2 결함③ — omits the caption line when the label isn't provided (backward-compat)", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <TopologyV2SettingsGear
          indexDefaultCollapsed={false}
          onChangeIndexDefaultCollapsed={() => {}}
          audiencePlain={false}
          onChangeAudiencePlain={() => {}}
          changeVaultHref="/docs/?intent=local"
          labels={{ ...labels, audienceCaption: undefined }}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    expect(screen.queryByTestId("topology-v2-settings-gear-audience-caption")).not.toBeInTheDocument();
  });
});

describe("TopologyV2SettingsGear — rail-tile trigger variant (레일 유틸 타일 문법)", () => {
  // 소유자 실보고 2026-07-23 — 레일 하단 3타일(활동·발자취·설정) 중 기어만
  // 36px 보더 floating 표면 + 16px 아이콘이라 이질적이었다. rail-tile 변형은
  // `--app-nav-rail-tile-*` 지오메트리 + `--app-nav-rail-utility-icon-size`
  // 아이콘 사다리를 활동/발자취 타일과 공유해야 한다.
  it("rail-tile: trigger sits on the nav-rail utility tile contract (tile geometry + utility icon ladder)", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <TopologyV2SettingsGear
          indexDefaultCollapsed={false}
          onChangeIndexDefaultCollapsed={() => {}}
          audiencePlain={false}
          onChangeAudiencePlain={() => {}}
          changeVaultHref="/docs/?intent=local"
          labels={labels}
          triggerVariant="rail-tile"
        />
      </NextIntlClientProvider>,
    );
    const trigger = screen.getByTestId("topology-v2-settings-gear-trigger");
    expect(trigger).toHaveAttribute("data-trigger-variant", "rail-tile");
    expect(trigger.className).toContain("--app-nav-rail-tile-height");
    expect(trigger.className).toContain("--app-nav-rail-tile-width");
    // floating 변형의 보더/그림자 표면 토큰이 섞이면 안 된다.
    expect(trigger.className).not.toContain("--topology-floating-control-border");
    const icon = trigger.querySelector("svg");
    expect(icon?.getAttribute("class") ?? "").toContain("--app-nav-rail-utility-icon-size");
  });

  it("floating(default): keeps the original 16px icon (h-4 w-4) — no utility ladder leak", () => {
    renderGear();
    const trigger = screen.getByTestId("topology-v2-settings-gear-trigger");
    expect(trigger).toHaveAttribute("data-trigger-variant", "floating");
    const icon = trigger.querySelector("svg");
    expect(icon?.getAttribute("class") ?? "").toContain("h-4");
  });
});
