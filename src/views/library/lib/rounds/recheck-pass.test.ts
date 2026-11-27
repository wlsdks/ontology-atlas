import { describe, expect, it, vi } from "vitest";

import type { RoundPassEntry } from "@/entities/library-round";
import { RECHECK_MAX_SENT_BYTES, recheckBasis, type RecheckCandidate } from "@/features/library-rounds";
import type { RecheckCommitResult, RecheckGitState } from "@/shared/lib/git/tauri-recheck";

import { refusedLastCommit, runRecheckPass, type RecheckPassPorts, type RecheckTurn } from "./recheck-pass";

const HEAD = "a".repeat(40);
const doc = (title: string) => `---\nkind: capability\ntitle: ${title}\nevidence:\n  - src/${title}.ts\n---\n\n${title} body.\n`;

function candidate(slug: string, at: string, moved = [`src/${slug.split("/")[1]}.ts`]): RecheckCandidate {
  return { slug, path: `${slug}.md`, docCommit: `c-${slug}`, docChangedAt: at, moved, basis: recheckBasis(`c-${slug}`, moved.map((path) => ({ path, commit: "x" }))) };
}

const ready: RecheckGitState = { repository: true, head: HEAD, branch: "work", remoteDefault: "main", hold: null };
const answer = (answers: unknown[]) => `\`\`\`json\n${JSON.stringify({ answers })}\n\`\`\``;
const turnWith = (reply: string, overrides: Partial<RecheckTurn> = {}): RecheckTurn => ({
  stopped: false, failed: false, reply, sourceReads: [], refused: [], called: ["get_concepts"], ...overrides,
});
const committed = (overrides: Partial<RecheckCommitResult> = {}): RecheckCommitResult => ({
  outcome: "committed", commit: "b".repeat(40), written: [], changedMeanwhile: [], detail: null, restored: [], left: [], copy: null, ...overrides,
});

function ports(overrides: Partial<RecheckPassPorts> = {}, candidates = [candidate("capabilities/pay", "2026-01-01T00:00:00Z"), candidate("capabilities/ship", "2026-02-01T00:00:00Z")]) {
  const base: RecheckPassPorts = {
    gitState: vi.fn(async () => ready),
    staleCandidates: vi.fn(async () => candidates),
    uncommitted: vi.fn(async () => []),
    readDocument: vi.fn(async (path: string) => doc(path.split("/")[1]!.replace(".md", ""))),
    diffs: vi.fn(async (requests: readonly { commit: string; path: string }[]) => requests.map((request) => ({ ...request, refused: false, diff: `-old ${request.path}\n+new`, lines: 2, cut: false }))),
    agentTurn: vi.fn(async () => turnWith(answer([{ slug: "capabilities/pay", verdict: "accurate" }, { slug: "capabilities/ship", verdict: "outdated", reason: "ships twice" }]))),
    commit: vi.fn(async () => committed()),
  };
  return { ...base, ...overrides };
}

const input = (port: RecheckPassPorts, overrides: Partial<Parameters<typeof runRecheckPass>[0]> = {}) => ({
  ports: port, roundId: "r1", limit: 10, trigger: "clock" as const, passId: "p1", vaultRoot: "/repo/docs", locale: "en",
  agentReady: true, previous: [] as RoundPassEntry[], raised: new Set<string>(), ...overrides,
});

