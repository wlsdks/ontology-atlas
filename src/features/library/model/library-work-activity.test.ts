import { describe, expect, it } from "vitest";

import {
  EMPTY_LIBRARY_WORK_ACTIVITY,
  LIBRARY_WORK_EVENT_LIMIT,
  appendLibraryWorkReceipt,
  beginLibraryWork,
  clearLibraryWork,
  completeLibraryWork,
  completedAcpReadEvent,
  libraryWorkEventFromAcpSnapshot,
  libraryWorkEventFromLocalSnapshot,
  libraryWorkTargetFromToolInput,
  localCompileWaitingEvent,
  observedWikiWriteEvents,
  successfulLocalWriteEvents,
  showLibraryWorkStrip,
} from "./library-work-activity";

describe("Library work activity", () => {
  it('hides completed receipts behind a current report while retaining active and error work', () => {
    const complete = { id: 'r', kind: 'read' as const, phase: 'complete' as const, target: null, at: 1 };
    const activity = { isActive: false, current: null, recent: [complete] };
    expect(showLibraryWorkStrip(activity, false)).toBe(true);
    expect(showLibraryWorkStrip(activity, true)).toBe(false);
    expect(showLibraryWorkStrip({ ...activity, recent: [{ ...complete, kind: 'write' }] }, true)).toBe(false);
    expect(showLibraryWorkStrip({ ...activity, isActive: true, current: { ...complete, phase: 'active' } }, true)).toBe(true);
    expect(showLibraryWorkStrip({ ...activity, isActive: true, current: { ...complete, kind: 'waiting', phase: 'active' } }, true)).toBe(true);
    expect(showLibraryWorkStrip({ ...activity, recent: [{ ...complete, kind: 'error' }] }, true)).toBe(true);
  });

  it("accepts only structured vault paths, never a sentence that happens to name one", () => {
    expect(libraryWorkTargetFromToolInput({ filePath: "/vault/sources/plan.pdf" }, "/vault")).toEqual({ kind: "source", ref: "sources/plan.pdf" });
    expect(libraryWorkTargetFromToolInput({ text: "read sources/plan.pdf" }, "/vault")).toBeNull();
    expect(libraryWorkTargetFromToolInput({ filePath: "/outside/sources/plan.pdf" }, "/vault")).toBeNull();
    expect(libraryWorkTargetFromToolInput({ server: "atlas-vault", tool: "read_source", arguments: { filePath: "sources/plan.pdf" } }, "/vault")).toEqual({ kind: "source", ref: "sources/plan.pdf" });
    expect(libraryWorkTargetFromToolInput({ arguments: { filePath: "sources/plan.pdf" } }, "/vault")).toBeNull();
  });

  it("keeps an ACP write provisional and a permission wait active", () => {
    expect(
      libraryWorkEventFromAcpSnapshot({ id: "p1", toolKind: "write", status: "pending", rawInput: { filePath: "/vault/wiki/plan.md" }, pendingPermission: false }, "/vault", 1),
    ).toMatchObject({ kind: "proposal", phase: "active", target: { kind: "wiki", ref: "wiki/plan" } });
    expect(
      libraryWorkEventFromAcpSnapshot({ id: "p1", toolKind: "write", status: "pending", rawInput: { filePath: "/vault/wiki/plan.md" }, pendingPermission: true }, "/vault", 2),
    ).toMatchObject({ kind: "waiting", phase: "active" });
    expect(
      libraryWorkEventFromAcpSnapshot({ id: "p2", toolKind: "edit", status: "pending", rawInput: { filePath: "/vault/wiki/plan.md" }, pendingPermission: false }, "/vault", 3),
    ).toMatchObject({ id: "acp:p2:write", workId: "acp:p2", kind: "proposal", phase: "active" });
    expect(
      libraryWorkEventFromAcpSnapshot({ id: "p2", toolKind: "edit", status: "pending", rawInput: { filePath: "/vault/wiki/plan.md" }, pendingPermission: true }, "/vault", 3),
    ).toMatchObject({ workId: "acp:p2", kind: "waiting", phase: "active" });
    expect(libraryWorkEventFromAcpSnapshot({ id: "x", toolKind: "shell", status: "pending", rawInput: {}, pendingPermission: false }, "/vault", 3)).toBeNull();
    expect(libraryWorkEventFromAcpSnapshot({ id: "done", toolKind: "read", status: "completed", rawInput: { path: "sources/a.txt" }, pendingPermission: false }, "/vault", 4)).toBeNull();
  });

  it("makes local reads active only while executing and turns a failed proposal into an error receipt", () => {
    expect(
      libraryWorkEventFromLocalSnapshot({ id: "r1", name: "read_source_text", args: { path: "sources/plan.txt" }, phase: "active", outcome: null }, "/vault", 1),
    ).toMatchObject({ kind: "read", phase: "active", target: { kind: "source", ref: "sources/plan.txt" } });
    expect(
      libraryWorkEventFromLocalSnapshot({ id: "p1", name: "propose_wiki_page", args: { slug: "plan" }, phase: "complete", outcome: "error" }, "/vault", 2),
    ).toMatchObject({ kind: "error", phase: "complete", target: null });
  });

  it("does not turn a local compiler's empty wait into graph work", () => {
    expect(localCompileWaitingEvent("turn-1", 1, false)).toBeNull();
    expect(localCompileWaitingEvent("turn-1", 1, true)).toMatchObject({
      workId: "local:turn-1",
      kind: "waiting",
      phase: "active",
    });
    expect(localCompileWaitingEvent("turn-1", 1, true, ["wiki/answers/date.md"])?.target)
      .toEqual({ kind: "wiki", ref: "wiki/answers/date" });
    expect(localCompileWaitingEvent("turn-1", 1, true, ["wiki/a.md", "wiki/b.md"])?.target).toBeNull();
  });

  it("identifies existing nested wiki reads and proposals without guessing another path", () => {
    for (const name of ["read_wiki_page", "propose_wiki_page"]) {
      expect(libraryWorkEventFromLocalSnapshot({ id: name, name, args: { slug: "wiki/answers/release-date" }, phase: "active", outcome: null }, "/vault", 1))
        .toMatchObject({ kind: name === "read_wiki_page" ? "read" : "proposal", target: { kind: "wiki", ref: "wiki/answers/release-date" } });
      expect(libraryWorkEventFromLocalSnapshot({ id: name, name, args: { slug: "wiki/../outside" }, phase: "active", outcome: null }, "/vault", 1)?.target).toBeNull();
    }
  });

  it.each(["plan", "wiki/plan.md"])("shows an existing Wiki read at its own target: %s", (slug) => {
    expect(libraryWorkEventFromLocalSnapshot({
      id: "wiki-read", name: "read_wiki_page", args: { slug }, phase: "active", outcome: null,
    }, "/vault", 1)).toMatchObject({ kind: "read", phase: "active", target: { kind: "wiki", ref: "wiki/plan" } });
    expect(libraryWorkEventFromLocalSnapshot({
      id: "wiki-read", name: "read_wiki_page", args: { slug }, phase: "complete", outcome: "error",
    }, "/vault", 2)).toMatchObject({ kind: "error", phase: "complete", target: null });
  });

  it.each(["../plan", "sources/plan.md", "wiki/../outside", "wiki/_template.md", "plan\\other", "plan.md"])(
    "does not infer a local Wiki target from a refused name: %s", (slug) => {
      expect(libraryWorkEventFromLocalSnapshot({
        id: "wiki-read", name: "read_wiki_page", args: { slug }, phase: "active", outcome: null,
      }, "/vault", 1)?.target).toBeNull();
    },
  );

  it("records only a completed ACP read and observed or successful writes", () => {
    expect(completedAcpReadEvent({ id: "read", kind: "tool", toolKind: "read", status: "pending", rawInput: { path: "sources/a.txt" } }, "/vault", 1)).toBeNull();
    expect(completedAcpReadEvent({ id: "read", kind: "tool", toolKind: "read", status: "failed", rawInput: { path: "sources/a.txt" } }, "/vault", 1)).toBeNull();
    expect(completedAcpReadEvent({ id: "read", kind: "tool", toolKind: "read", status: "cancelled", rawInput: { path: "sources/a.txt" } }, "/vault", 1)).toBeNull();
    expect(completedAcpReadEvent({ id: "read", kind: "tool", toolKind: "read", status: "completed", rawInput: { path: "sources/a.txt" } }, "/vault", 2)).toMatchObject({ kind: "read", phase: "complete" });
    expect(observedWikiWriteEvents(new Map([["wiki/a", 1]]), new Map([["wiki/a", 1], ["wiki/b", 2]]), 3)).toEqual([
      expect.objectContaining({ kind: "write", target: { kind: "wiki", ref: "wiki/b" } }),
    ]);
    expect(observedWikiWriteEvents(new Map(), new Map([["wiki/_log", 3]]), 3)).toEqual([]);
    expect(successfulLocalWriteEvents(["wiki/local.md"], "turn-1", 4)).toEqual([
      expect.objectContaining({ kind: "write", target: { kind: "wiki", ref: "wiki/local" } }),
    ]);
  });

  it("bounds receipts and clears waiting when the turn no longer has a real active step", () => {
    const active = { id: "wait", kind: "waiting" as const, phase: "active" as const, target: null, at: 1 };
    let activity = beginLibraryWork(EMPTY_LIBRARY_WORK_ACTIVITY, active);
    expect(activity).toMatchObject({ isActive: true, current: active });
    activity = clearLibraryWork(activity);
    expect(activity).toMatchObject({ isActive: false, current: null });
    for (let index = 0; index < LIBRARY_WORK_EVENT_LIMIT + 2; index += 1) {
      activity = completeLibraryWork(activity, { id: `r${index}`, kind: "read", phase: "complete", target: null, at: index });
    }
    expect(activity.recent).toHaveLength(LIBRARY_WORK_EVENT_LIMIT);
    expect(activity.recent[0]?.id).toBe(`r${LIBRARY_WORK_EVENT_LIMIT + 1}`);
  });

  it("appends a receipt without ending unrelated work, but completes its own matching tool", () => {
    const active = {
      id: "acp:next:read",
      workId: "acp:next",
      kind: "read" as const,
      phase: "active" as const,
      target: null,
      at: 1,
    };
    const receipt = {
      id: "acp:previous:read-complete",
      workId: "acp:previous",
      kind: "read" as const,
      phase: "complete" as const,
      target: null,
      at: 2,
    };
    const current = beginLibraryWork(EMPTY_LIBRARY_WORK_ACTIVITY, active);
    expect(appendLibraryWorkReceipt(current, receipt)).toMatchObject({ isActive: true, current: active, recent: [receipt] });
    expect(completeLibraryWork(current, receipt)).toMatchObject({ isActive: true, current: active, recent: [receipt] });
    expect(completeLibraryWork(current, { ...receipt, id: "acp:next:read-complete", workId: "acp:next" })).toMatchObject({ isActive: false, current: null });
  });
});
