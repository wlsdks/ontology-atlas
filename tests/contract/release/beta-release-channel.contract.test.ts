import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A `vX.Y.Z-beta.N` tag never writes `latest.json` and never writes `/download`. In the cut that
 * holds as workflow conditions on the channel `admit-release` reads from the tag; this file pins
 * each one and proves, by planting its removal, that it would notice.
 */

const RELEASE_WORKFLOW = ".github/workflows/release-macos.yml";
const STABLE = "${{ needs.admit-release.outputs.release_channel == 'stable' }}";
const BETA = "${{ needs.admit-release.outputs.release_channel == 'beta' }}";

type Step = { name: string; body: string; condition: string | null };

function jobBlock(source: string, job: string): string {
  const heading = new RegExp(`^  ${job}:\\s*$`, "m").exec(source);
  if (!heading) throw new Error(`${RELEASE_WORKFLOW}: job ${job} is missing`);
  const after = source.slice(heading.index + heading[0].length);
  const next = /^  [A-Za-z0-9_-]+:\s*$/m.exec(after);
  return source.slice(heading.index, next ? heading.index + heading[0].length + next.index : source.length);
}

function steps(job: string): Step[] {
  const starts = [...job.matchAll(/^      - name: (.+?)\s*$/gm)];
  if (starts.length === 0) throw new Error("no steps parsed");
  return starts.map((match, index) => {
    const body = job.slice(match.index, starts[index + 1]?.index ?? job.length);
    return { name: match[1], body, condition: /^        if: (.+)$/m.exec(body)?.[1]?.trim() ?? null };
  });
}

function stepMatching(all: Step[], pattern: RegExp, label: string): { index: number; step: Step } {
  const found = all.filter((step) => pattern.test(step.body));
  if (found.length !== 1) throw new Error(`${label}: expected one step matching ${pattern}, found ${found.length}`);
  return { index: all.indexOf(found[0]), step: found[0] };
}

function requireCondition(step: Step, condition: string, label: string): void {
  if (step.condition !== condition) {
    throw new Error(`${label} ("${step.name}") must run only when ${condition}, has ${step.condition ?? "no condition"}`);
  }
}

function assertBetaChannel(source: string): void {
  const admit = jobBlock(source, "admit-release");
  if (!admit.includes("release_channel: ${{ steps.tag.outputs.channel }}")) {
    throw new Error("admit-release does not output the channel the tag step read");
  }
  stepMatching(steps(admit), /id: tag\n\s+run: pnpm desktop:release-tag -- --tag="\$RELEASE_TAG" --github-output/, "tag step");

  const stage = steps(jobBlock(source, "stage-macos"));
  const manifest = stepMatching(stage, /build-updater-manifest\.mjs/, "manifest step");
  requireCondition(manifest.step, STABLE, "the updater manifest");

  const refuse = stepMatching(stage, /-e release-assets\/latest\.json/, "beta manifest refusal");
  requireCondition(refuse.step, "${{ needs.admit-release.outputs.release_channel != 'stable' }}", "the beta manifest refusal");
  if (!/exit 1/.test(refuse.step.body)) throw new Error("the beta manifest refusal does not fail");

  const upload = stepMatching(stage, /softprops\/action-gh-release@/, "draft upload");
  if (!upload.step.body.includes(`prerelease: ${BETA}`)) {
    throw new Error("the draft upload does not mark a beta as a GitHub pre-release");
  }
  if (!(refuse.index < upload.index && manifest.index < upload.index)) {
    throw new Error("the manifest is built or refused after the upload");
  }
  requireCondition(stepMatching(stage, /--allow-draft --require-updater/, "stable draft check").step, STABLE, "the stable draft check");
  requireCondition(stepMatching(stage, /--allow-draft --beta/, "beta draft check").step, BETA, "the beta draft check");

  const publish = steps(jobBlock(source, "publish-macos"));
  const gate = stepMatching(publish, /pnpm desktop:release-browser-gate -- /, "browser gate");
  requireCondition(gate.step, STABLE, "the browser gate");
  if (/continue-on-error/.test(gate.step.body)) throw new Error("the browser gate may not continue on error");
  if (!gate.step.body.includes('--sha="${RELEASE_SHA}"')) throw new Error("the browser gate must read the release commit");

  const stablePublish = stepMatching(publish, /--draft=false --prerelease=false/, "stable publication");
  requireCondition(stablePublish.step, STABLE, "the stable publication");
  const betaPublish = stepMatching(publish, /--draft=false --prerelease=true/, "beta publication");
  requireCondition(betaPublish.step, BETA, "the beta publication");
  if (!(gate.index < stablePublish.index)) throw new Error("the browser gate runs after the stable publication");

  requireCondition(stepMatching(publish, /pnpm download:release-facts -- /, "facts generation").step, STABLE, "the download facts");
  requireCondition(stepMatching(publish, /name: ontology-atlas-release-facts-/, "facts handoff").step, STABLE, "the facts handoff");
  requireCondition(stepMatching(publish, /--tag="\$\{RELEASE_TAG\}" --require-updater/, "public stable check").step, STABLE, "the public stable check");
  requireCondition(stepMatching(publish, /--tag="\$\{RELEASE_TAG\}" --beta/, "public beta check").step, BETA, "the public beta check");
}

describe("a beta release never writes the updater feed or /download", () => {
  const workflow = readFileSync(RELEASE_WORKFLOW, "utf8");

  it("holds every channel condition in the cut", () => {
    expect(() => assertBetaChannel(workflow)).not.toThrow();
  });

  const probes: [string, string, string][] = [
    ["the manifest step loses its channel condition", `        if: ${STABLE}\n        run: |\n          node scripts/desktop-release/build-updater-manifest.mjs`, "        run: |\n          node scripts/desktop-release/build-updater-manifest.mjs"],
    ["the draft is no longer a pre-release on a beta", `prerelease: ${BETA}`, "prerelease: false"],
    ["the beta manifest refusal is dropped", "      - name: Refuse an updater manifest on a beta release\n", "      - name: Refuse an updater manifest on a beta release\n        continue-on-error: true\n        if: ${{ false }}\n"],
    ["the beta publishes as a stable release", "--draft=false --prerelease=true", "--draft=false --prerelease=false"],
    ["the download facts run on a beta", `        if: ${STABLE}\n        run: |\n          pnpm download:release-facts`, "        run: |\n          pnpm download:release-facts"],
    ["the browser gate is skipped", `        if: ${STABLE}\n        run: pnpm desktop:release-browser-gate`, "        if: ${{ false }}\n        run: pnpm desktop:release-browser-gate"],
  ];

  for (const [label, from, to] of probes) {
    it(`probe: turns red when ${label}`, () => {
      expect(workflow.includes(from), `probe anchor for "${label}" is gone`).toBe(true);
      expect(() => assertBetaChannel(workflow.replace(from, to))).toThrow();
    });
  }
});