describe("a recheck run", () => {
  it("commits a mark in each still-accurate document only, at the HEAD it read, and lists the rest", async () => {
    const port = ports();
    const result = await runRecheckPass(input(port));
    expect(result.outcome).toBe("rechecked");
    expect(result.recheck.commit).toBe("b".repeat(40));
    const call = vi.mocked(port.commit).mock.calls[0]![0];
    expect(call.expectedHead).toBe(HEAD);
    expect(call.documents.map((document) => document.path)).toEqual(["capabilities/pay.md"]);
    expect(call.documents[0]!.after).toBe(call.documents[0]!.before.replace("---\n\n", `evidence_checked: ${HEAD}\n---\n\n`));
    expect(call.message).toContain("Still accurate:\n- capabilities/pay");
    expect(call.message).toContain("Out of date, left as it is:\n- capabilities/ship");
    expect(result.recheck.concepts.map((concept) => [concept.slug, concept.outcome])).toEqual([["capabilities/pay", "accurate"], ["capabilities/ship", "outdated"]]);
    expect(result.recheck.sentBytes).toBeGreaterThan(0);
  });

  it.each<[string, RecheckGitState | null, string]>([
    ["no repository", { ...ready, repository: false, head: null }, "git"],
    ["a merge in progress", { ...ready, hold: { reason: "git", detail: "merge in progress" } }, "git"],
    ["the remote's default branch", { ...ready, branch: "main", hold: { reason: "branch", detail: "main" } }, "branch"],
  ])("holds on %s before any concept is read or sent", async (_name, state, reason) => {
    const port = ports({ gitState: vi.fn(async () => state) });
    const result = await runRecheckPass(input(port));
    expect(result).toMatchObject({ outcome: "held", agentTurns: 0, recheck: { hold: { reason } } });
    expect(port.staleCandidates).not.toHaveBeenCalled();
    expect(port.agentTurn).not.toHaveBeenCalled();
  });

  it("after Git refused its last commit, holds a clock run and lets Run now try again", async () => {
    const refused: RoundPassEntry = {
      v: 1, id: "p0", roundId: "r1", kind: "recheck", startedAt: "", endedAt: "", outcome: "failed", checked: 1, stale: [], written: [],
      refused: [], called: [], agentTurns: 1, summary: "", trigger: "clock",
      recheck: { concepts: [], sentBytes: 1, waiting: 0, skippedUncommitted: 0, ignored: 0, error: "commit-refused", detail: "node: command not found" },
    };
    expect(refusedLastCommit([refused], "r1")).toBe("node: command not found");
    const held = await runRecheckPass(input(ports(), { previous: [refused] }));
    expect(held).toMatchObject({ outcome: "held", recheck: { hold: { reason: "refused", detail: "node: command not found" } } });
    const manual = await runRecheckPass(input(ports(), { previous: [refused], trigger: "manual" }));
    expect(manual.outcome).toBe("rechecked");
    expect(refusedLastCommit([refused, { ...refused, id: "p2", recheck: { ...refused.recheck!, error: undefined, commit: "c".repeat(40) } }], "r1")).toBeNull();
  });

  it("runs no agent when no concept's code changed", async () => {
    const port = ports({}, []);
    expect(await runRecheckPass(input(port))).toMatchObject({ outcome: "held", agentTurns: 0, checked: 0 });
    expect(port.agentTurn).not.toHaveBeenCalled();
  });

  it("takes the oldest concepts up to the limit and says how many wait", async () => {
    const port = ports();
    const result = await runRecheckPass(input(port, { limit: 1 }));
    expect(result.checked).toBe(1);
    expect(result.recheck.waiting).toBe(1);
    expect(vi.mocked(port.agentTurn).mock.calls[0]![0]).toContain("capabilities/pay");
    expect(vi.mocked(port.agentTurn).mock.calls[0]![0]).not.toContain("## Concept 2");
  });

  it("lets a concept wait when it would take the run past the size cap", async () => {
    const huge = "x".repeat(RECHECK_MAX_SENT_BYTES);
    const port = ports({ readDocument: vi.fn(async (path: string) => (path.includes("pay") ? doc("pay") + huge : doc("ship"))) });
    const result = await runRecheckPass(input(port));
    expect(result.recheck.waiting).toBe(1);
    expect(result.recheck.sentBytes).toBeLessThanOrEqual(RECHECK_MAX_SENT_BYTES);
    expect(vi.mocked(port.agentTurn).mock.calls[0]![0]).not.toContain(huge);
  });

  it("sends at most 200 KB when 25 concepts of 20 KB each are stale", async () => {
    const slugs = Array.from({ length: 25 }, (_, index) => `capabilities/c${String(index).padStart(2, "0")}`);
    const diff = "-old\n+new";
    const port = ports(
      {
        readDocument: vi.fn(async (path: string) => doc(path).padEnd(20_000 - diff.length, "x")),
        diffs: vi.fn(async (requests: readonly { commit: string; path: string }[]) => requests.map((request) => ({ ...request, refused: false, diff, lines: 2, cut: false }))),
        agentTurn: vi.fn(async () => turnWith(answer([]))),
      },
      slugs.map((slug, index) => candidate(slug, `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`)),
    );
    const result = await runRecheckPass(input(port, { limit: 25 }));
    expect(result.recheck.sentBytes).toBe(RECHECK_MAX_SENT_BYTES);
    expect(result.recheck.waiting).toBe(15);
    const brief = vi.mocked(port.agentTurn).mock.calls[0]![0];
    expect(brief.match(/^## Concept \d+/gm)).toHaveLength(10);
  });

  it("sends nothing of a concept whose cited path is refused, and reports it", async () => {
    const port = ports({
      diffs: vi.fn(async (requests: readonly { commit: string; path: string }[]) => requests.map((request) => ({ ...request, refused: request.path.includes("pay"), diff: request.path.includes("pay") ? null : "+new", lines: 1, cut: false }))),
    });
    const result = await runRecheckPass(input(port));
    expect(result.recheck.concepts).toContainEqual(expect.objectContaining({ slug: "capabilities/pay", outcome: "left", leftReason: "refused-path", leftPath: "src/pay.ts" }));
    expect(port.readDocument).not.toHaveBeenCalledWith("capabilities/pay.md");
    expect(vi.mocked(port.agentTurn).mock.calls[0]![0]).not.toContain("## Concept 2");
  });

  it("writes nothing when the reply cannot be read, the agent was stopped, or no agent is ready", async () => {
    const unreadable = ports({ agentTurn: vi.fn(async () => turnWith("All good.")) });
    expect(await runRecheckPass(input(unreadable))).toMatchObject({ outcome: "failed", recheck: { error: "reply-unreadable" } });
    const stopped = ports({ agentTurn: vi.fn(async () => turnWith(answer([{ slug: "capabilities/pay", verdict: "accurate" }]), { stopped: true })) });
    expect(await runRecheckPass(input(stopped))).toMatchObject({ outcome: "failed", note: "stopped" });
    const noAgent = ports();
    expect(await runRecheckPass(input(noAgent, { agentReady: false }))).toMatchObject({ outcome: "failed", note: "no-agent", agentTurns: 0 });
    for (const port of [unreadable, stopped, noAgent]) expect(port.commit).not.toHaveBeenCalled();
    expect(noAgent.agentTurn).not.toHaveBeenCalled();
  });

  it("records no mark when HEAD moved or Git refused the commit, and keeps Git's words", async () => {
    const moved = await runRecheckPass(input(ports({ commit: vi.fn(async () => committed({ outcome: "head-moved", commit: null })) })));
    expect(moved).toMatchObject({ outcome: "failed", recheck: { error: "head-moved" } });
    expect(moved.recheck.concepts.every((concept) => concept.outcome !== "accurate")).toBe(true);
    const refused = await runRecheckPass(input(ports({
      commit: vi.fn(async () => committed({ outcome: "refused", commit: null, detail: "hook says no", restored: ["capabilities/pay.md"], copy: ".ontology-atlas/undone/p1/" })),
    })));
    expect(refused).toMatchObject({ outcome: "failed", recheck: { error: "commit-refused", detail: "hook says no", restored: 1, copy: ".ontology-atlas/undone/p1/" } });
  });

  it("names a document that changed while the agent read it instead of counting it accurate", async () => {
    const result = await runRecheckPass(input(ports({ commit: vi.fn(async () => committed({ outcome: "nothing", commit: null, changedMeanwhile: ["capabilities/pay.md"] })) })));
    expect(result.recheck.concepts[0]).toMatchObject({ outcome: "left", leftReason: "changed-meanwhile" });
    expect(result.recheck.commit).toBeUndefined();
  });

  it("skips concepts with uncommitted changes and counts them", async () => {
    const port = ports({ uncommitted: vi.fn(async () => ["src/pay.ts"]) });
    const result = await runRecheckPass(input(port));
    expect(result.recheck.skippedUncommitted).toBe(1);
    expect(result.recheck.concepts.map((concept) => concept.slug)).toEqual(["capabilities/ship"]);
  });
});
