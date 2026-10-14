import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RELEASE_WORKFLOW = ".github/workflows/release-macos.yml";
const GENERATED_FACTS = "src/views/download/model/macos-release.generated.ts";
const TEMP_FACTS = '"$RUNNER_TEMP/macos-release.generated.ts"';
const FACTS_ARTIFACT = "ontology-atlas-release-facts-${{ env.RELEASE_TAG }}";

type Step = { body: string; name: string; run: string };

function publishMacosJob(source: string): string {
  const heading = /^  publish-macos:\s*$/m.exec(source);
  expect(heading, `${RELEASE_WORKFLOW}: publish-macos job`).not.toBeNull();

  const afterHeading = source.slice(heading!.index + heading![0].length);
  const nextJob = /^  [A-Za-z0-9_-]+:\s*$/m.exec(afterHeading);
  return source.slice(heading!.index, nextJob ? heading!.index + heading![0].length + nextJob.index : source.length);
}

function steps(job: string): Step[] {
  const matches = [...job.matchAll(/^      - name: (.+?)\s*$/gm)];
  expect(matches.length, "publish-macos steps").toBeGreaterThan(0);

  return matches.map((match, index) => {
    const body = job.slice(match.index, matches[index + 1]?.index ?? job.length);
    const runMatch = /^        run:\s*(.*)$/m.exec(body);
    if (!runMatch) return { name: match[1], body, run: "" };

    if (runMatch[1] !== "|") return { name: match[1], body, run: runMatch[1] };
    const runStart = runMatch.index + runMatch[0].length;
    const runLines = body.slice(runStart).split("\n");
    const run = runLines
      .filter((line) => !line.trim() || line.search(/\S/) > 8)
      .map((line) => line.replace(/^ {10}/, ""))
      .join("\n");
    return { name: match[1], body, run };
  });
}

function stepWithRun(allSteps: Step[], pattern: RegExp): { index: number; step: Step } {
  const index = allSteps.findIndex((step) => pattern.test(step.run));
  expect(index, `step matching ${pattern}`).toBeGreaterThan(-1);
  return { index, step: allSteps[index] };
}

function stepWithBody(allSteps: Step[], pattern: RegExp): { index: number; step: Step } {
  const index = allSteps.findIndex((step) => pattern.test(step.body));
  expect(index, `step body matching ${pattern}`).toBeGreaterThan(-1);
  return { index, step: allSteps[index] };
}

function assertPublicationWriteBoundary(source: string): void {
  const job = publishMacosJob(source);
  const header = job.slice(0, job.indexOf("\n    steps:"));
  expect(header).toMatch(/^    environment: release\s*$/m);

  const allSteps = steps(job);
  const recheck = stepWithRun(allSteps, /desktop:release-source\s+--\s+--mode=pin\b/);
  const publish = stepWithRun(allSteps, /\bgh\s+release\s+edit\b/);
  const generate = stepWithRun(allSteps, /\bpnpm\s+download:release-facts\b/);
  const upload = stepWithBody(allSteps, /uses:\s*actions\/upload-artifact@/);
  const checkoutIndex = allSteps.findIndex((step) => /uses:\s*actions\/checkout@/.test(step.body));

  // `environment: release` gates this job; the admitted SHA is checked again before public release.
  expect(recheck.index).toBeLessThan(publish.index);
  expect(recheck.step.run).toMatch(/--tag="\$\{RELEASE_TAG\}"/);
  expect(recheck.step.run).toMatch(/--sha="\$\{RELEASE_SHA\}"/);

  // The generator runs at the admitted SHA and hands off exactly one inert file.
  expect(checkoutIndex).toBeGreaterThan(-1);
  expect(allSteps[checkoutIndex].body).toContain("ref: ${{ needs.admit-release.outputs.release_sha }}");
  expect(checkoutIndex).toBeLessThan(generate.index);
  expect(generate.index).toBeLessThan(upload.index);
  expect(generate.step.run).toContain(`cp ${GENERATED_FACTS} ${TEMP_FACTS}`);
  const copyAt = generate.step.run.indexOf(`cp ${GENERATED_FACTS} ${TEMP_FACTS}`);
  expect(generate.step.run.slice(copyAt)).not.toMatch(/\bgit\s+(?:switch|push)\b/);
  expect(upload.step.body).toContain(`name: ${FACTS_ARTIFACT}`);
  expect(upload.step.body).toContain("path: ${{ runner.temp }}/macos-release.generated.ts");
  expect(upload.step.body).toContain("if-no-files-found: error");
  expect(upload.step.body).toContain("retention-days: 7");

  // Protected main is never mutated from the release token. A locally authenticated
  // operator consumes the artifact in a normal PR, whose merge triggers Pages.
  const afterGenerate = allSteps.slice(generate.index + 1).map((step) => step.body).join("\n");
  expect(afterGenerate).not.toMatch(/\bgit\s+(?:switch|push)\b/);
  expect(afterGenerate).not.toMatch(/\bgh\s+pr\b/);
  expect(afterGenerate).not.toMatch(/\bgh\s+workflow\s+run\s+deploy-pages\.yml\b/);
}

describe("release facts publication write boundary", () => {
  const workflow = readFileSync(RELEASE_WORKFLOW, "utf8");

  it("generates admitted facts and uploads the one-file protected-main handoff", () => {
    assertPublicationWriteBoundary(workflow);
  });

  it("probe: rejects a release-token direct push to protected main", () => {
    const defect = workflow.replace(
      `cp ${GENERATED_FACTS} ${TEMP_FACTS}`,
      `cp ${GENERATED_FACTS} ${TEMP_FACTS}\n          git push origin HEAD:main`,
    );
    expect(() => assertPublicationWriteBoundary(defect)).toThrow();
  });

  it("probe: rejects uploading a broad workspace instead of the one generated file", () => {
    const defect = workflow.replace(
      "path: ${{ runner.temp }}/macos-release.generated.ts",
      "path: .",
    );
    expect(() => assertPublicationWriteBoundary(defect)).toThrow();
  });
});
