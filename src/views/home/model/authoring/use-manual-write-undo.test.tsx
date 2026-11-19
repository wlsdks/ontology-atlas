import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useManualWriteUndo } from "./use-manual-write-undo";

function setup() {
  const files = new Map<string, string>([["domains/a", "old"]]);
  const handleFor = (slug: string) => ({ getFile: async () => ({ text: async () => files.get(slug) ?? "" }) });
  const vault = {
    get fileHandles() {
      return new Map([...files.keys()].map((slug) => [slug, handleFor(slug)]));
    },
    saveDoc: vi.fn(async (slug: string, content: string) => void files.set(slug, content)),
    createDoc: vi.fn(async (slug: string, content: string) => void files.set(slug, content)),
    deleteDoc: vi.fn(async (slug: string) => void files.delete(slug)),
  };
  const toast = { show: vi.fn(), dismiss: vi.fn() };
  const hook = renderHook(
    ({ folder }: { folder: string }) =>
      useManualWriteUndo({ vault: vault as never, folder, toast, t: (key) => key }),
    { initialProps: { folder: "local:a" } },
  );
  const edit = () =>
    act(() =>
      hook.result.current.runManualWrite({
        slug: "domains/a",
        write: () => vault.saveDoc("domains/a", "new"),
        message: "saved",
      }),
    );
  return { files, vault, toast, hook, edit };
}

describe("undo of a manual write from the keyboard", () => {
  it("puts back the bytes from before the last write, after its toast is gone", async () => {
    const { files, hook, edit } = setup();
    await edit();
    expect(files.get("domains/a")).toBe("new");

    let undid = false;
    await act(async () => {
      undid = hook.result.current.undoLastManualWrite();
    });
    expect(undid).toBe(true);
    expect(files.get("domains/a")).toBe("old");
    expect(hook.result.current.undoLastManualWrite()).toBe(false);
  });

  it("writes nothing once another folder is open", async () => {
    const { files, vault, toast, hook, edit } = setup();
    await edit();
    vault.saveDoc.mockClear();
    hook.rerender({ folder: "local:b" });

    await act(async () => {
      hook.result.current.undoLastManualWrite();
    });
    expect(vault.saveDoc).not.toHaveBeenCalled();
    expect(vault.createDoc).not.toHaveBeenCalled();
    expect(vault.deleteDoc).not.toHaveBeenCalled();
    expect(files.get("domains/a")).toBe("new");
    expect(toast.show).toHaveBeenLastCalledWith("manualWrite.undoOtherFolder", "info");
  });
});
