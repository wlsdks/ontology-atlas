import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  OPEN_SETTINGS_EVENT,
  OPEN_SHORTCUTS_EVENT,
  requestSettingsOpen,
  requestShortcutSheet,
  useSurfaceRequest,
} from "./surface-requests";

describe("surface requests", () => {
  it("reports unclaimed when nobody listens", () => {
    expect(requestSettingsOpen()).toBe(false);
  });

  it("lets the first handler that returns true claim, and skips the rest", () => {
    const hidden = vi.fn(() => false);
    const visible = vi.fn(() => true);
    const late = vi.fn(() => true);
    const a = renderHook(() => useSurfaceRequest(OPEN_SETTINGS_EVENT, hidden));
    const b = renderHook(() => useSurfaceRequest(OPEN_SETTINGS_EVENT, visible));
    const c = renderHook(() => useSurfaceRequest(OPEN_SETTINGS_EVENT, late));

    expect(requestSettingsOpen()).toBe(true);
    expect(hidden).toHaveBeenCalledTimes(1);
    expect(visible).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();

    a.unmount();
    b.unmount();
    c.unmount();
  });

  it("keeps the two events apart", () => {
    const settings = vi.fn(() => true);
    const shortcuts = vi.fn(() => true);
    const a = renderHook(() => useSurfaceRequest(OPEN_SETTINGS_EVENT, settings));
    const b = renderHook(() => useSurfaceRequest(OPEN_SHORTCUTS_EVENT, shortcuts));

    expect(requestShortcutSheet()).toBe(true);
    expect(settings).not.toHaveBeenCalled();
    expect(shortcuts).toHaveBeenCalledTimes(1);

    a.unmount();
    b.unmount();
  });

  it("stops listening after unmount", () => {
    const handler = vi.fn(() => true);
    const { unmount } = renderHook(() => useSurfaceRequest(OPEN_SETTINGS_EVENT, handler));
    unmount();
    expect(requestSettingsOpen()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
