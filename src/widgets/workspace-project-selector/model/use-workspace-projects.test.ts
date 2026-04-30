import { afterEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  DEMO_SESSION_STORAGE_KEY,
  persistDemoSession,
} from "@/shared/lib/demo-session";
import { useWorkspaceProjects } from "./use-workspace-projects";

afterEach(() => {
  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
});

describe("useWorkspaceProjects", () => {
  it("accountId 가 없으면 빈 배열로 수렴하고 loading=false", async () => {
    const { result } = renderHook(() => useWorkspaceProjects(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.projects).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("데모 세션이면 빈 배열로 수렴", async () => {
    persistDemoSession({
      uid: "demo-uid",
      email: null,
      displayName: null,
      provider: "demo",
    });
    const { result } = renderHook(() => useWorkspaceProjects("demo-uid"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.projects).toEqual([]);
  });
});
