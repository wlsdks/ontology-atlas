import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RELEASE_WORKFLOW = ".github/workflows/release-macos.yml";
const GENERATED_FACTS = "src/views/download/model/macos-release.generated.ts";
const TEMP_FACTS = '"$RUNNER_TEMP/macos-release.generated.ts"';

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

function executableLines(script: string): string[] {
  return script
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function assertPublicationWriteBoundary(source: string): void {
  const job = publishMacosJob(source);
  const header = job.slice(0, job.indexOf("\n    steps:"));
  expect(header).toMatch(/^    environment: release\s*$/m);

  const allSteps = steps(job);
  const recheck = stepWithRun(allSteps, /desktop:release-source\s+--\s+--mode=pin\b/);
  const publish = stepWithRun(allSteps, /\bgh\s+release\s+edit\b/);
  const generate = stepWithRun(allSteps, /\bpnpm\s+download:release-facts\b/);
  const refresh = stepWithRun(allSteps, /\bgit\s+switch\s+-C\s+release-facts-update\s+origin\/main\b/);
  const checkoutIndex = allSteps.findIndex((step) => /uses:\s*actions\/checkout@/.test(step.body));

  // `environment: release` gates this job; the admitted SHA is checked again before public release.
  expect(recheck.index).toBeLessThan(publish.index);
  expect(recheck.step.run).toMatch(/--tag="\$\{RELEASE_TAG\}"/);
  expect(recheck.step.run).toMatch(/--sha="\$\{RELEASE_SHA\}"/);

  // The generator runs before any main checkout and bridges its one output through RUNNER_TEMP.
  expect(checkoutIndex).toBeGreaterThan(-1);
  expect(allSteps[checkoutIndex].body).toContain("ref: ${{ needs.admit-release.outputs.release_sha }}");
  expect(checkoutIndex).toBeLessThan(generate.index);
  expect(generate.index).toBeLessThan(refresh.index);
  expect(allSteps.slice(0, refresh.index).map((step) => step.body).join("\n")).not.toMatch(/\bgit\s+switch\b/);
  expect(generate.step.run).toContain(`cp ${GENERATED_FACTS} ${TEMP_FACTS}`);

  const switchAt = refresh.step.run.search(/\bgit\s+switch\s+-C\s+release-facts-update\s+origin\/main\b/);
  const afterSwitchRuns = [refresh.step.run.slice(switchAt), ...allSteps.slice(refresh.index + 1).map((step) => step.run)]
    .map(executableLines)
    .flat();
  const copiedFiles = afterSwitchRuns.filter((line) => line.startsWith("cp "));
  expect(copiedFiles).toEqual([`cp ${TEMP_FACTS} ${GENERATED_FACTS}`]);

  const repoRuntime = afterSwitchRuns.filter((line) => /\b(?:pnpm|node|npm|yarn)\b/.test(line));
  expect(repoRuntime).toEqual([]);

  const refreshLines = executableLines(refresh.step.run);
  const copyAt = refreshLines.indexOf(`cp ${TEMP_FACTS} ${GENERATED_FACTS}`);
  const addAt = refreshLines.indexOf(`git add ${GENERATED_FACTS}`);
  const commitAt = refreshLines.findIndex((line) => line.startsWith("git commit "));
  const pushAt = refreshLines.findIndex((line) => line.startsWith("git push "));
  expect(copyAt).toBeGreaterThan(-1);
  expect(addAt).toBeGreaterThan(copyAt);
  expect(commitAt).toBeGreaterThan(addAt);
  expect(pushAt).toBeGreaterThan(commitAt);
}

describe("release facts publication write boundary", () => {
  const workflow = readFileSync(RELEASE_WORKFLOW, "utf8");

  it("generates admitted facts, crosses main through RUNNER_TEMP, then writes only that file", () => {
    assertPublicationWriteBoundary(workflow);
  });

  it("probe: rejects a repository runtime command after the main switch", () => {
    const defect = workflow.replace(
      `cp ${TEMP_FACTS} ${GENERATED_FACTS}`,
      `pnpm download:release-facts\n          cp ${TEMP_FACTS} ${GENERATED_FACTS}`,
    );
    expect(() => assertPublicationWriteBoundary(defect)).toThrow();
  });
});
