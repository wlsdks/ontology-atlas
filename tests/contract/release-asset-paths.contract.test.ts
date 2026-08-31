import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

import {
  artifactNameForArch,
  stageReleaseAssets,
} from "../../scripts/stage-macos-release-assets.mjs";
import { stageWindowsReleaseAssets } from "../../scripts/stage-windows-release-assets.mjs";
import {
  buildManifest,
  findUpdaterArtifacts,
  resolveArchDir,
} from "../../scripts/build-updater-manifest.mjs";

/**
 * Locks the **path contract** for release assets.
 *
 * This defect lived somewhere only CI could reproduce — it took three tags to find.
 * Both build jobs passed signing, notarisation, and Gatekeeper verification, and
 * staging then stopped with "architectures with no updater artifact: aarch64, x64",
 * because the producing side and the consuming side did not know each other's path
 * rules.
 *
 * So this test **reproduces the real layout**: it runs the actual staging script to
 * produce the artifacts, recreates the folder structure `download-artifact` builds,
 * and applies **the glob strings read from the workflow** on top of it. Copying the
 * globs here would let the copy drift — reproducing passing tests and failing
 * releases.
 */

const WORKFLOW_PATH = ".github/workflows/release-macos.yml";
const workflow = readFileSync(WORKFLOW_PATH, "utf-8");

const buildJob = section(workflow, "  build-macos:", "  stage-macos:");
const stageJob = section(workflow, "  stage-macos:", "  publish-macos:");
const publishJob = section(workflow, "  publish-macos:", null);

function section(source: string, from: string, to: string | null): string {
  const start = source.indexOf(from);
  const end = to ? source.indexOf(to) : source.length;
  return source.slice(start, end === -1 ? source.length : end);
}

/** Slices one step out by name, up to the next `- name:`. */
function step(job: string, name: string): string {
  const lines = job.split("\n");
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  expect(start, `${name} 스텝을 찾지 못했다`).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\s*- name:/.test(line));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join("\n");
}

/** The value of a `key: value` or `key: |` block as a list. Comment lines are not values. */
function yamlValues(block: string, key: string): string[] {
  const lines = block.split("\n");
  const index = lines.findIndex((line) => new RegExp(`^\\s*${key}:`).test(line));
  if (index === -1) return [];
  const inline = lines[index].slice(lines[index].indexOf(":") + 1).trim();
  if (inline && inline !== "|") return [inline];

  const indent = lines[index].search(/\S/);
  const values: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (!line.trim()) continue;
    if (line.search(/\S/) <= indent) break;
    if (line.trim().startsWith("#")) continue;
    values.push(line.trim());
  }
  return values;
}

/** Exactly the names Tauri emits — spaces and missing architecture included. */
function fakeBundle(root: string, version: string, arch: string): string {
  const bundleDir = join(root, arch, "bundle");
  mkdirSync(join(bundleDir, "dmg"), { recursive: true });
  mkdirSync(join(bundleDir, "macos", "Ontology Atlas.app"), { recursive: true });
  const dmg = `ontology-atlas_${version}_${arch}.dmg`;
  writeFileSync(join(bundleDir, "dmg", dmg), `dmg-${arch}`);
  writeFileSync(join(bundleDir, "dmg", `${dmg}.sha256`), `${"a".repeat(64)}  ${dmg}\n`);
  writeFileSync(join(bundleDir, "macos", "Ontology Atlas.app.tar.gz"), `archive-${arch}`);
  writeFileSync(join(bundleDir, "macos", "Ontology Atlas.app.tar.gz.sig"), `sig-${arch}\n`);
  // Cargo writes the packed dSYM one level above `bundle/`, beside the binary; the stager
  // derives that folder from the bundle path, so the replay must lay it out the same way.
  mkdirSync(join(root, arch, "ontology-atlas.dSYM", "Contents", "Resources", "DWARF"), {
    recursive: true,
  });
  writeFileSync(
    join(root, arch, "ontology-atlas.dSYM", "Contents", "Resources", "DWARF", "ontology-atlas"),
    `dwarf-${arch}`,
  );
  return bundleDir;
}

const VERSION = "1.0.0-rc.5";
const TAG = `v${VERSION}`;
const REPO = "wlsdks/ontology-atlas";
const scratch = mkdtempSync(join(tmpdir(), "oa-release-paths-"));

