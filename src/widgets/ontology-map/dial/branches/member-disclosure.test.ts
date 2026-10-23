import { describe, expect, it } from "vitest";
import { MOTION } from "@/shared/motion/tokens";
import type { DialCluster, DialRowAction, DialScene } from "../types";
import { applyBranchMemberAction, branchMemberAlpha, branchMemberCount, branchMembersAnimating } from "./member-disclosure";

function sceneOf(total = 7): DialScene {
  const cluster = { domainId: "d", items: Array.from({ length: total }, (_, i) => ({ id: `c${i}`, direct: false })) } as DialCluster;
  return { branches: true, branchPreviewRows: 2, clusters: [cluster], clusterByDomain: new Map([["d", cluster]]) } as unknown as DialScene;
}
const more: DialRowAction = { type: "branch-members", domainId: "d", direction: "more" };
const less: DialRowAction = { ...more, direction: "less" };
const duration = MOTION.base.duration * 1000;

describe("scene member disclosure", () => {
  it("reveals the next bounded batch, reaches the total and collapses to the original preview", () => {
    const scene = sceneOf();
    expect(branchMemberCount(scene, "d")).toBe(2);
    expect(applyBranchMemberAction(scene, more, 100)).toBe(true);
    expect(branchMemberCount(scene, "d")).toBe(4);
    applyBranchMemberAction(scene, more, 100 + duration);
    expect(branchMemberCount(scene, "d")).toBe(6);
    applyBranchMemberAction(scene, more, 100 + duration * 2);
    expect(branchMemberCount(scene, "d")).toBe(7);
    expect(applyBranchMemberAction(scene, more, 100 + duration * 3)).toBe(false);
    expect(applyBranchMemberAction(scene, less, 100 + duration * 3)).toBe(true);
    expect(branchMemberCount(scene, "d")).toBe(2);
    expect(branchMemberCount({ ...scene }, "d")).toBe(2);
  });

  it("fades new members in and reverses continuously when collapse interrupts the entrance", () => {
    const scene = sceneOf();
    applyBranchMemberAction(scene, more, 0);
    expect(branchMemberAlpha(scene, "d", 2, 0)).toBe(0);
    const middle = branchMemberAlpha(scene, "d", 2, duration / 2);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
    applyBranchMemberAction(scene, less, duration / 2);
    expect(branchMemberAlpha(scene, "d", 2, duration / 2)).toBe(middle);
    expect(branchMemberAlpha(scene, "d", 2, duration)).toBeLessThan(middle);
    expect(branchMemberAlpha(scene, "d", 2, duration * 1.5)).toBe(0);
    expect(branchMembersAnimating(scene, duration)).toBe(true);
    expect(branchMembersAnimating(scene, duration * 1.5)).toBe(false);
  });

  it("honors reduced motion and keeps disclosure independent between scene identities", () => {
    const scene = sceneOf();
    applyBranchMemberAction(scene, more, 0);
    expect(branchMemberAlpha(scene, "d", 2, 0, true)).toBe(1);
    expect(branchMemberCount({ ...scene }, "d")).toBe(2);
    applyBranchMemberAction(scene, less, 1);
    expect(branchMemberAlpha(scene, "d", 2, 1, true)).toBe(0);
    expect(applyBranchMemberAction(scene, { ...more, domainId: "absent" }, 1)).toBe(false);
  });
});
