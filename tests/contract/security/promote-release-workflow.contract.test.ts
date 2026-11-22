import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Promotion publishes a beta's own bytes as a stable release. Its trust boundary is how the workflow
 * is written: it starts only by hand from main, builds and signs nothing, reads no secret, writes
 * only in the two jobs that must, and goes public only behind the `release` approval after both
 * tags are pinned again to the admitted commit.
 */

const WORKFLOW = ".github/workflows/promote-release.yml";

function jobBlock(source: string, job: string): string {
  const heading = new RegExp(`^  ${job}:\\s*$`, "m").exec(source);
  if (!heading) throw new Error(`${WORKFLOW}: job ${job} is missing`);
  const after = source.slice(heading.index + heading[0].length);
  const next = /^  [A-Za-z0-9_-]+:\s*$/m.exec(after);
  return source.slice(heading.index, next ? heading.index + heading[0].length + next.index : source.length);
}

function jobHeader(source: string, job: string): string {
  const block = jobBlock(source, job);
  const at = block.indexOf("\n    steps:");
  if (at < 0) throw new Error(`${job} has no steps`);
  return block.slice(0, at);
}

function jobNames(source: string): string[] {
  const at = source.indexOf("\njobs:\n");
  if (at < 0) throw new Error("no jobs block");
  return [...source.slice(at).matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((match) => match[1]);
}

function writes(source: string): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const job of jobNames(source)) {
    const permissions = /^    permissions:\n((?:      .*\n?)*)/m.exec(jobHeader(source, job))?.[1] ?? "";
    const keys = [...permissions.matchAll(/^      ([A-Za-z0-9-]+): write$/gm)].map((match) => match[1]);
    if (keys.length > 0) found[job] = keys;
  }
  return found;
}

function steps(job: string): { name: string; body: string }[] {
  const starts = [...job.matchAll(/^      - name: (.+?)\s*$/gm)];
  if (starts.length === 0) throw new Error("no steps parsed");
  return starts.map((match, index) => ({ name: match[1], body: job.slice(match.index, starts[index + 1]?.index ?? job.length) }));
}

function indexOfStep(all: { body: string }[], pattern: RegExp, label: string): number {
  const index = all.findIndex((step) => pattern.test(step.body));
  if (index < 0) throw new Error(`${label}: no step matches ${pattern}`);
  return index;
}

const PIN = /pnpm desktop:release-source -- --mode=pin --tag="\$\{RELEASE_TAG\}" --sha="\$\{RELEASE_SHA\}"\n\s+pnpm desktop:release-source -- --mode=pin --tag="\$\{BETA_TAG\}" --sha="\$\{RELEASE_SHA\}"/;

