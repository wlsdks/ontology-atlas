import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FootprintTrailEntry } from "../lib/footprint-trail";
import { PAST_WALK_MIN_ENTRIES } from "../lib/past-trail-record";
import { usePastTrails, type UsePastTrailsArgs } from "./use-past-trails";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

/**
 * A minimal in-memory stand-in for the vault folder: the past-trail sidecar lives
 * in `<vault>/<dir>/<file>` and the hook only ever touches it through the File
 * System Access surface used by `createVaultFilePastTrailStore`.
 */
function fakeVaultHandle(permission: "granted" | "denied"): FileSystemDirectoryHandle {
  const files = new Map<string, string>();
  const fileHandle = (name: string) => ({
    kind: "file",
    name,
    getFile: async () => ({ text: async () => files.get(name) ?? "" }),
    createWritable: async () => ({
      write: async (text: string) => {
        files.set(name, text);
      },
      close: async () => undefined,
    }),
  });
  const dirHandle = {
    kind: "directory",
    name: "sidecar",
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      if (!files.has(name) && !options?.create) throw new Error("NotFoundError");
      return fileHandle(name);
    },
    removeEntry: async (name: string) => {
      files.delete(name);
    },
  };
  return {
    kind: "directory",
    name: "vault",
    queryPermission: async () => permission,
    getDirectoryHandle: async () => dirHandle,
  } as unknown as FileSystemDirectoryHandle;
}

function entries(count: number): FootprintTrailEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `capability:node-${index}`,
    title: `Node ${index}`,
    kind: "capability",
  }));
}

function args(overrides: Partial<UsePastTrailsArgs> = {}): UsePastTrailsArgs {
  return {
    vaultHandle: null,
    vaultLoaded: false,
    footprintTrailEntries: [],
    footprintNodeLookup: new Map(),
    mountNowMs: Date.UTC(2026, 7, 30, 12),
    setFootprintTrail: vi.fn(),
    lastVisitedNodeRef: { current: null },
    ...overrides,
  };
}

describe("usePastTrails", () => {
  it("keeps nothing and shows no notice while no vault is open", () => {
    const { result } = renderHook(() => usePastTrails(args()));

    expect(result.current.pastWalkRows).toEqual([]);
    expect(result.current.pastTrailNotice).toBeNull();
  });

  it("explains a read-only vault instead of failing silently", async () => {
    const { result } = renderHook(() =>
      usePastTrails(args({ vaultHandle: fakeVaultHandle("denied"), vaultLoaded: true })),
    );

    await waitFor(() => {
      expect(result.current.pastTrailNotice).toBe("footprint.pastReadOnlyNotice");
    });
  });

  it("writes the walk in progress and lists it only once a new session starts", async () => {
    vi.useFakeTimers();
    try {
      const walked = entries(PAST_WALK_MIN_ENTRIES);
      const lookup = new Map(walked.map((entry) => [entry.id, { label: entry.title, kind: entry.kind }]));
      const setFootprintTrail = vi.fn();
      const lastVisitedNodeRef = { current: walked[walked.length - 1].id as string | null };
      const handle = fakeVaultHandle("granted");
      const { result, rerender } = renderHook(
        (trail: readonly FootprintTrailEntry[]) =>
          usePastTrails(
            args({
              vaultHandle: handle,
              vaultLoaded: true,
              footprintTrailEntries: trail,
              footprintNodeLookup: lookup,
              setFootprintTrail,
              lastVisitedNodeRef,
            }),
          ),
        { initialProps: [] as readonly FootprintTrailEntry[] },
      );
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(result.current.pastTrailNotice).toBeNull();

      rerender(walked);
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      // The row being walked is excluded from the list.
      expect(result.current.pastWalkRows).toEqual([]);

      // Clearing forgets the session row too, so a later list stays empty.
      act(() => {
        result.current.clearFootprintTrail();
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(setFootprintTrail).toHaveBeenCalledWith([]);
      expect(lastVisitedNodeRef.current).toBeNull();
      expect(result.current.pastWalkRows).toEqual([]);
      expect(result.current.replayPastWalk("missing")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
