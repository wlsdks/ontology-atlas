import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { WHOLE_RUN_TITLE } from "../../../scripts/desktop-release/check-release-browser-gate.mjs";

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

describe("the browser gate can tell a whole run after its artifacts expire", () => {
  it("e2e.yml titles a scheduled run and a dispatch with no plan_from as whole, and nothing else", () => {
    const e2e = readFileSync(".github/workflows/e2e.yml", "utf8");
    const runName = /^run-name: "(.+)"$/m.exec(e2e)?.[1] ?? "";
    expect(runName).toBe(
      `\${{ (github.event_name == 'schedule' || (github.event_name == 'workflow_dispatch' && inputs.plan_from == '')) && '${WHOLE_RUN_TITLE}' || '' }}`,
    );
  });
});

/**
 * A beta and the stable promoted from it share `X.Y.Z`. The stable `latest.json` says `X.Y.Z+<12 hex>`
 * of the release commit and the app embeds its own commit, so an app on another beta of that version
 * is offered the stable. Both stable writers must stamp the commit, and both verifiers demand it.
 */
const PROMOTE_WORKFLOW = ".github/workflows/promote-release.yml";
const PROMOTE_SCRIPT = "scripts/desktop-release/promote-beta-release.mjs";

function assertCommitIdentity(files: Record<string, string>): void {
  const release = files[RELEASE_WORKFLOW];
  const stage = steps(jobBlock(release, "stage-macos"));
  const manifest = stepMatching(stage, /build-updater-manifest\.mjs/, "manifest step");
  requireCondition(manifest.step, STABLE, "the updater manifest");
  if (!manifest.step.body.includes('--commit="${RELEASE_SHA}"')) {
    throw new Error("the stable cut's manifest does not name the release commit");
  }
  const build = stepMatching(steps(jobBlock(release, "build-macos")), /desktop:release-artifact -- --phase=build/, "macOS build");
  if (!build.step.body.includes("ATLAS_BUILD_COMMIT: ${{ needs.admit-release.outputs.release_sha }}")) {
    throw new Error("the macOS build does not embed the release commit");
  }
  for (const [file, label] of [[RELEASE_WORKFLOW, "the cut"], [PROMOTE_WORKFLOW, "promotion"]] as const) {
    const checks = files[file].match(/desktop:verify-download -- .*--require-updater.*$/gm) ?? [];
    if (checks.length !== 2) throw new Error(`${label}: expected two updater checks, found ${checks.length}`);
    for (const check of checks) {
      if (!check.includes('--commit="${RELEASE_SHA}"')) throw new Error(`${label}: an updater check does not demand the release commit`);
    }
  }
  if (!files[PROMOTE_SCRIPT].includes("version: updaterManifestVersion(version, betaSha),")) {
    throw new Error("promotion's manifest does not name the beta commit");
  }
  const offer = files["src-tauri/src/update_offer.rs"];
  if (!offer.includes('option_env!("ATLAS_BUILD_COMMIT")')) throw new Error("the app does not read the embedded commit");
  if (!/\.default_version_comparator\(\|current, remote\| \{\s+update_offer::offers_update\(&current, &remote\.version\)/.test(files["src-tauri/src/lib.rs"])) {
    throw new Error("the updater does not use update_offer's comparator");
  }
}

describe("a stable release names its commit, so another beta of its version is offered it", () => {
  const files = Object.fromEntries(
    [RELEASE_WORKFLOW, PROMOTE_WORKFLOW, PROMOTE_SCRIPT, "src-tauri/src/update_offer.rs", "src-tauri/src/lib.rs"].map((file) => [
      file,
      readFileSync(file, "utf8"),
    ]),
  );

  it("holds in the cut, promotion and the app", () => {
    expect(() => assertCommitIdentity(files)).not.toThrow();
  });

  const probes: Array<[string, string, string, string]> = [
    ["the cut's manifest drops the commit", RELEASE_WORKFLOW, ' --commit="${RELEASE_SHA}" --repo=', " --repo="],
    ["the macOS build stops embedding the commit", RELEASE_WORKFLOW, "          ATLAS_BUILD_COMMIT: ${{ needs.admit-release.outputs.release_sha }}\n\n      # tar keeps", "\n      # tar keeps"],
    ["promotion's draft check drops the commit", PROMOTE_WORKFLOW, '--allow-draft --require-updater --commit="${RELEASE_SHA}"', "--allow-draft --require-updater"],
    ["promotion writes the plain version", PROMOTE_SCRIPT, "version: updaterManifestVersion(version, betaSha),", "version,"],
    ["the app keeps the default comparator", "src-tauri/src/lib.rs", ".default_version_comparator(", ".no_comparator("],
  ];
  for (const [label, file, anchor, planted] of probes) {
    it(`probe: turns red when ${label}`, () => {
      expect(files[file].split(anchor).length - 1).toBe(1);
      expect(() => assertCommitIdentity({ ...files, [file]: files[file].replace(anchor, planted) })).toThrow();
    });
  }
});
