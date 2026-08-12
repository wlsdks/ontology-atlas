import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useConstructionReviewSession } from "./use-construction-review-session";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

function minimalEnvelope() {
  const plan = { concepts: [], relations: [], competencyAnswers: {} };
  return {
    qualification: {
      contract: "constructionQualification:v1",
      subject: { projectSlug: "atlas", graphDigest: DIGEST_A, sourceDigest: DIGEST_B },
      purposeAuthority: { outcome: "Share one meaning." },
      competencyQuestions: [], witnesses: [], cqResults: [], claims: [], citationChecks: [],
      axisResults: [], diagnostics: [],
      acceptance: { decision: "accepted", decidedBy: "jinan", authority: "human", planDigest: DIGEST_A },
    },
    analysis: {
      project: { slug: "atlas" },
      proposalValidation: {
        reviewPlan: plan,
        writePlan: structuredClone(plan),
        findings: [],
        constructionLifecycle: {
          contract: "ontologyConstructionLifecycle:v1",
          qualificationStatus: "qualified",
          writeEligibility: "executable",
          planDigest: DIGEST_A,
          sourceDigest: DIGEST_B,
          firstBlockingPhase: null,
          diagnostics: [],
          nextAction: "Write the returned rows.",
        },
      },
    },
  };
}

describe("construction review local session", () => {
  it("reads one JSON file into memory and never stores it", async () => {
    const { result } = renderHook(() => useConstructionReviewSession("atlas"));

    await act(async () => {
      await result.current.readFile(
        new File([JSON.stringify(minimalEnvelope())], "review.json", { type: "application/json" }),
      );
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.review?.projectSlug).toBe("atlas");
    expect(localStorage).toHaveLength(0);
  });

  it("keeps malformed input visible as blocked instead of retaining a previous green result", async () => {
    const { result } = renderHook(() => useConstructionReviewSession("atlas"));
    await act(async () => {
      await result.current.readFile(
        new File([JSON.stringify(minimalEnvelope())], "good.json", { type: "application/json" }),
      );
      await result.current.readFile(new File(["{"], "broken.json", { type: "application/json" }));
    });

    expect(result.current.status).toBe("blocked");
    expect(result.current.review).toBeNull();
    expect(result.current.errorState).toBe("malformed");
  });
});