function assertPromotionWorkflow(source: string): void {
  const uncommented = source.replace(/^\s*#.*$/gm, "");
  if (!/^on:\n  workflow_dispatch:\n    inputs:\n      beta_tag:\n/m.test(uncommented)) {
    throw new Error("promotion must start only by workflow_dispatch with a beta_tag input");
  }
  if (/^  (push|pull_request|pull_request_target|schedule|workflow_call|release):/m.test(uncommented)) {
    throw new Error("promotion has a trigger beside workflow_dispatch");
  }
  if (!/^run-name: Promote Desktop Beta \$\{\{ inputs\.beta_tag \}\}$/m.test(source)) {
    throw new Error("run-name must be the title desktop:release-run looks for");
  }
  if (!/^permissions:\n  contents: read\s*$/m.test(source)) throw new Error("the workflow default must be read-only");
  if (/\$\{\{\s*secrets\./.test(source)) throw new Error("promotion reads a secret");
  if (/environment:\s*release-signing/.test(source)) throw new Error("promotion reaches the signing environment");
  if (/\b(tauri|cargo|codesign|notarytool|xcrun)\b|desktop:release-artifact|desktop:build|mcp:build|pnpm build\b|pnpm install/.test(uncommented)) {
    throw new Error("promotion builds, installs or signs something");
  }
  if (/\bgit\s+(tag|push)\b|--target\b|target_commitish/.test(uncommented)) {
    throw new Error("promotion creates or moves a tag");
  }
  const writers = writes(source);
  if (JSON.stringify(writers) !== JSON.stringify({ "stage-promotion": ["contents"], "publish-promotion": ["contents"] })) {
    throw new Error(`write permissions are ${JSON.stringify(writers)}`);
  }

  const admit = jobBlock(source, "admit-promotion");
  if (/environment:/.test(jobHeader(source, "admit-promotion"))) throw new Error("admission sits in an environment");
  const admitSteps = steps(admit);
  if (!admit.includes('DISPATCH_REF" == "refs/heads/main"')) throw new Error("admission does not require a dispatch from main");
  for (const [label, pattern] of [
    ["tag admission", /pnpm desktop:release-promote -- .*--from="\$BETA_TAG" --mode=admit --github-output/],
    ["complete beta", /pnpm desktop:verify-download -- .*--tag="\$BETA_TAG" --beta/],
    ["free stable slot", /pnpm desktop:release-slot -- /],
    ["browser gate", /pnpm desktop:release-browser-gate -- .*--sha="\$RELEASE_SHA"/],
    ["download facts", /pnpm download:release-facts:check/],
  ] as const) {
    indexOfStep(admitSteps, pattern, label);
  }
  if (/continue-on-error/.test(admit)) throw new Error("an admission step may continue on error");
  if (/^\s+if:/m.test(admit)) throw new Error("an admission step or the admission job is conditional, so it can be skipped");

  const stage = jobBlock(source, "stage-promotion");
  if (!/^    needs: admit-promotion$/m.test(stage)) throw new Error("staging does not wait for admission");
  const stageSteps = steps(stage);
  const stagePin = indexOfStep(stageSteps, PIN, "staging pin");
  if (/^        if:/m.test(stageSteps[stagePin].body)) throw new Error("the staging pin is conditional");
  const promote = indexOfStep(stageSteps, /pnpm desktop:release-promote -- .*--mode=stage/, "staging");
  const draftCheck = indexOfStep(stageSteps, /--allow-draft --require-updater/, "draft check");
  if (!(stagePin < promote && promote < draftCheck)) throw new Error("staging steps are out of order");

  const publishHeader = jobHeader(source, "publish-promotion");
  if (!/^    environment: release\s*$/m.test(publishHeader)) throw new Error("publication is not behind the release environment");
  if (!/^    needs: \[admit-promotion, stage-promotion\]$/m.test(publishHeader)) throw new Error("publication does not wait for staging");
  const publishSteps = steps(jobBlock(source, "publish-promotion"));
  const publishPin = indexOfStep(publishSteps, PIN, "publication pin recheck");
  if (/^        if:/m.test(publishSteps[publishPin].body)) throw new Error("the publication pin recheck is conditional");
  const compare = indexOfStep(publishSteps, /pnpm desktop:release-promote -- .*--from="\$BETA_TAG" --mode=verify/, "draft comparison");
  const publish = indexOfStep(publishSteps, /gh release edit "\$\{RELEASE_TAG\}" .*--draft=false --prerelease=false/, "publication");
  const verify = indexOfStep(publishSteps, /--tag="\$\{RELEASE_TAG\}" --require-updater/, "public check");
  const afterPin = publishSteps.findIndex((step, index) => index > publish && PIN.test(step.body));
  if (!(publishPin < publish && compare < publish && publish < verify)) {
    throw new Error("the pin recheck and the draft comparison must precede publication, and verification follow it");
  }
  if (afterPin < 0) throw new Error("no pin recheck follows publication");
  for (const index of [publishPin, compare, afterPin]) {
    if (/^        if:/m.test(publishSteps[index].body)) throw new Error(`publication step "${publishSteps[index].name}" is conditional`);
  }
}

describe("promote-release.yml", () => {
  const workflow = readFileSync(WORKFLOW, "utf8");

  it("publishes a beta's bytes from main, behind approval, with no build, secret or tag write", () => {
    expect(() => assertPromotionWorkflow(workflow)).not.toThrow();
  });

  const probes: [string, string, string][] = [
    ["environment: release leaves the publish job", "    environment: release\n", ""],
    ["the pin recheck is switched off", "      - name: Recheck both tags after publication approval\n", "      - name: Recheck both tags after publication approval\n        if: ${{ false }}\n"],
    ["a signing secret is named", "  BETA_TAG: ${{ inputs.beta_tag }}\n", "  BETA_TAG: ${{ inputs.beta_tag }}\n  KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}\n"],
    ["a build step appears", "      - name: Create the stable draft from the beta's checked assets\n", "      - name: Rebuild\n        run: pnpm desktop:release-artifact -- --phase=build\n\n      - name: Create the stable draft from the beta's checked assets\n"],
    ["the admission gains a write token", "    permissions:\n      actions: read\n      contents: read\n", "    permissions:\n      actions: read\n      contents: write\n"],
    ["the browser gate leaves admission", "        run: pnpm desktop:release-browser-gate", "        run: echo skipped"],
    ["the browser gate is switched off", "      - name: Require a whole green browser run on the release commit\n", "      - name: Require a whole green browser run on the release commit\n        if: ${{ false }}\n"],
    ["the completeness check is switched off", "      - name: Verify the beta release is complete\n", "      - name: Verify the beta release is complete\n        if: ${{ false }}\n"],
    ["the staging pin is switched off", "      - name: Recheck both tags before staging\n", "      - name: Recheck both tags before staging\n        if: ${{ false }}\n"],
    ["the draft comparison leaves publication", "        run: pnpm desktop:release-promote -- --repo=\"$GITHUB_REPOSITORY\" --from=\"$BETA_TAG\" --mode=verify\n", "        run: echo skipped\n"],
    ["the post-publication pin recheck is switched off", "      - name: Recheck both tags after publication\n", "      - name: Recheck both tags after publication\n        if: ${{ false }}\n"],
    ["a push trigger is added", "on:\n  workflow_dispatch:\n", "on:\n  push:\n    tags: ['v*']\n  workflow_dispatch:\n"],
  ];

  for (const [label, from, to] of probes) {
    it(`probe: turns red when ${label}`, () => {
      expect(workflow.includes(from), `probe anchor for "${label}" is gone`).toBe(true);
      expect(() => assertPromotionWorkflow(workflow.replace(from, to))).toThrow();
    });
  }
  it("probe: turns red when the pin recheck leaves the publish job", () => {
    const step = /      - name: Recheck both tags after publication approval\n[\s\S]*?(?=      - name: )/.exec(workflow);
    expect(step, "probe anchor for the publication pin recheck is gone").not.toBeNull();
    expect(() => assertPromotionWorkflow(workflow.replace(step![0], ""))).toThrow(/pin recheck/);
  });
});
