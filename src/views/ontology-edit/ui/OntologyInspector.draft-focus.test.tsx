import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { OntologyInspector } from "./OntologyInspector";
import type { EphemeralNode } from "../lib/use-ephemeral-nodes";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const draft: EphemeralNode = {
  id: "eph-1",
  kind: "domain",
  kindLabel: "도메인",
  title: "",
  x: 0,
  y: 0,
};

function renderInspector(overrides: {
  onConnectSource?: () => void;
  onSaveEphemeral?: () => void;
  vaultReadOnly?: boolean;
}) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <OntologyInspector
        ephemeralSelected={draft}
        vaultSelected={null}
        vaultReadOnly={overrides.vaultReadOnly ?? true}
        untitledPlaceholder="(이름 입력)"
        onRenameEphemeral={() => {}}
        onSaveEphemeral={overrides.onSaveEphemeral}
        onConnectSource={overrides.onConnectSource}
        onEditVaultLiteral={() => {}}
        onEditVaultArrayKey={() => {}}
        onClearSelection={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

describe("OntologyInspector 초안 이름 입력 — 포커스/드래프트 보호 (persona QA '노드 증발')", () => {
  it("새 초안이 선택되면 이름 입력이 결정론적으로 포커스된다 (rAF 재시도)", async () => {
    const { container } = renderInspector({});
    const input = container.querySelector<HTMLInputElement>(
      'input[name="node-title"]',
    );
    expect(input).not.toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });

  it("읽기 전용에서 Enter 는 페이지를 떠나지 않는다 — /download 강제 이동 + 드래프트 소실 회귀 정정", () => {
    const onConnectSource = vi.fn();
    const { container } = renderInspector({ onConnectSource });
    const input = container.querySelector<HTMLInputElement>(
      'input[name="node-title"]',
    )!;
    fireEvent.keyDown(input, { key: "Enter" });
    // 예전엔 여기서 onConnectSource() → router.push('/download') 로 초안을
    // 잃으며 강제 이동했다. 이제 Enter 는 파괴적 동작을 하지 않는다.
    expect(onConnectSource).not.toHaveBeenCalled();
  });
});