/**
 * Builds exactly what the workflow builds: runs staging per architecture and places
 * the results where `download-artifact` (`merge-multiple: false`) puts them.
 */
function replayDownloadRoot(arches: string[]): { root: string; staged: Map<string, string[]> } {
  const home = mkdtempSync(join(scratch, "run-"));
  const root = join(home, "release-assets");
  mkdirSync(root, { recursive: true });
  const staged = new Map<string, string[]>();
  for (const arch of arches) {
    const bundleDir = fakeBundle(home, VERSION, arch);
    const result = stageReleaseAssets({
      bundleDir,
      outDir: join(root, artifactNameForArch(arch)),
      expectArch: arch,
    });
    staged.set(arch, result.files);
  }
  return { root, staged };
}

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("릴리스 자산 경로 계약", () => {
  it("업로드 경로는 하나다 — 여럿이면 루트를 우리가 정하지 못한다", () => {
    // Given several paths, `upload-artifact` takes the least common ancestor as the
    // root. On v1.0.0-rc.1 that root became `bundle/`, adding an extra `dmg/` and
    // `macos/` level, and the downloading side had no way to know that depth.
    const upload = step(buildJob, "Upload workflow artifact");
    expect(yamlValues(upload, "path")).toEqual(["release-upload"]);
    expect(yamlValues(upload, "name")).toEqual(["ontology-atlas-macos-${{ matrix.arch }}"]);
    expect(buildJob).toContain("node scripts/stage-macos-release-assets.mjs");
  });

  it("아티팩트 폴더 이름이 아치를 나른다", () => {
    // On download, the folder is the only thing separating the two architectures.
    const uploadName = yamlValues(step(buildJob, "Upload workflow artifact"), "name")[0];
    for (const arch of ["aarch64", "x64"]) {
      expect(uploadName.replace("${{ matrix.arch }}", arch)).toBe(artifactNameForArch(arch));
    }
  });

  it("매니페스트 빌더가 실제 레이아웃에서 두 아치를 찾는다", () => {
    const { root } = replayDownloadRoot(["aarch64", "x64"]);
    const platforms: Record<string, { archiveName: string; signature: string }> = {};
    for (const arch of ["aarch64", "x64"]) {
      const found = findUpdaterArtifacts(resolveArchDir(root, arch));
      expect(found, `${arch} 의 업데이터 아티팩트를 찾지 못했다`).not.toBeNull();
      platforms[arch] = {
        archiveName: found!.archiveName,
        signature: readFileSync(found!.signaturePath, "utf8").trim(),
      };
    }
    expect(platforms.aarch64.archiveName).not.toBe(platforms.x64.archiveName);
    expect(platforms.aarch64.signature).toBe("sig-aarch64");
    expect(platforms.x64.signature).toBe("sig-x64");
  });

  it("아치 하나가 빠지면 반쪽짜리로 나가지 않는다", () => {
    // Shipping only one leaves users on that architecture permanently without updates —
    // and with no error.
    const { root } = replayDownloadRoot(["aarch64"]);
    expect(resolveArchDir(root, "x64")).toBeNull();

    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        buildManifest({
          version: VERSION,
          notes: "",
          pubDate: "2026-07-27T00:00:00Z",
          repo: REPO,
          tag: TAG,
          platforms: { aarch64: { archiveName: "a.app.tar.gz", signature: "sig" } },
        }),
      ).toThrow(/exit 1/);
      expect(error.mock.calls.join(" ")).toMatch(/x64/);
    } finally {
      exit.mockRestore();
      error.mockRestore();
    }
  });

  it("릴리스 업로드 글롭이 실제 레이아웃의 모든 자산에 매칭된다", () => {
    // The globs are read from the workflow. A copy here would drift.
    const globs = yamlValues(step(stageJob, "Upload draft GitHub Release assets"), "files");
    expect(globs.length).toBeGreaterThan(0);

    const { root, staged } = replayDownloadRoot(["aarch64", "x64"]);
    const cwd = join(root, "..");
    writeFileSync(join(root, "latest.json"), "{}\n");

    const windowsBundle = join(cwd, "windows-bundle");
    mkdirSync(join(windowsBundle, "nsis"), { recursive: true });
    writeFileSync(
      join(windowsBundle, "nsis", "Ontology Atlas_1.0.0_x64-setup.exe"),
      "windows",
    );
    const windows = stageWindowsReleaseAssets({
      bundleDir: windowsBundle,
      outDir: join(root, "windows"),
      version: VERSION,
    });

    const expected = new Set<string>(["release-assets/latest.json"]);
    for (const [arch, files] of staged) {
      for (const file of files) {
        expected.add(`release-assets/${artifactNameForArch(arch)}/${file}`);
      }
    }
    for (const file of windows.files) expected.add(`release-assets/windows/${file}`);

    const matched = new Set<string>();
    for (const glob of globs) {
      const hits = globSync(glob, { cwd }).map((hit) => hit.split("\\").join("/"));
      // A glob that matches nothing is a misunderstanding, not a contract.
      expect(hits, `${glob} 이 아무 자산도 잡지 못했다`).not.toHaveLength(0);
      for (const hit of hits) matched.add(hit);
    }

    expect([...matched].sort()).toEqual([...expected].sort());
  });

  it("스테이징 잡은 아치별 폴더로 내려받는다", () => {
    const download = step(stageJob, "Download macOS artifacts");
    expect(yamlValues(download, "merge-multiple")).toEqual(["false"]);
    expect(yamlValues(download, "path")).toEqual(["release-assets"]);
  });

  it("발행 잡의 요약 글롭도 자기 레이아웃에 맞는다", () => {
    // This job downloads flat with `merge-multiple: true` — the eight assets only avoid
    // collisions after staging puts the version and architecture in the names.
    expect(yamlValues(step(publishJob, "Download macOS artifacts"), "merge-multiple")).toEqual([
      "true",
    ]);
    const summaryGlob = publishJob.match(/for dmg in (\S+); do/)?.[1];
    expect(summaryGlob).toBeTruthy();

    const { root, staged } = replayDownloadRoot(["aarch64", "x64"]);
    const merged = mkdtempSync(join(scratch, "merged-"));
    const flat = join(merged, "release-assets");
    mkdirSync(flat, { recursive: true });
    const names = new Set<string>();
    for (const [arch, files] of staged) {
      for (const file of files) {
        // Colliding names silently overwrite one another — caught before the merge.
        expect(names.has(file), `${file} 이름이 두 아치에서 겹친다`).toBe(false);
        names.add(file);
        writeFileSync(
          join(flat, file),
          readFileSync(join(root, artifactNameForArch(arch), file)),
        );
      }
    }
    expect(globSync(summaryGlob!, { cwd: merged })).toHaveLength(2);
  });

  it("latest.json 의 URL 이 실제로 올라가는 자산 이름과 같다", () => {
    // The updater downloads from this URL. When it is wrong the 404 is shown as "no
    // update" and the user never finds out.
    const { root, staged } = replayDownloadRoot(["aarch64", "x64"]);
    const platforms: Record<string, { archiveName: string; signature: string }> = {};
    for (const arch of ["aarch64", "x64"]) {
      const found = findUpdaterArtifacts(resolveArchDir(root, arch))!;
      platforms[arch] = {
        archiveName: found.archiveName,
        signature: readFileSync(found.signaturePath, "utf8").trim(),
      };
    }
    const manifest = buildManifest({
      version: VERSION,
      notes: "",
      pubDate: "2026-07-27T00:00:00Z",
      repo: REPO,
      tag: TAG,
      platforms,
    });

    const uploaded = new Set([...staged.values()].flat());
    const urls = (Object.values(manifest.platforms) as { url: string }[]).map(
      (platform) => platform.url,
    );
    expect(new Set(urls).size).toBe(2);
    for (const url of urls) {
      const name = decodeURIComponent(url.split("/").pop() ?? "");
      expect(uploaded.has(name)).toBe(true);
      // GitHub replaces spaces in asset names with dots. A remaining space makes the URL
      // written here diverge from the real asset.
      expect(name).not.toMatch(/\s/);
      expect(url).toBe(encodeURI(url));
      expect(url.startsWith(`https://github.com/${REPO}/releases/download/${TAG}/`)).toBe(true);
    }
  });
});
