import { describe, expect, it } from "vitest";
import {
  resolveBuilderShortcut,
  type BuilderKeyEvent,
  type BuilderShortcutState,
} from "./resolve-builder-shortcut";

function ev(overrides: Partial<BuilderKeyEvent> = {}): BuilderKeyEvent {
  return {
    key: "p",
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    isTextEntryTarget: false,
    ...overrides,
  };
}

function state(overrides: Partial<BuilderShortcutState> = {}): BuilderShortcutState {
  return {
    hasSelection: false,
    fullscreen: false,
    selectionRemovable: false,
    ...overrides,
  };
}

describe("resolveBuilderShortcut", () => {
  it("P/N/D/C/E → 해당 kind 노드 추가", () => {
    expect(resolveBuilderShortcut(ev({ key: "p" }), state())).toEqual({
      type: "addNode",
      kind: "project",
    });
    expect(resolveBuilderShortcut(ev({ key: "N" }), state())).toEqual({
      type: "addNode",
      kind: "project",
    });
    expect(resolveBuilderShortcut(ev({ key: "d" }), state())).toEqual({
      type: "addNode",
      kind: "domain",
    });
    expect(resolveBuilderShortcut(ev({ key: "C" }), state())).toEqual({
      type: "addNode",
      kind: "capability",
    });
    expect(resolveBuilderShortcut(ev({ key: "e" }), state())).toEqual({
      type: "addNode",
      kind: "element",
    });
  });

  it("키를 누르고 있는 repeat keydown 은 무시 — 노드 spam 방지 (회귀 가드)", () => {
    expect(
      resolveBuilderShortcut(ev({ key: "c", repeat: true }), state()),
    ).toBeNull();
    // fullscreen 토글도 repeat 시 깜빡이지 않게 무시
    expect(
      resolveBuilderShortcut(ev({ key: "f", repeat: true }), state()),
    ).toBeNull();
  });

  it("텍스트 입력 요소 focus 시 모든 단축키 비활성", () => {
    expect(
      resolveBuilderShortcut(ev({ key: "p", isTextEntryTarget: true }), state()),
    ).toBeNull();
  });

  it("add-node 키는 modifier 동반 시 비간섭 (Cmd+P 인쇄 등)", () => {
    expect(resolveBuilderShortcut(ev({ key: "p", metaKey: true }), state())).toBeNull();
    expect(resolveBuilderShortcut(ev({ key: "p", ctrlKey: true }), state())).toBeNull();
    expect(resolveBuilderShortcut(ev({ key: "p", altKey: true }), state())).toBeNull();
  });

  it("F → fullscreen 토글", () => {
    expect(resolveBuilderShortcut(ev({ key: "f" }), state())).toEqual({
      type: "toggleFullscreen",
    });
  });

  it("Esc — 선택 있으면 해제, 없고 fullscreen 이면 종료, 둘 다 아니면 no-op", () => {
    expect(
      resolveBuilderShortcut(ev({ key: "Escape" }), state({ hasSelection: true })),
    ).toEqual({ type: "deselect" });
    expect(
      resolveBuilderShortcut(
        ev({ key: "Escape" }),
        state({ hasSelection: false, fullscreen: true }),
      ),
    ).toEqual({ type: "exitFullscreen" });
    expect(resolveBuilderShortcut(ev({ key: "Escape" }), state())).toBeNull();
  });

  it("Delete/Backspace — 제거 가능한 선택이 있을 때만 removeSelected", () => {
    expect(
      resolveBuilderShortcut(
        ev({ key: "Delete" }),
        state({ hasSelection: true, selectionRemovable: true }),
      ),
    ).toEqual({ type: "removeSelected" });
    // 선택은 있지만 제거 불가(ephemeral 아님) → no-op
    expect(
      resolveBuilderShortcut(
        ev({ key: "Backspace" }),
        state({ hasSelection: true, selectionRemovable: false }),
      ),
    ).toBeNull();
    // 선택 없음 → no-op
    expect(
      resolveBuilderShortcut(ev({ key: "Delete" }), state()),
    ).toBeNull();
  });

  it("매핑 없는 키 → null", () => {
    expect(resolveBuilderShortcut(ev({ key: "z" }), state())).toBeNull();
  });
});
